import { createPrismaClient } from "@postpin-io/shared/db";
import { env } from "./env.ts";

export const prisma = createPrismaClient(env);
