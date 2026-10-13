import { createPrismaClient } from "@postpin/shared/db";
import { env } from "./env.ts";

export const prisma = createPrismaClient(env);
