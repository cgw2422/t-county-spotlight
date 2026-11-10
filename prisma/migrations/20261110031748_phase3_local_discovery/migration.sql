-- CreateEnum
CREATE TYPE "BusinessUpdateKind" AS ENUM ('GENERAL', 'COMING_SOON', 'RECENTLY_OPENED', 'RELOCATING', 'EXPANDING');

-- CreateEnum
CREATE TYPE "CollectionItemType" AS ENUM ('BUSINESS', 'ARTICLE', 'EVENT', 'ORGANIZATION', 'PULSE', 'PLACE');

-- CreateEnum
CREATE TYPE "SuggestionKind" AS ENUM ('BUSINESS_OPENING', 'COMMUNITY_UPDATE', 'ATTRACTION', 'VOLUNTEER', 'OTHER');

-- CreateEnum
CREATE TYPE "SuggestionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NeedCategory" ADD VALUE 'FUNDRAISER';
ALTER TYPE "NeedCategory" ADD VALUE 'OUTREACH';

-- AlterTable
ALTER TABLE "Article" ADD COLUMN     "city" TEXT,
ADD COLUMN     "expiresAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "BusinessUpdate" ADD COLUMN     "address" TEXT,
ADD COLUMN     "businessName" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "dateNote" TEXT,
ADD COLUMN     "effectiveDate" TIMESTAMP(3),
ADD COLUMN     "featuredUntil" TIMESTAMP(3),
ADD COLUMN     "kind" "BusinessUpdateKind" NOT NULL DEFAULT 'GENERAL',
ADD COLUMN     "linkUrl" TEXT,
ADD COLUMN     "photos" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "publishedAt" TIMESTAMP(3),
ADD COLUMN     "rejectionReason" TEXT,
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedById" TEXT,
ADD COLUMN     "submittedById" TEXT,
ALTER COLUMN "businessId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "CommunityNeed" ADD COLUMN     "city" TEXT;

-- CreateTable
CREATE TABLE "ExploreCollection" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "coverImageUrl" TEXT,
    "coverFocusX" INTEGER NOT NULL DEFAULT 50,
    "coverFocusY" INTEGER NOT NULL DEFAULT 50,
    "status" "PublishStatus" NOT NULL DEFAULT 'DRAFT',
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExploreCollection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExploreCollectionItem" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "itemType" "CollectionItemType" NOT NULL,
    "targetId" TEXT,
    "title" TEXT,
    "description" TEXT,
    "imageUrl" TEXT,
    "address" TEXT,
    "city" TEXT,
    "websiteUrl" TEXT,
    "note" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExploreCollectionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunityProfile" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "intro" TEXT,
    "coverImageUrl" TEXT,
    "coverFocusX" INTEGER NOT NULL DEFAULT 50,
    "coverFocusY" INTEGER NOT NULL DEFAULT 50,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommunityProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunitySuggestion" (
    "id" TEXT NOT NULL,
    "kind" "SuggestionKind" NOT NULL,
    "title" TEXT NOT NULL,
    "details" TEXT NOT NULL,
    "city" TEXT,
    "address" TEXT,
    "linkUrl" TEXT,
    "eventDate" TIMESTAMP(3),
    "photos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "submitterName" TEXT,
    "submitterEmail" TEXT NOT NULL,
    "userId" TEXT,
    "manageTokenHash" TEXT,
    "status" "SuggestionStatus" NOT NULL DEFAULT 'PENDING',
    "rejectionReason" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "resultRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommunitySuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExploreCollection_slug_key" ON "ExploreCollection"("slug");

-- CreateIndex
CREATE INDEX "ExploreCollection_status_sortOrder_idx" ON "ExploreCollection"("status", "sortOrder");

-- CreateIndex
CREATE INDEX "ExploreCollectionItem_collectionId_sortOrder_idx" ON "ExploreCollectionItem"("collectionId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "CommunityProfile_slug_key" ON "CommunityProfile"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "CommunitySuggestion_manageTokenHash_key" ON "CommunitySuggestion"("manageTokenHash");

-- CreateIndex
CREATE INDEX "CommunitySuggestion_status_createdAt_idx" ON "CommunitySuggestion"("status", "createdAt");

-- CreateIndex
CREATE INDEX "BusinessUpdate_kind_status_idx" ON "BusinessUpdate"("kind", "status");

-- AddForeignKey
ALTER TABLE "ExploreCollectionItem" ADD CONSTRAINT "ExploreCollectionItem_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "ExploreCollection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
