-- AlterTable
ALTER TABLE "share_guest" ADD COLUMN     "lastViewedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "share_link" ADD COLUMN     "lastViewedAt" TIMESTAMP(3),
ADD COLUMN     "viewCount" INTEGER NOT NULL DEFAULT 0;
