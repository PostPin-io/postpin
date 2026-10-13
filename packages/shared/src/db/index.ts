import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./prisma/client.ts";
import type { DatabaseEnv } from "../env/index.ts";

export * from "./prisma/client.ts";

export function createPrismaClient(env: DatabaseEnv): PrismaClient {
	return new PrismaClient({ adapter: new PrismaPg({ connectionString: env.DATABASE_URL }) });
}
