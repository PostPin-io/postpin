-- AlterTable
ALTER TABLE "marker" ADD COLUMN     "duration" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "marker" ADD CONSTRAINT "marker_duration_check" CHECK ("duration" >= 0);