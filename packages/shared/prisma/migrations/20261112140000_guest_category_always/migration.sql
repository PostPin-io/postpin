-- Every project has a guest category named "Guest" (it used to be created on first share-link use,
-- and called "Gast"). Its name is fixed now, so existing ones are renamed to "Guest".
DO $$
DECLARE
  p RECORD;
  new_name TEXT;
  i INT;
  new_id TEXT;
BEGIN
  FOR p IN SELECT "id", "guestCategoryId" FROM "project" LOOP
    new_name := 'Guest';
    i := 2;
    WHILE EXISTS (
      SELECT 1 FROM "category"
      WHERE "projectId" = p."id" AND "name" = new_name AND "id" IS DISTINCT FROM p."guestCategoryId"
    ) LOOP
      new_name := 'Guest (' || i || ')';
      i := i + 1;
    END LOOP;

    IF p."guestCategoryId" IS NULL THEN
      new_id := gen_random_uuid()::text;
      INSERT INTO "category" ("id", "name", "color", "projectId", "updatedAt")
      VALUES (new_id, new_name, '#8b5cf6', p."id", now());
      UPDATE "project" SET "guestCategoryId" = new_id WHERE "id" = p."id";
    ELSE
      UPDATE "category"
      SET "name" = new_name, "updatedAt" = now()
      WHERE "id" = p."guestCategoryId" AND "name" <> new_name;
    END IF;
  END LOOP;
END $$;
