// @ts-check
// Uploads PTSL.proto as the GitHub Actions secret PTSL_PROTO_B64 (decoded by .github/actions/setup).
//
// The proto is too large for a secret (48 KB limit), so comments and blank lines are stripped and
// the result is gzipped. Before uploading, ts-proto runs on both the original and the minified
// file, and the upload is aborted if the generated code differs apart from comments.
//
// Usage: node scripts/upload-ptsl-secret.mjs [--dry-run]
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import * as zlib from "node:zlib";
import { execFileSync, execSync } from "node:child_process";
import * as prettier from "prettier";

const SECRET_NAME = "PTSL_PROTO_B64";
const SECRET_LIMIT = 48 * 1024;
const dryRun = process.argv.includes("--dry-run");

const desktopDir = path.join(import.meta.dirname, "..");
const protoPath = path.join(desktopDir, "src/third-party/protools-sdk/PTSL.proto");

/** @param {string} source */
function minifyProto(source) {
	return source
		.replace(/\/\*[\s\S]*?\*\//g, "")
		.replace(/\/\/[^\n]*/g, "")
		.replace(/[ \t]+/g, " ")
		.replace(/^ /gm, "")
		.replace(/\n\s*\n+/g, "\n");
}

/**
 * Strips comments and blank lines from generated TS and reformats it, so only code is compared.
 * Without comments ts-proto wraps some union types differently, which prettier evens out.
 * @param {string} source
 */
async function codeOnly(source) {
	const stripped = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/[^\n]*$/gm, "");
	const formatted = await prettier.format(stripped, { parser: "typescript", printWidth: 1000 });
	return formatted.replace(/\n\s*\n/g, "\n");
}

/** Runs ts-proto with the same options as setup.mjs and returns the generated PTSL.ts. @param {string} protoFile */
async function generate(protoFile) {
	const outDir = await fs.mkdtemp(path.join(os.tmpdir(), "ptsl-gen-"));
	const args = [
		`--plugin=protoc-gen-ts_proto=${path.join(desktopDir, "node_modules/.bin/protoc-gen-ts_proto")}`,
		`--ts_proto_out=${outDir}`,
		"--ts_proto_opt=outputServices=nice-grpc,outputServices=generic-definitions,useExactTypes=false,snakeToCamel=keys,protoJsonFormat=false",
		`--proto_path=${path.dirname(protoFile)}`,
		protoFile,
	];
	try {
		execFileSync(path.join(desktopDir, "node_modules/.bin/grpc_tools_node_protoc"), args, {
			stdio: "pipe",
		});
	} catch {
		// grpc-tools only ships an x86_64 protoc (see setup.mjs)
		execFileSync("protoc", args, { stdio: "pipe" });
	}
	const generated = await fs.readFile(path.join(outDir, "PTSL.ts"), "utf8");
	await fs.rm(outDir, { recursive: true, force: true });
	return generated;
}

const original = await fs.readFile(protoPath, "utf8").catch(() => {
	console.error(`${protoPath} not found. See scripts/setup.mjs for where to get it.`);
	process.exit(1);
});
const minified = minifyProto(original);

const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "ptsl-min-"));
const minifiedPath = path.join(tmpDir, "PTSL.proto");
await fs.writeFile(minifiedPath, minified);
const [fromOriginal, fromMinified] = await Promise.all([
	generate(protoPath),
	generate(minifiedPath),
]);
await fs.rm(tmpDir, { recursive: true, force: true });

if ((await codeOnly(fromOriginal)) !== (await codeOnly(fromMinified))) {
	console.error(
		"Generated code differs between the original and the minified proto. minifyProto() probably broke something (e.g. a string containing //).",
	);
	process.exit(1);
}

const encoded = zlib.gzipSync(minified, { level: 9 }).toString("base64");
const kb = (/** @type {number} */ bytes) => `${(bytes / 1024).toFixed(1)} KB`;
console.log(
	`PTSL.proto: ${kb(original.length)} -> minified ${kb(minified.length)} -> gzip+base64 ${kb(encoded.length)} (limit ${kb(SECRET_LIMIT)})`,
);
console.log("Generated code is identical apart from comments.");

if (encoded.length > SECRET_LIMIT) {
	console.error(`Too large for a GitHub secret. Split it across two secrets.`);
	process.exit(1);
}

if (dryRun) {
	console.log(`Dry run, ${SECRET_NAME} not uploaded.`);
} else {
	execSync(`gh secret set ${SECRET_NAME}`, {
		input: encoded,
		stdio: ["pipe", "inherit", "inherit"],
	});
}
