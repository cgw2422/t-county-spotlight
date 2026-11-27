-- CreateTable
CREATE TABLE "GovSource" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "community" TEXT NOT NULL,
    "govType" TEXT NOT NULL,
    "website" TEXT,
    "minutesUrl" TEXT,
    "agendasUrl" TEXT,
    "extraUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "clerkName" TEXT,
    "clerkTitle" TEXT,
    "clerkEmail" TEXT,
    "clerkPhone" TEXT,
    "collectionMethod" TEXT NOT NULL DEFAULT 'unknown',
    "verification" TEXT NOT NULL DEFAULT 'needs_review',
    "verifiedAt" TIMESTAMP(3),
    "notes" TEXT,
    "evidence" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastCheckedAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "lastStatus" TEXT NOT NULL DEFAULT 'never',
    "lastError" TEXT,
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GovSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GovDocument" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT,
    "title" TEXT NOT NULL,
    "docType" TEXT NOT NULL DEFAULT 'other',
    "fileType" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "storageKey" TEXT NOT NULL,
    "storageUrl" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "httpEtag" TEXT,
    "httpLastModified" TEXT,
    "meetingDate" TIMESTAMP(3),
    "meetingBody" TEXT,
    "revisionOfId" TEXT,
    "supersededAt" TIMESTAMP(3),
    "textContent" TEXT,
    "pageCount" INTEGER,
    "extractionMethod" TEXT,
    "status" TEXT NOT NULL DEFAULT 'new',
    "analysisError" TEXT,
    "analyzedAt" TIMESTAMP(3),
    "analysisModel" TEXT,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "summary" TEXT,
    "reviewStatus" TEXT NOT NULL DEFAULT 'awaiting_review',
    "emailFrom" TEXT,
    "emailSubject" TEXT,
    "uploadedById" TEXT,
    "discoveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GovDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GovFinding" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "headline" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "actionStatus" TEXT NOT NULL,
    "priority" TEXT NOT NULL,
    "amount" TEXT,
    "voteResult" TEXT,
    "pageNumber" INTEGER,
    "quote" TEXT,
    "eventDate" TIMESTAMP(3),
    "reviewStatus" TEXT NOT NULL DEFAULT 'new',
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "articleId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GovFinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GovCheckRun" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT,
    "trigger" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'running',
    "linksFound" INTEGER NOT NULL DEFAULT 0,
    "newDocs" INTEGER NOT NULL DEFAULT 0,
    "revisions" INTEGER NOT NULL DEFAULT 0,
    "duplicates" INTEGER NOT NULL DEFAULT 0,
    "message" TEXT,

    CONSTRAINT "GovCheckRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GovSource_name_key" ON "GovSource"("name");

-- CreateIndex
CREATE INDEX "GovSource_community_idx" ON "GovSource"("community");

-- CreateIndex
CREATE INDEX "GovSource_govType_idx" ON "GovSource"("govType");

-- CreateIndex
CREATE UNIQUE INDEX "GovDocument_sha256_key" ON "GovDocument"("sha256");

-- CreateIndex
CREATE INDEX "GovDocument_sourceId_discoveredAt_idx" ON "GovDocument"("sourceId", "discoveredAt");

-- CreateIndex
CREATE INDEX "GovDocument_status_idx" ON "GovDocument"("status");

-- CreateIndex
CREATE INDEX "GovDocument_reviewStatus_idx" ON "GovDocument"("reviewStatus");

-- CreateIndex
CREATE INDEX "GovDocument_meetingDate_idx" ON "GovDocument"("meetingDate");

-- CreateIndex
CREATE INDEX "GovDocument_sourceUrl_idx" ON "GovDocument"("sourceUrl");

-- CreateIndex
CREATE INDEX "GovFinding_documentId_idx" ON "GovFinding"("documentId");

-- CreateIndex
CREATE INDEX "GovFinding_reviewStatus_priority_idx" ON "GovFinding"("reviewStatus", "priority");

-- CreateIndex
CREATE INDEX "GovFinding_eventDate_idx" ON "GovFinding"("eventDate");

-- CreateIndex
CREATE INDEX "GovCheckRun_startedAt_idx" ON "GovCheckRun"("startedAt");

-- CreateIndex
CREATE INDEX "GovCheckRun_sourceId_startedAt_idx" ON "GovCheckRun"("sourceId", "startedAt");

-- AddForeignKey
ALTER TABLE "GovDocument" ADD CONSTRAINT "GovDocument_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "GovSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GovDocument" ADD CONSTRAINT "GovDocument_revisionOfId_fkey" FOREIGN KEY ("revisionOfId") REFERENCES "GovDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GovFinding" ADD CONSTRAINT "GovFinding_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "GovDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GovCheckRun" ADD CONSTRAINT "GovCheckRun_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "GovSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
