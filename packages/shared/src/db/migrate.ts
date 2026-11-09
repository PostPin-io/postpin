import { createHash, randomUUID } from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import pg from "pg";

/**
 * Applies the Prisma migrations in `migrationsDir` without the Prisma CLI, so the images don't need
 * it (and its several hundred MB of dependencies). Compatible with `prisma migrate`: same
 * `_prisma_migrations` table, same checksum (SHA-256 of migration.sql) and same advisory lock, so
 * `prisma migrate dev/status` keep working on a database migrated by this function and vice versa.
 *
 * Unlike Prisma, every migration runs in its own transaction: a failing one is rolled back
 * completely and leaves no row behind. Postgres can't run some statements in a transaction, so a
 * migration must not contain `CREATE INDEX CONCURRENTLY`, nor use an enum value it adds with
 * `ALTER TYPE ... ADD VALUE`. Split such migrations into two.
 */

/** The key `prisma migrate` locks, so the CLI and this function wait for each other */
const PRISMA_ADVISORY_LOCK = 72707369;

export interface MigrateOptions {
	databaseUrl: string;
	/** Directory with one folder per migration, each containing a `migration.sql` */
	migrationsDir: string;
	log?: (message: string) => void;
}

interface Migration {
	name: string;
	sql: string;
	checksum: string;
}

/** Returns the names of the migrations it applied, in order */
export async function migrate({
	databaseUrl,
	migrationsDir,
	log = console.log,
}: MigrateOptions): Promise<string[]> {
	const migrations = await readMigrations(migrationsDir);

	const client = new pg.Client({ connectionString: databaseUrl });
	await client.connect();
	try {
		await client.query("SELECT pg_advisory_lock($1)", [PRISMA_ADVISORY_LOCK]);
		try {
			return await applyPending(client, migrations, log);
		} finally {
			await client.query("SELECT pg_advisory_unlock($1)", [PRISMA_ADVISORY_LOCK]);
		}
	} finally {
		await client.end();
	}
}

async function readMigrations(migrationsDir: string): Promise<Migration[]> {
	const entries = await fs.readdir(migrationsDir, { withFileTypes: true });
	// Folders only: the directory also holds migration_lock.toml. Names start with a timestamp.
	const names = entries
		.filter((e) => e.isDirectory())
		.map((e) => e.name)
		.sort();

	return Promise.all(
		names.map(async (name) => {
			const file = path.join(migrationsDir, name, "migration.sql");
			const sql = await fs.readFile(file, "utf8").catch(() => {
				throw new Error(`Migration ${name} has no migration.sql (${file})`);
			});
			return { name, sql, checksum: createHash("sha256").update(sql).digest("hex") };
		}),
	);
}

async function applyPending(
	client: pg.Client,
	migrations: Migration[],
	log: (message: string) => void,
): Promise<string[]> {
	// Same definition as Prisma's
	await client.query(`
		CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
			"id" varchar(36) PRIMARY KEY NOT NULL,
			"checksum" varchar(64) NOT NULL,
			"finished_at" timestamptz,
			"migration_name" varchar(255) NOT NULL,
			"logs" text,
			"rolled_back_at" timestamptz,
			"started_at" timestamptz NOT NULL DEFAULT now(),
			"applied_steps_count" integer NOT NULL DEFAULT 0
		)`);

	const { rows } = await client.query<{
		migration_name: string;
		checksum: string;
		finished_at: Date | null;
	}>(
		`SELECT "migration_name", "checksum", "finished_at" FROM "_prisma_migrations"
		WHERE "rolled_back_at" IS NULL`,
	);

	// Only Prisma leaves these behind (it doesn't use transactions), see `prisma migrate resolve`
	const failed = rows.filter((r) => r.finished_at === null).map((r) => r.migration_name);
	if (failed.length > 0) {
		throw new Error(
			`Migration(s) ${failed.join(", ")} failed earlier and were not rolled back. Fix the ` +
				`database, then mark them with \`prisma migrate resolve --applied\` or \`--rolled-back\`.`,
		);
	}

	const applied = new Map(rows.map((r) => [r.migration_name, r.checksum]));
	const local = new Set(migrations.map((m) => m.name));
	for (const name of applied.keys()) {
		if (!local.has(name)) {
			log(`Warning: migration ${name} is applied but missing locally (newer version before?)`);
		}
	}

	const appliedNow: string[] = [];
	for (const migration of migrations) {
		const checksum = applied.get(migration.name);
		if (checksum !== undefined) {
			if (checksum !== migration.checksum) {
				log(`Warning: migration ${migration.name} was modified after it was applied`);
			}
			continue;
		}

		log(`Applying migration ${migration.name}`);
		const id = randomUUID();
		await client.query("BEGIN");
		try {
			await client.query(
				`INSERT INTO "_prisma_migrations" ("id", "checksum", "migration_name") VALUES ($1, $2, $3)`,
				[id, migration.checksum, migration.name],
			);
			// No parameters, so pg uses the simple query protocol, which runs multiple statements
			await client.query(migration.sql);
			await client.query(
				`UPDATE "_prisma_migrations" SET "finished_at" = now(), "applied_steps_count" = 1
				WHERE "id" = $1`,
				[id],
			);
			await client.query("COMMIT");
		} catch (error) {
			await client.query("ROLLBACK");
			throw new Error(`Migration ${migration.name} failed and was rolled back`, { cause: error });
		}
		appliedNow.push(migration.name);
	}
	return appliedNow;
}
