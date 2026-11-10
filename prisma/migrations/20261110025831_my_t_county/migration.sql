-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "SavedType" ADD VALUE 'GARAGE_SALE';
ALTER TYPE "SavedType" ADD VALUE 'ORGANIZATION';
ALTER TYPE "SavedType" ADD VALUE 'PULSE';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "extraCommunities" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "homeCommunity" TEXT,
ADD COLUMN     "interestKeys" TEXT[] DEFAULT ARRAY[]::TEXT[];
