-- Role enum 

CREATE TYPE "Role" AS ENUM ('OWNER', 'ADMIN', 'MEMBER', 'REVIEWER');

ALTER TABLE "member"
  ALTER COLUMN "role" DROP DEFAULT,
  ALTER COLUMN "role" TYPE "Role" USING upper("role")::"Role";

-- invitation.role was nullable; better-auth's default was "member"
ALTER TABLE "invitation"
  ALTER COLUMN "role" TYPE "Role" USING upper(COALESCE("role", 'member'))::"Role",
  ALTER COLUMN "role" SET NOT NULL;

ALTER TABLE "invite_link"
  ALTER COLUMN "role" TYPE "Role" USING upper("role")::"Role";

-- Drop foreign keys that change

ALTER TABLE "invitation" DROP CONSTRAINT "invitation_inviterId_fkey";
ALTER TABLE "marker"     DROP CONSTRAINT "marker_authorId_fkey";
ALTER TABLE "marker"     DROP CONSTRAINT "marker_categoryId_fkey";
ALTER TABLE "project"    DROP CONSTRAINT "project_creatorId_fkey";
ALTER TABLE "project"    DROP CONSTRAINT "project_organizationId_fkey";
ALTER TABLE "response"   DROP CONSTRAINT "response_authorId_fkey";

DROP INDEX "invite_link_organizationId_role_key";

-- Alter tables

ALTER TABLE "category" ADD COLUMN "createdById" TEXT;

ALTER TABLE "invitation"
  ADD COLUMN "projectId" TEXT,
  ADD COLUMN "timelineId" TEXT,
  ALTER COLUMN "inviterId" DROP NOT NULL;

ALTER TABLE "invite_link"
  ADD COLUMN "projectId" TEXT,
  ADD COLUMN "timelineId" TEXT,
  ALTER COLUMN "createdById" DROP NOT NULL;

ALTER TABLE "marker"   ALTER COLUMN "authorId"  DROP NOT NULL;
ALTER TABLE "project"  ALTER COLUMN "creatorId" DROP NOT NULL;
ALTER TABLE "response" ALTER COLUMN "authorId"  DROP NOT NULL;

-- New tables 

CREATE TABLE "member_grant" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "projectId" TEXT,
    "timelineId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "member_grant_pkey" PRIMARY KEY ("id"),
    -- Prisma can't express CHECKs; it ignores them when diffing
    CONSTRAINT "member_grant_exactly_one_target"
      CHECK (num_nonnulls("projectId", "timelineId") = 1)
);

CREATE TABLE "share_link" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "exportId" TEXT NOT NULL,
    "creatorId" TEXT,
    "markerPanelVisible" BOOLEAN NOT NULL,

    CONSTRAINT "share_link_pkey" PRIMARY KEY ("id")
);

-- No target = org-level, otherwise exactly one of project / timeline
ALTER TABLE "invitation"
  ADD CONSTRAINT "invitation_at_most_one_target"
  CHECK (num_nonnulls("projectId", "timelineId") <= 1);

ALTER TABLE "invite_link"
  ADD CONSTRAINT "invite_link_at_most_one_target"
  CHECK (num_nonnulls("projectId", "timelineId") <= 1);

-- Indexes 

CREATE INDEX "member_grant_projectId_idx" ON "member_grant"("projectId");
CREATE INDEX "member_grant_timelineId_idx" ON "member_grant"("timelineId");
CREATE UNIQUE INDEX "member_grant_memberId_projectId_key" ON "member_grant"("memberId", "projectId");
CREATE UNIQUE INDEX "member_grant_memberId_timelineId_key" ON "member_grant"("memberId", "timelineId");

CREATE INDEX "share_link_exportId_idx" ON "share_link"("exportId");

CREATE INDEX "invitation_projectId_idx" ON "invitation"("projectId");
CREATE INDEX "invitation_timelineId_idx" ON "invitation"("timelineId");

-- NULLS NOT DISTINCT (Postgres 15+): otherwise org- and project-level links
-- (projectId / timelineId NULL) would never collide
CREATE UNIQUE INDEX "invite_link_organizationId_role_projectId_timelineId_key"
  ON "invite_link"("organizationId", "role", "projectId", "timelineId") NULLS NOT DISTINCT;

-- Foreign keys 

-- NO ACTION, not RESTRICT: checked at end of statement, so deleting a project
-- cascades markers via export first. Deleting a category with markers still fails.
ALTER TABLE "marker" ADD CONSTRAINT "marker_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "category"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "marker" ADD CONSTRAINT "marker_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "category" ADD CONSTRAINT "category_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "response" ADD CONSTRAINT "response_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "invitation" ADD CONSTRAINT "invitation_inviterId_fkey"
  FOREIGN KEY ("inviterId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_timelineId_fkey"
  FOREIGN KEY ("timelineId") REFERENCES "timeline"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "invite_link" ADD CONSTRAINT "invite_link_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "invite_link" ADD CONSTRAINT "invite_link_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "invite_link" ADD CONSTRAINT "invite_link_timelineId_fkey"
  FOREIGN KEY ("timelineId") REFERENCES "timeline"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "member_grant" ADD CONSTRAINT "member_grant_memberId_fkey"
  FOREIGN KEY ("memberId") REFERENCES "member"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "member_grant" ADD CONSTRAINT "member_grant_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "member_grant" ADD CONSTRAINT "member_grant_timelineId_fkey"
  FOREIGN KEY ("timelineId") REFERENCES "timeline"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "member_grant" ADD CONSTRAINT "member_grant_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "project" ADD CONSTRAINT "project_creatorId_fkey"
  FOREIGN KEY ("creatorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "project" ADD CONSTRAINT "project_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "share_link" ADD CONSTRAINT "share_link_exportId_fkey"
  FOREIGN KEY ("exportId") REFERENCES "export"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "share_link" ADD CONSTRAINT "share_link_creatorId_fkey"
  FOREIGN KEY ("creatorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
