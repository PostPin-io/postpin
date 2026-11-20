-- The plugin tutorial (sync-to-nle) starts once a plugin is connected. Whoever has signed in a
-- plugin before knows its panel already: mark it completed for them, so it doesn't surprise them.
INSERT INTO "guide_progress" ("id", "updatedAt", "userId", "guideId", "status")
SELECT gen_random_uuid()::text, CURRENT_TIMESTAMP, u."id", 'sync-to-nle', 'COMPLETED'
FROM "user" u
WHERE EXISTS (
    SELECT 1 FROM "session" s
    WHERE s."userId" = u."id"
      AND s."clientId" IN ('io.postpin.desktop', 'io.postpin.plugin.resolve', 'io.postpin.plugin.premiere')
)
ON CONFLICT ("userId", "guideId") DO NOTHING;
