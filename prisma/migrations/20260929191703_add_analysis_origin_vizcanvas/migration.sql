-- CreateEnum
CREATE TYPE "AnalysisOrigin" AS ENUM ('IBERO', 'VIZCANVAS');

-- AlterTable
ALTER TABLE "analyses" ADD COLUMN     "origin" "AnalysisOrigin" NOT NULL DEFAULT 'IBERO',
ADD COLUMN     "vizcanvasRecipe" JSONB;
