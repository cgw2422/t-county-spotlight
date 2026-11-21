-- CreateEnum
CREATE TYPE "BusinessLeadStatus" AS ENUM ('NEW', 'REVIEWING', 'CONTACTED', 'ADDED', 'DECLINED');

-- CreateTable
CREATE TABLE "BusinessLead" (
    "id" TEXT NOT NULL,
    "matchKey" TEXT NOT NULL,
    "websiteKey" TEXT,
    "name" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "website" TEXT,
    "category" TEXT,
    "status" "BusinessLeadStatus" NOT NULL DEFAULT 'NEW',
    "adminNotes" TEXT,
    "businessId" TEXT,
    "createdFromLead" BOOLEAN NOT NULL DEFAULT false,
    "contactedAt" TIMESTAMP(3),
    "addedAt" TIMESTAMP(3),
    "submissionCount" INTEGER NOT NULL DEFAULT 0,
    "lastSubmittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessLead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessLeadSubmission" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "website" TEXT,
    "category" TEXT,
    "reason" TEXT,
    "submitterFirstName" TEXT,
    "submitterEmail" TEXT,
    "ipHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BusinessLeadSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BusinessLead_matchKey_key" ON "BusinessLead"("matchKey");
CREATE INDEX "BusinessLead_status_lastSubmittedAt_idx" ON "BusinessLead"("status", "lastSubmittedAt");
CREATE INDEX "BusinessLead_websiteKey_idx" ON "BusinessLead"("websiteKey");
CREATE INDEX "BusinessLead_businessId_idx" ON "BusinessLead"("businessId");
CREATE INDEX "BusinessLeadSubmission_leadId_createdAt_idx" ON "BusinessLeadSubmission"("leadId", "createdAt");
CREATE INDEX "BusinessLeadSubmission_ipHash_createdAt_idx" ON "BusinessLeadSubmission"("ipHash", "createdAt");

-- AddForeignKey
ALTER TABLE "BusinessLead" ADD CONSTRAINT "BusinessLead_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BusinessLeadSubmission" ADD CONSTRAINT "BusinessLeadSubmission_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "BusinessLead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
