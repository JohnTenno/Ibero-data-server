-- CreateEnum
CREATE TYPE "Survey" AS ENUM ('ENIGH', 'ENOE', 'INPC', 'ENADID', 'ENVIPE', 'CENSO', 'ENDUTIH', 'OTRA');

-- CreateEnum
CREATE TYPE "PeriodType" AS ENUM ('ANNUAL', 'QUARTERLY', 'MONTHLY', 'BIANNUAL', 'ONE_TIME', 'MULTIYEAR');

-- CreateEnum
CREATE TYPE "AnalysisStatus" AS ENUM ('PENDING', 'RUNNING', 'DONE', 'FAILED');

-- AlterTable
ALTER TABLE "datasets" ADD COLUMN     "changelog" TEXT,
ADD COLUMN     "licenseId" TEXT,
ADD COLUMN     "periodType" "PeriodType",
ADD COLUMN     "revision" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "revisionOfId" TEXT,
ADD COLUMN     "sourceOrg" TEXT,
ADD COLUMN     "sourceUrl" TEXT,
ADD COLUMN     "supersededById" TEXT,
ADD COLUMN     "survey" "Survey",
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "year" INTEGER;

-- AlterTable
ALTER TABLE "resources" ADD COLUMN     "columns" JSONB;

-- CreateTable
CREATE TABLE "analyses" (
    "id" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,
    "sourceResourceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "folder" TEXT NOT NULL,
    "description" TEXT,
    "visibility" "DatasetVisibility" NOT NULL DEFAULT 'PRIVATE',
    "recipe" JSONB NOT NULL,
    "status" "AnalysisStatus" NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,
    "resultStorageKey" TEXT,
    "resultRowCount" INTEGER,
    "resultColumns" JSONB,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "analyses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "analyses_slug_key" ON "analyses"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "datasets_supersededById_key" ON "datasets"("supersededById");

-- AddForeignKey
ALTER TABLE "datasets" ADD CONSTRAINT "datasets_revisionOfId_fkey" FOREIGN KEY ("revisionOfId") REFERENCES "datasets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "datasets" ADD CONSTRAINT "datasets_supersededById_fkey" FOREIGN KEY ("supersededById") REFERENCES "datasets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analyses" ADD CONSTRAINT "analyses_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "datasets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analyses" ADD CONSTRAINT "analyses_sourceResourceId_fkey" FOREIGN KEY ("sourceResourceId") REFERENCES "resources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analyses" ADD CONSTRAINT "analyses_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

