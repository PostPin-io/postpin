-- CreateEnum
CREATE TYPE "MediaStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- AlterTable
ALTER TABLE "export" ADD COLUMN     "mediaId" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "media" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "status" "MediaStatus" NOT NULL DEFAULT 'PENDING',
    "originalId" TEXT NOT NULL,

    CONSTRAINT "media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_file" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "status" "MediaStatus" NOT NULL DEFAULT 'PENDING',
    "proxyOfId" TEXT,
    "contentType" TEXT,
    "size" BIGINT,
    "duration" DOUBLE PRECISION,
    "bitrate" INTEGER,
    "videoCodec" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "frameRate" DOUBLE PRECISION,
    "audioCodec" TEXT,
    "sampleRate" INTEGER,
    "channels" INTEGER,

    CONSTRAINT "media_file_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "thumbnail" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "status" "MediaStatus" NOT NULL DEFAULT 'PENDING',
    "mediaId" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "frame" INTEGER NOT NULL,

    CONSTRAINT "thumbnail_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "media_originalId_key" ON "media"("originalId");

-- CreateIndex
CREATE UNIQUE INDEX "media_file_proxyOfId_width_height_bitrate_key" ON "media_file"("proxyOfId", "width", "height", "bitrate");

-- CreateIndex
CREATE UNIQUE INDEX "thumbnail_mediaId_key" ON "thumbnail"("mediaId");

-- CreateIndex
CREATE UNIQUE INDEX "export_mediaId_key" ON "export"("mediaId");

-- AddForeignKey
ALTER TABLE "export" ADD CONSTRAINT "export_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "media"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media" ADD CONSTRAINT "media_originalId_fkey" FOREIGN KEY ("originalId") REFERENCES "media_file"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_file" ADD CONSTRAINT "media_file_proxyOfId_fkey" FOREIGN KEY ("proxyOfId") REFERENCES "media"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "thumbnail" ADD CONSTRAINT "thumbnail_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "media"("id") ON DELETE CASCADE ON UPDATE CASCADE;

