// @ts-check
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { execSync } from "node:child_process";

const sdkFolder = path.join(import.meta.dirname, "../src/third-party/protools-sdk");
const protoPath = path.join(sdkFolder, "PTSL.proto");
const distFolder = path.join(sdkFolder, "dist");

if (!(await fs.stat(protoPath).catch(() => null))) {
	console.log(
		"Please download the Avid Pro Tools SDK from https://developer.avid.com/scripting/ and copy the PTSL.proto from Source/PTSL.proto to src/third-party/protools-sdk/PTSL.proto",
	);
	process.exit(1);
}

await fs.rm(distFolder, { recursive: true, force: true });
await fs.mkdir(distFolder, { recursive: true });

try {
	execSync(
		`./node_modules/.bin/grpc_tools_node_protoc \
		--plugin=protoc-gen-ts_proto=./node_modules/.bin/protoc-gen-ts_proto \
		--ts_proto_out=${distFolder} \
		--ts_proto_opt=outputServices=nice-grpc,outputServices=generic-definitions,useExactTypes=false,snakeToCamel=keys,protoJsonFormat=false \
		--proto_path=${sdkFolder} \
		${protoPath}`,
	);
} catch (e) {
	console.log(e.stderr.toString());
	process.exit(1);
}
