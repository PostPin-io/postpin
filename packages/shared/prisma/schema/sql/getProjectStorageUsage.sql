-- @param {String} $1:orgId
SELECT p.id                AS "id",
       p.name              AS "name",
       SUM(s.size)::bigint AS "used"
FROM media_storage s
JOIN media m    ON m.id = s."mediaId"
JOIN export e   ON e."mediaId" = m.id
JOIN timeline t ON t.id = e."timelineId"
JOIN project p  ON p.id = t."projectId"
-- same rule as getStorageUsage.sql
WHERE (m.status <> 'PENDING' OR m."createdAt" > now() - interval '24 hours')
  AND p."organizationId" = $1
GROUP BY p.id, p.name
ORDER BY "used" DESC NULLS LAST
