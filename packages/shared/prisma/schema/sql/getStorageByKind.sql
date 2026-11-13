-- Bytes per kind of file (original, proxy, thumbnail, seekSprites, shotThumbnails) in the whole
-- instance, counted like getStorageUsage.sql so the totals match.
SELECT s.kind              AS "kind",
       SUM(s.size)::bigint AS "used"
FROM media_storage s
JOIN media m  ON m.id = s."mediaId"
JOIN export e ON e."mediaId" = m.id
-- same rule as getStorageUsage.sql
WHERE (m.status <> 'PENDING' OR m."reservedUntil" > now())
GROUP BY s.kind
