-- CreateTable
CREATE TABLE "harmonizer_surveys" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "harmonizer_surveys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "harmonizer_datasets" (
    "id" TEXT NOT NULL,
    "surveyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "columns" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "harmonizer_datasets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "harmonizer_raw_rows" (
    "id" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,
    "rowIndex" INTEGER NOT NULL,
    "data" JSONB NOT NULL,

    CONSTRAINT "harmonizer_raw_rows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "harmonizer_canonical_variables" (
    "id" TEXT NOT NULL,
    "surveyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "dataType" TEXT NOT NULL DEFAULT 'text',

    CONSTRAINT "harmonizer_canonical_variables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "harmonizer_mappings" (
    "id" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,
    "sourceColumn" TEXT NOT NULL,
    "canonicalVariableId" TEXT NOT NULL,

    CONSTRAINT "harmonizer_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "harmonizer_surveys_name_key" ON "harmonizer_surveys"("name");

-- CreateIndex
CREATE INDEX "harmonizer_datasets_surveyId_idx" ON "harmonizer_datasets"("surveyId");

-- CreateIndex
CREATE INDEX "harmonizer_raw_rows_datasetId_rowIndex_idx" ON "harmonizer_raw_rows"("datasetId", "rowIndex");

-- CreateIndex
CREATE INDEX "harmonizer_canonical_variables_surveyId_idx" ON "harmonizer_canonical_variables"("surveyId");

-- CreateIndex
CREATE UNIQUE INDEX "harmonizer_canonical_variables_surveyId_name_key" ON "harmonizer_canonical_variables"("surveyId", "name");

-- CreateIndex
CREATE INDEX "harmonizer_mappings_datasetId_idx" ON "harmonizer_mappings"("datasetId");

-- CreateIndex
CREATE INDEX "harmonizer_mappings_canonicalVariableId_idx" ON "harmonizer_mappings"("canonicalVariableId");

-- CreateIndex
CREATE UNIQUE INDEX "harmonizer_mappings_datasetId_sourceColumn_key" ON "harmonizer_mappings"("datasetId", "sourceColumn");

-- AddForeignKey
ALTER TABLE "harmonizer_datasets" ADD CONSTRAINT "harmonizer_datasets_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "harmonizer_surveys"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "harmonizer_raw_rows" ADD CONSTRAINT "harmonizer_raw_rows_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "harmonizer_datasets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "harmonizer_canonical_variables" ADD CONSTRAINT "harmonizer_canonical_variables_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "harmonizer_surveys"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "harmonizer_mappings" ADD CONSTRAINT "harmonizer_mappings_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "harmonizer_datasets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "harmonizer_mappings" ADD CONSTRAINT "harmonizer_mappings_canonicalVariableId_fkey" FOREIGN KEY ("canonicalVariableId") REFERENCES "harmonizer_canonical_variables"("id") ON DELETE CASCADE ON UPDATE CASCADE;
