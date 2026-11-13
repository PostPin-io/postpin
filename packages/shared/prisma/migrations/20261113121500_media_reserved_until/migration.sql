-- AlterTable
ALTER TABLE "media" ADD COLUMN     "reservedUntil" TIMESTAMP(3);

-- Unfinished uploads keep the reservation they had: 24 hours from their start
UPDATE "media" SET "reservedUntil" = "createdAt" + interval '24 hours' WHERE "status" = 'PENDING';
