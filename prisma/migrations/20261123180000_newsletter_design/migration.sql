-- CreateTable
CREATE TABLE "NewsletterDesign" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "previewText" TEXT,
    "issueNumber" INTEGER,
    "issueDate" TIMESTAMP(3) NOT NULL,
    "content" JSONB NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    "duplicatedFromId" TEXT,
    "beehiivStatus" TEXT NOT NULL DEFAULT 'none',
    "beehiivPostId" TEXT,
    "beehiivMessage" TEXT,
    "beehiivSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NewsletterDesign_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NewsletterDesign_updatedAt_idx" ON "NewsletterDesign"("updatedAt");
