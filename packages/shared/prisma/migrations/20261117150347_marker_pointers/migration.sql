-- CreateEnum
CREATE TYPE "PointerKind" AS ENUM ('ARROW', 'RECT');

-- CreateTable
CREATE TABLE "marker_pointer" (
    "id" TEXT NOT NULL,
    "markerId" TEXT NOT NULL,
    "kind" "PointerKind" NOT NULL,
    "x" DOUBLE PRECISION NOT NULL,
    "y" DOUBLE PRECISION NOT NULL,
    "width" DOUBLE PRECISION,
    "height" DOUBLE PRECISION,
    "color" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "marker_pointer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "marker_pointer_markerId_idx" ON "marker_pointer"("markerId");

-- AddForeignKey
ALTER TABLE "marker_pointer" ADD CONSTRAINT "marker_pointer_markerId_fkey" FOREIGN KEY ("markerId") REFERENCES "marker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Prisma can't express CHECKs; it ignores them when diffing.
-- A box has a size inside the picture, an arrow has none; every coordinate is a fraction of the picture.
-- The tolerance absorbs float rounding at the right and bottom edge.
ALTER TABLE "marker_pointer" ADD CONSTRAINT "marker_pointer_geometry_check" CHECK (
  "x" BETWEEN 0 AND 1 AND "y" BETWEEN 0 AND 1 AND
  CASE "kind"
    WHEN 'ARROW' THEN "width" IS NULL AND "height" IS NULL
    WHEN 'RECT' THEN "width" > 0 AND "height" > 0 AND "x" + "width" <= 1 + 1e-9 AND "y" + "height" <= 1 + 1e-9
  END
);
