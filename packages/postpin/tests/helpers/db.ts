import { prisma } from "#lib/server/database.ts";

export { prisma };

let tables: string[] | null = null;

/** Empties every table except Prisma's migration log. */
export async function truncateAll() {
	tables ??= (
		await prisma.$queryRaw<{ tablename: string }[]>`
			SELECT tablename FROM pg_tables
			WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`
	).map((t) => `"public"."${t.tablename}"`);
	if (tables.length) await prisma.$executeRawUnsafe(`TRUNCATE ${tables.join(", ")} CASCADE`);
}
