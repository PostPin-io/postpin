import * as env from "$app/env/private";
import { createPrismaClient } from "@postpin/shared/db";

const prisma = createPrismaClient(env);

export { prisma };
