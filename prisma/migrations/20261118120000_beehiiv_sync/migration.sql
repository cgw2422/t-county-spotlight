-- AlterTable
ALTER TABLE "Article" ADD COLUMN     "beehiivContentSource" TEXT,
ADD COLUMN     "beehiivPostId" TEXT,
ADD COLUMN     "beehiivSyncedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "NewsletterIssue" (
    "id" TEXT NOT NULL,
    "beehiivPostId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "html" TEXT NOT NULL,
    "thumbnailUrl" TEXT,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "webUrl" TEXT,
    "contentSource" TEXT NOT NULL DEFAULT 'web',
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "removedAt" TIMESTAMP(3),
    "syncedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NewsletterIssue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NewsletterIssue_beehiivPostId_key" ON "NewsletterIssue"("beehiivPostId");

-- CreateIndex
CREATE UNIQUE INDEX "NewsletterIssue_slug_key" ON "NewsletterIssue"("slug");

-- CreateIndex
CREATE INDEX "NewsletterIssue_hidden_publishedAt_idx" ON "NewsletterIssue"("hidden", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Article_beehiivPostId_key" ON "Article"("beehiivPostId");

