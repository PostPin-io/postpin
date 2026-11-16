-- AlterTable
ALTER TABLE "user" ADD COLUMN     "tutorialCompletedAt" TIMESTAMP(3),
ADD COLUMN     "tutorialSeenSteps" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Everyone who already has an account knows PostPin: the tutorial is for new sign-ups only
UPDATE "user" SET "tutorialCompletedAt" = CURRENT_TIMESTAMP;
