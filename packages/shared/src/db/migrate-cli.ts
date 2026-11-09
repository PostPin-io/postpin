// Entry point of the migrator in the Docker images (bundled to dist/migrate.mjs by `build:migrate`).
// Reads DATABASE_URL and MIGRATIONS_DIR (default: prisma/migrations below the working directory,
// i.e. run it from packages/shared; the images set MIGRATIONS_DIR).
import * as path from "node:path";
import { migrate } from "./migrate.ts";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
	console.error("DATABASE_URL is not set");
	process.exit(1);
}
// Not relative to this file: it lives in src/db as source but in dist/ once bundled
const migrationsDir = path.resolve(process.env.MIGRATIONS_DIR ?? "prisma/migrations");

try {
	const applied = await migrate({ databaseUrl, migrationsDir });
	console.log(
		applied.length > 0 ? `${applied.length} migration(s) applied` : "No pending migrations",
	);
} catch (error) {
	console.error(error);
	process.exit(1);
}
