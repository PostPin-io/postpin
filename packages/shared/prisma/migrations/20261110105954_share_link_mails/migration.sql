-- CreateTable
CREATE TABLE "share_link_mail" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "shareLinkId" TEXT NOT NULL,
    "senderId" TEXT,
    "recipients" TEXT[],

    CONSTRAINT "share_link_mail_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "share_link_mail_shareLinkId_senderId_createdAt_idx" ON "share_link_mail"("shareLinkId", "senderId", "createdAt");

-- AddForeignKey
ALTER TABLE "share_link_mail" ADD CONSTRAINT "share_link_mail_shareLinkId_fkey" FOREIGN KEY ("shareLinkId") REFERENCES "share_link"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "share_link_mail" ADD CONSTRAINT "share_link_mail_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
