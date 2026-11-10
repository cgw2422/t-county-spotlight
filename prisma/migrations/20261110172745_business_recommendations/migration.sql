-- AlterTable
ALTER TABLE "Business" ADD COLUMN     "recommendationCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "recommendationsDisabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "BusinessRecommendation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "ipHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BusinessRecommendation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BusinessRecommendation_businessId_createdAt_idx" ON "BusinessRecommendation"("businessId", "createdAt");

-- CreateIndex
CREATE INDEX "BusinessRecommendation_createdAt_idx" ON "BusinessRecommendation"("createdAt");

-- CreateIndex
CREATE INDEX "BusinessRecommendation_ipHash_idx" ON "BusinessRecommendation"("ipHash");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessRecommendation_userId_businessId_key" ON "BusinessRecommendation"("userId", "businessId");

-- CreateIndex
CREATE INDEX "Business_recommendationCount_idx" ON "Business"("recommendationCount");

-- AddForeignKey
ALTER TABLE "BusinessRecommendation" ADD CONSTRAINT "BusinessRecommendation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessRecommendation" ADD CONSTRAINT "BusinessRecommendation_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
