-- CreateEnum
CREATE TYPE "OrgOwnership" AS ENUM ('UNCLAIMED', 'CLAIM_PENDING', 'CLAIMED');

-- CreateEnum
CREATE TYPE "ClaimStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN');

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "importBatchId" TEXT,
ADD COLUMN     "internalNotes" TEXT,
ADD COLUMN     "isPublished" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "ownershipStatus" "OrgOwnership" NOT NULL DEFAULT 'UNCLAIMED',
ADD COLUMN     "publishedAt" TIMESTAMP(3),
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'self_registered';

-- CreateTable
CREATE TABLE "OrganizationClaim" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "applicantName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "role" TEXT NOT NULL,
    "verificationMethod" TEXT,
    "evidence" TEXT,
    "message" TEXT,
    "emailDomainMatches" BOOLEAN NOT NULL DEFAULT false,
    "emailVerifiedAt" TIMESTAMP(3),
    "verifyTokenHash" TEXT,
    "verifyExpiresAt" TIMESTAMP(3),
    "status" "ClaimStatus" NOT NULL DEFAULT 'PENDING',
    "reviewNote" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationImport" (
    "id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'uploaded',
    "headers" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "rows" JSONB NOT NULL,
    "mapping" JSONB,
    "defaults" JSONB,
    "results" JSONB,
    "summary" JSONB,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "OrganizationImport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationClaim_verifyTokenHash_key" ON "OrganizationClaim"("verifyTokenHash");

-- CreateIndex
CREATE INDEX "OrganizationClaim_organizationId_status_idx" ON "OrganizationClaim"("organizationId", "status");

-- CreateIndex
CREATE INDEX "OrganizationClaim_status_createdAt_idx" ON "OrganizationClaim"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Organization_ownershipStatus_idx" ON "Organization"("ownershipStatus");

-- CreateIndex
CREATE INDEX "Organization_importBatchId_idx" ON "Organization"("importBatchId");

-- AddForeignKey
ALTER TABLE "OrganizationClaim" ADD CONSTRAINT "OrganizationClaim_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationClaim" ADD CONSTRAINT "OrganizationClaim_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Data: organizations that already have managers are CLAIMED; existing
-- approved organizations keep their current public visibility (isPublished defaults to true).
UPDATE "Organization" o SET "ownershipStatus" = 'CLAIMED'
WHERE EXISTS (SELECT 1 FROM "OrganizationMember" m WHERE m."organizationId" = o."id");
UPDATE "Organization" SET "publishedAt" = "updatedAt" WHERE "status" = 'APPROVED' AND "publishedAt" IS NULL;
