import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "#lib/prisma/client.ts";
import { DATABASE_URL } from "$app/env/private"

const connectionString = DATABASE_URL;

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

console.log(connectionString);

export { prisma };