-- AlterTable
ALTER TABLE "user" ADD COLUMN     "lastActiveOrganizationId" TEXT;

-- AddForeignKey
ALTER TABLE "user" ADD CONSTRAINT "user_lastActiveOrganizationId_fkey" FOREIGN KEY ("lastActiveOrganizationId") REFERENCES "organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
