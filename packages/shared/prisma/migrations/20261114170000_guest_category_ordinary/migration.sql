-- The guest category becomes an ordinary category: links point to the category their guests'
-- markers get (as screenings already do), the project no longer knows a special one.
UPDATE "share_link" AS l
SET "categoryId" = p."guestCategoryId"
FROM "export" e
JOIN "timeline" t ON t."id" = e."timelineId"
JOIN "project" p ON p."id" = t."projectId"
WHERE e."id" = l."exportId" AND l."categoryId" IS NULL AND p."guestCategoryId" IS NOT NULL;

-- DropForeignKey
ALTER TABLE "project" DROP CONSTRAINT "project_guestCategoryId_fkey";

-- DropIndex
DROP INDEX "project_guestCategoryId_key";

-- AlterTable
ALTER TABLE "project" DROP COLUMN "guestCategoryId";
