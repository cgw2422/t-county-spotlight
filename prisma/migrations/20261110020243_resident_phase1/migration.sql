-- CreateEnum
CREATE TYPE "FoodTruckStopStatus" AS ENUM ('SCHEDULED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "GarageSaleType" AS ENUM ('GARAGE', 'YARD', 'MULTI_FAMILY', 'ESTATE', 'CHURCH_RUMMAGE', 'COMMUNITY_WIDE', 'OTHER');

-- CreateEnum
CREATE TYPE "GarageSaleStatus" AS ENUM ('PENDING', 'PUBLISHED', 'REJECTED', 'REMOVED');

-- CreateEnum
CREATE TYPE "AddressVisibility" AS ENUM ('EXACT', 'GENERAL');

-- AlterTable
ALTER TABLE "Business" ADD COLUMN     "cuisine" TEXT,
ADD COLUMN     "isFoodTruck" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "menuUrl" TEXT;

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "vendorInfo" TEXT;

-- CreateTable
CREATE TABLE "FoodTruckStop" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "locationName" TEXT NOT NULL,
    "address" TEXT,
    "city" TEXT,
    "notes" TEXT,
    "status" "FoodTruckStopStatus" NOT NULL DEFAULT 'SCHEDULED',
    "cancelledAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "seriesId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FoodTruckStop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GarageSale" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "saleType" "GarageSaleType" NOT NULL DEFAULT 'GARAGE',
    "itemCategories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "address" TEXT,
    "generalLocation" TEXT,
    "addressVisibility" "AddressVisibility" NOT NULL DEFAULT 'GENERAL',
    "city" TEXT,
    "zip" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "dailyStart" TEXT NOT NULL,
    "dailyEnd" TEXT NOT NULL,
    "photos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "submitterName" TEXT,
    "submitterEmail" TEXT NOT NULL,
    "userId" TEXT,
    "manageTokenHash" TEXT,
    "status" "GarageSaleStatus" NOT NULL DEFAULT 'PENDING',
    "rejectionReason" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "removedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GarageSale_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FoodTruckStop_startAt_status_idx" ON "FoodTruckStop"("startAt", "status");

-- CreateIndex
CREATE INDEX "FoodTruckStop_businessId_startAt_idx" ON "FoodTruckStop"("businessId", "startAt");

-- CreateIndex
CREATE INDEX "FoodTruckStop_seriesId_idx" ON "FoodTruckStop"("seriesId");

-- CreateIndex
CREATE UNIQUE INDEX "GarageSale_slug_key" ON "GarageSale"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "GarageSale_manageTokenHash_key" ON "GarageSale"("manageTokenHash");

-- CreateIndex
CREATE INDEX "GarageSale_status_endDate_idx" ON "GarageSale"("status", "endDate");

-- CreateIndex
CREATE INDEX "GarageSale_city_idx" ON "GarageSale"("city");

-- AddForeignKey
ALTER TABLE "FoodTruckStop" ADD CONSTRAINT "FoodTruckStop_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
