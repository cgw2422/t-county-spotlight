-- AlterTable
ALTER TABLE "NewsletterSubscriber" ADD COLUMN     "communities" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "NotificationDelivery" (
    "id" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "refKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'sent',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NotificationDelivery_kind_createdAt_idx" ON "NotificationDelivery"("kind", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationDelivery_recipient_kind_refKey_key" ON "NotificationDelivery"("recipient", "kind", "refKey");
