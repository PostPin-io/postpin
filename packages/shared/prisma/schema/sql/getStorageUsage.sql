-- @param {String} $1:orgId? only this organization
-- @param {String} $2:userId? only exports this user uploaded
-- @param {String} $3:excludeMediaId? skip this media (re-initialized upload)
SELECT p."organizationId"   AS "orgId",
       e."uploadedById"     AS "userId",
       SUM(s.size)::bigint  AS "used"
FROM media_storage s
JOIN media m    ON m.id = s."mediaId"
JOIN export e   ON e."mediaId" = m.id
JOIN timeline t ON t.id = e."timelineId"
JOIN project p  ON p.id = t."projectId"
-- unfinished uploads only reserve space while their part URLs are valid (24 h)
WHERE (m.status <> 'PENDING' OR m."createdAt" > now() - interval '24 hours')
  AND ($1::text IS NULL OR p."organizationId" = $1)
  AND ($2::text IS NULL OR e."uploadedById" = $2)
  AND ($3::text IS NULL OR m.id <> $3)
GROUP BY p."organizationId", e."uploadedById"
