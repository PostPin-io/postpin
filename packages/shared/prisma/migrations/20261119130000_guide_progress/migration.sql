-- CreateEnum
CREATE TYPE "GuideStatus" AS ENUM ('STARTED', 'COMPLETED', 'SKIPPED');

-- CreateTable
CREATE TABLE "guide_progress" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,
    "guideId" TEXT NOT NULL,
    "status" "GuideStatus" NOT NULL,
    "step" TEXT,
    "context" JSONB,

    CONSTRAINT "guide_progress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "guide_progress_userId_guideId_key" ON "guide_progress"("userId", "guideId");

-- AddForeignKey
ALTER TABLE "guide_progress" ADD CONSTRAINT "guide_progress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Everyone who already has an account knows PostPin: the first guides are for new sign-ups only
INSERT INTO "guide_progress" ("id", "updatedAt", "userId", "guideId", "status")
SELECT gen_random_uuid()::text, CURRENT_TIMESTAMP, u."id", g."guideId", 'COMPLETED'
FROM "user" u CROSS JOIN (VALUES ('first-upload'), ('share-link')) AS g("guideId");
