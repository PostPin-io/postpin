-- Bytes per kind of file (original, proxy, thumbnail, seekSprites, shotThumbnails) in the whole
-- instance, counted like getStorageUsage.sql so the totals match.
SELECT s.kind              AS "kind",
       SUM(s.size)::bigint AS "used"
FROM media_storage s
JOIN media m  ON m.id = s."mediaId"
JOIN export e ON e."mediaId" = m.id
WHERE (m.status <> 'PENDING' OR m."createdAt" > now() - interval '24 hours')
GROUP BY s.kind
