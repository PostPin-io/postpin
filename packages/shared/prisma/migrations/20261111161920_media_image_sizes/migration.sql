-- AlterTable
ALTER TABLE "media" ADD COLUMN     "seekSpritesSize" BIGINT,
ADD COLUMN     "shotThumbnailsSize" BIGINT,
ADD COLUMN     "thumbnailSize" BIGINT;

-- Every stored file of a media, one row per kind. The storage queries in prisma/schema/sql read
-- this, so originals, proxies and images are summed the same way everywhere.
CREATE VIEW "media_storage" AS
SELECT m.id AS "mediaId", 'original' AS "kind", mf.size AS "size"
FROM "media" m JOIN "media_file" mf ON mf.id = m."originalId"
UNION ALL
SELECT mf."proxyOfId", 'proxy', mf.size
FROM "media_file" mf WHERE mf."proxyOfId" IS NOT NULL
UNION ALL
SELECT m.id, 'thumbnail', m."thumbnailSize" FROM "media" m
UNION ALL
SELECT m.id, 'seekSprites', m."seekSpritesSize" FROM "media" m
UNION ALL
SELECT m.id, 'shotThumbnails', m."shotThumbnailsSize" FROM "media" m;
