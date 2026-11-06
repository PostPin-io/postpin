import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import pg from "pg";
import type { TestProject } from "vitest/node";

const sharedDir = fileURLToPath(new URL("../../../shared", import.meta.url));
const rootEnv = fileURLToPath(new URL("../../../../.env", import.meta.url));

/**
 * TEST_DATABASE_URL if set (CI), otherwise DATABASE_URL from the root .env
 * with the database renamed to postpin_test (or TEST_DATABASE_NAME, so several
 * runs can work in parallel). Never the dev database.
 */
function testDatabaseUrl() {
	if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;
	const env = readFileSync(rootEnv, "utf-8");
	const dev = env.match(/^DATABASE_URL=["']?([^"'\n]+)/m)?.[1];
	if (!dev) throw new Error("Set TEST_DATABASE_URL or DATABASE_URL in the root .env");
	const url = new URL(dev);
	url.pathname = `/${process.env.TEST_DATABASE_NAME ?? "postpin_test"}`;
	return url.toString();
}

export default async function setup(project: TestProject) {
	const url = testDatabaseUrl();
	if (!new URL(url).pathname.includes("test")) {
		throw new Error(`Refusing to run against ${url}: database name must contain "test"`);
	}

	// Create the database if it doesn't exist yet
	const admin = new URL(url);
	admin.pathname = "/postgres";
	const client = new pg.Client({ connectionString: admin.toString() });
	await client.connect();
	const name = new URL(url).pathname.slice(1);
	const { rowCount } = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [name]);
	if (!rowCount) await client.query(`CREATE DATABASE "${name}"`);
	await client.end();

	execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy", "--config", "prisma7.config.ts"], {
		cwd: sharedDir,
		env: { ...process.env, DATABASE_URL: url },
		stdio: "pipe",
	});

	project.provide("databaseUrl", url);
}

declare module "vitest" {
	export interface ProvidedContext {
		databaseUrl: string;
	}
}
