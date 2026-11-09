import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { migrate } from "../../src/db/migrate.ts";

// Runs against a real Postgres: TEST_DATABASE_URL (CI) or the DATABASE_URL from the root .env,
// in a throwaway database that is recreated for every test.

const sharedDir = fileURLToPath(new URL("../..", import.meta.url));
const realMigrationsDir = path.join(sharedDir, "prisma/migrations");

function baseUrl() {
	if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;
	const env = fs.readFileSync(path.join(sharedDir, "../../.env"), "utf8");
	const url = env.match(/^DATABASE_URL=["']?([^"'\n]+)/m)?.[1];
	if (!url) throw new Error("Set TEST_DATABASE_URL or DATABASE_URL in the root .env");
	return url;
}

const databaseUrl = (() => {
	const url = new URL(baseUrl());
	url.pathname = "/postpin_migrator_test";
	return url.toString();
})();

async function admin<T>(fn: (client: pg.Client) => Promise<T>): Promise<T> {
	const url = new URL(databaseUrl);
	url.pathname = "/postgres";
	const client = new pg.Client({ connectionString: url.toString() });
	await client.connect();
	try {
		return await fn(client);
	} finally {
		await client.end();
	}
}

async function query<T extends pg.QueryResultRow>(sql: string, params: unknown[] = []) {
	const client = new pg.Client({ connectionString: databaseUrl });
	await client.connect();
	try {
		return (await client.query<T>(sql, params)).rows;
	} finally {
		await client.end();
	}
}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

let dir: string;
function addMigration(name: string, sql: string) {
	fs.mkdirSync(path.join(dir, name));
	fs.writeFileSync(path.join(dir, name, "migration.sql"), sql);
}

const log = vi.fn();
const run = () => migrate({ databaseUrl, migrationsDir: dir, log });

beforeEach(async () => {
	await admin(async (c) => {
		await c.query('DROP DATABASE IF EXISTS "postpin_migrator_test" WITH (FORCE)');
		await c.query('CREATE DATABASE "postpin_migrator_test"');
	});
	dir = fs.mkdtempSync(path.join(os.tmpdir(), "migrations-"));
	// Prisma keeps this file next to the migration folders
	fs.writeFileSync(path.join(dir, "migration_lock.toml"), 'provider = "postgresql"\n');
	log.mockReset();
});

afterEach(() => {
	fs.rmSync(dir, { recursive: true, force: true });
});

afterAll(async () => {
	await admin((c) => c.query('DROP DATABASE IF EXISTS "postpin_migrator_test" WITH (FORCE)'));
});

const CREATE_A = 'CREATE TABLE "a" ("id" int PRIMARY KEY);';
const CREATE_B = 'CREATE TABLE "b" ("id" int PRIMARY KEY);\nINSERT INTO "b" VALUES (1), (2);';

describe("migrate", () => {
	it("applies pending migrations in order and records them like Prisma", async () => {
		addMigration("20260102000000_b", CREATE_B);
		addMigration("20260101000000_a", CREATE_A);

		expect(await run()).toEqual(["20260101000000_a", "20260102000000_b"]);

		const rows = await query(
			`SELECT "migration_name", "checksum", "finished_at" IS NOT NULL AS "finished",
				"applied_steps_count" FROM "_prisma_migrations" ORDER BY "started_at"`,
		);
		expect(rows).toEqual([
			{
				migration_name: "20260101000000_a",
				checksum: sha256(CREATE_A),
				finished: true,
				applied_steps_count: 1,
			},
			{
				migration_name: "20260102000000_b",
				checksum: sha256(CREATE_B),
				finished: true,
				applied_steps_count: 1,
			},
		]);
		// both statements of the multi-statement file ran
		expect(await query('SELECT count(*)::int AS "n" FROM "b"')).toEqual([{ n: 2 }]);
	});

	it("does nothing when everything is applied", async () => {
		addMigration("20260101000000_a", CREATE_A);
		await run();
		expect(await run()).toEqual([]);
		expect(await query('SELECT 1 FROM "_prisma_migrations"')).toHaveLength(1);
	});

	it("rolls a failing migration back completely and names it", async () => {
		addMigration("20260101000000_a", CREATE_A);
		addMigration("20260102000000_broken", 'CREATE TABLE "c" ("id" int);\nSELECT * FROM "missing";');

		const error = await run().catch((e: Error) => e);
		expect(error).toBeInstanceOf(Error);
		expect((error as Error).message).toContain("20260102000000_broken");

		// the migration before it stays applied, the broken one left nothing behind
		const names = await query<{ migration_name: string }>(
			'SELECT "migration_name" FROM "_prisma_migrations"',
		);
		expect(names.map((r) => r.migration_name)).toEqual(["20260101000000_a"]);
		expect(await query(`SELECT to_regclass('public.c') AS "t"`)).toEqual([{ t: null }]);
	});

	it("refuses to run while a migration Prisma left unfinished is recorded", async () => {
		addMigration("20260101000000_a", CREATE_A);
		await run();
		await query(
			`INSERT INTO "_prisma_migrations" ("id", "checksum", "migration_name") VALUES ($1, $2, $3)`,
			["00000000-0000-0000-0000-000000000000", sha256("x"), "20260102000000_half"],
		);
		addMigration("20260103000000_c", 'CREATE TABLE "c" ("id" int);');

		await expect(run()).rejects.toThrow(/20260102000000_half/);
		expect(await query(`SELECT to_regclass('public.c') AS "t"`)).toEqual([{ t: null }]);
	});

	it("re-applies a migration that was marked as rolled back", async () => {
		addMigration("20260101000000_a", CREATE_A);
		await query(
			'CREATE TABLE "_prisma_migrations" ("id" varchar(36) PRIMARY KEY NOT NULL, ' +
				'"checksum" varchar(64) NOT NULL, "finished_at" timestamptz, "migration_name" varchar(255) NOT NULL, ' +
				'"logs" text, "rolled_back_at" timestamptz, "started_at" timestamptz NOT NULL DEFAULT now(), ' +
				'"applied_steps_count" integer NOT NULL DEFAULT 0)',
		);
		await query(
			`INSERT INTO "_prisma_migrations" ("id", "checksum", "migration_name", "rolled_back_at")
			VALUES ($1, $2, $3, now())`,
			["00000000-0000-0000-0000-000000000000", sha256(CREATE_A), "20260101000000_a"],
		);

		expect(await run()).toEqual(["20260101000000_a"]);
	});

	it("only warns about modified or locally missing migrations", async () => {
		addMigration("20260101000000_a", CREATE_A);
		addMigration("20260102000000_b", CREATE_B);
		await run();
		fs.writeFileSync(path.join(dir, "20260101000000_a", "migration.sql"), `${CREATE_A}\n-- edited`);
		fs.rmSync(path.join(dir, "20260102000000_b"), { recursive: true });

		expect(await run()).toEqual([]);
		expect(log).toHaveBeenCalledWith(expect.stringMatching(/20260101000000_a was modified/));
		expect(log).toHaveBeenCalledWith(
			expect.stringMatching(/20260102000000_b is applied but missing/),
		);
	});

	it("fails before connecting when a migration folder has no migration.sql", async () => {
		fs.mkdirSync(path.join(dir, "20260101000000_empty"));
		await expect(run()).rejects.toThrow(/20260101000000_empty has no migration.sql/);
	});

	it("leaves the real migrations in a state `prisma migrate status` accepts", async () => {
		const applied = await migrate({ databaseUrl, migrationsDir: realMigrationsDir, log });
		expect(applied.length).toBeGreaterThan(0);

		const output = execFileSync(
			path.join(sharedDir, "node_modules/.bin/prisma"),
			["migrate", "status", "--config", "prisma7.config.ts"],
			{ cwd: sharedDir, env: { ...process.env, DATABASE_URL: databaseUrl }, encoding: "utf8" },
		);
		expect(output).toContain("Database schema is up to date");
	}, 60_000);
});
