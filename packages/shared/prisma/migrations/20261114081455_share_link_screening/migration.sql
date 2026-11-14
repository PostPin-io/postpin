-- CreateEnum
CREATE TYPE "ShareLinkKind" AS ENUM ('STANDARD', 'SCREENING');

-- AlterTable
ALTER TABLE "share_link" ADD COLUMN     "kind" "ShareLinkKind" NOT NULL DEFAULT 'STANDARD',
ADD COLUMN     "maxGuests" INTEGER;
