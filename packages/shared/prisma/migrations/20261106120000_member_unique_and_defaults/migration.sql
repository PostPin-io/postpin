-- Member and Invitation are now created by our own commands instead of better-auth.
-- id defaults (cuid) live in the Prisma client, only createdAt needs a DB default.
ALTER TABLE "member" ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP;

-- One membership per user and org (guards against double joins/accepts)
CREATE UNIQUE INDEX "member_organizationId_userId_key" ON "member"("organizationId", "userId");
