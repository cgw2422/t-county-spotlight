-- CreateEnum
CREATE TYPE "PulseStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PulseSourceType" AS ENUM ('FACEBOOK', 'COMMUNITY_SUBMISSION', 'SURVEY', 'EDITORIAL', 'OTHER');

-- CreateEnum
CREATE TYPE "PulseDisplayMode" AS ENUM ('RANKED_LIST', 'BARS', 'EDITORIAL_LIST');

-- CreateEnum
CREATE TYPE "PulseSortMode" AS ENUM ('MENTIONS_DESC', 'MANUAL');

-- CreateTable
CREATE TABLE "PulseCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PulseCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunityPulse" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "intro" TEXT,
    "featuredImageUrl" TEXT,
    "featuredImageAlt" TEXT,
    "categoryId" TEXT,
    "sourceType" "PulseSourceType" NOT NULL DEFAULT 'FACEBOOK',
    "sourceUrl" TEXT,
    "sourceLabel" TEXT,
    "methodology" TEXT,
    "discussionDate" TIMESTAMP(3),
    "resultsUpdatedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "status" "PulseStatus" NOT NULL DEFAULT 'DRAFT',
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "displayMode" "PulseDisplayMode" NOT NULL DEFAULT 'RANKED_LIST',
    "sortMode" "PulseSortMode" NOT NULL DEFAULT 'MENTIONS_DESC',
    "homepageLimit" INTEGER NOT NULL DEFAULT 3,
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "ogImageUrl" TEXT,
    "firstPublishedAt" TIMESTAMP(3),
    "resultsChangedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommunityPulse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PulseResult" (
    "id" TEXT NOT NULL,
    "pulseId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mentions" INTEGER,
    "description" TEXT,
    "imageUrl" TEXT,
    "websiteUrl" TEXT,
    "businessId" TEXT,
    "organizationId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PulseResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PulseCategory_slug_key" ON "PulseCategory"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "CommunityPulse_slug_key" ON "CommunityPulse"("slug");

-- CreateIndex
CREATE INDEX "CommunityPulse_status_publishedAt_idx" ON "CommunityPulse"("status", "publishedAt");

-- CreateIndex
CREATE INDEX "CommunityPulse_isFeatured_idx" ON "CommunityPulse"("isFeatured");

-- CreateIndex
CREATE INDEX "PulseResult_pulseId_sortOrder_idx" ON "PulseResult"("pulseId", "sortOrder");

-- CreateIndex
CREATE INDEX "PulseResult_businessId_idx" ON "PulseResult"("businessId");

-- CreateIndex
CREATE INDEX "PulseResult_organizationId_idx" ON "PulseResult"("organizationId");

-- AddForeignKey
ALTER TABLE "CommunityPulse" ADD CONSTRAINT "CommunityPulse_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "PulseCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PulseResult" ADD CONSTRAINT "PulseResult_pulseId_fkey" FOREIGN KEY ("pulseId") REFERENCES "CommunityPulse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PulseResult" ADD CONSTRAINT "PulseResult_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PulseResult" ADD CONSTRAINT "PulseResult_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
