-- CreateEnum
CREATE TYPE "OfferingKind" AS ENUM ('SERVICES', 'MENU');

-- AlterTable
ALTER TABLE "BusinessPhoto" ADD COLUMN     "isPrimary" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "visibleOnFree" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "BusinessOfferingSection" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "kind" "OfferingKind" NOT NULL DEFAULT 'SERVICES',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessOfferingSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessOfferingItem" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessOfferingItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BusinessOfferingSection_businessId_sortOrder_idx" ON "BusinessOfferingSection"("businessId", "sortOrder");

-- CreateIndex
CREATE INDEX "BusinessOfferingItem_sectionId_sortOrder_idx" ON "BusinessOfferingItem"("sectionId", "sortOrder");

-- AddForeignKey
ALTER TABLE "BusinessOfferingSection" ADD CONSTRAINT "BusinessOfferingSection_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessOfferingItem" ADD CONSTRAINT "BusinessOfferingItem_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "BusinessOfferingSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
