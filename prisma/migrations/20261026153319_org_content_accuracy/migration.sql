-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "imageRights" TEXT,
ADD COLUMN     "infoCheckedAt" TIMESTAMP(3),
ADD COLUMN     "sourceUrls" TEXT[] DEFAULT ARRAY[]::TEXT[];
