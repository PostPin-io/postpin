import * as env from "$app/env/private";
import { createPrismaClient } from "@postpin-io/shared/db";

const prisma = createPrismaClient(env);

export { prisma };
