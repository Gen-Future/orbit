ALTER TABLE "Report" ADD COLUMN "authorId" TEXT,
ADD COLUMN "templateId" TEXT, ADD COLUMN "templateVersion" INTEGER,
ADD COLUMN "templateSnapshot" JSONB, ADD COLUMN "sourceSnapshot" JSONB,
ADD COLUMN "generatedContent" TEXT, ADD COLUMN "generationMode" TEXT NOT NULL DEFAULT 'legacy',
ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1, ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "styleSuggestion" JSONB, ADD COLUMN "suggestionStatus" TEXT NOT NULL DEFAULT 'none',
ADD COLUMN "suggestionRevision" INTEGER, ADD COLUMN "suggestionCheckedRevision" INTEGER,
ADD COLUMN "planDraft" JSONB, ADD COLUMN "planBatchId" TEXT;
ALTER TABLE "Report" ADD CONSTRAINT "Report_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Report_workspaceId_startAt_idx" ON "Report"("workspaceId", "startAt");
ALTER TABLE "Item" ADD COLUMN "sourceReportId" TEXT;
ALTER TABLE "Item" ADD CONSTRAINT "Item_sourceReportId_fkey" FOREIGN KEY ("sourceReportId") REFERENCES "Report"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE TABLE "ReportTemplate" (
"id" TEXT NOT NULL PRIMARY KEY, "workspaceId" TEXT NOT NULL, "userId" TEXT NOT NULL,
"definition" JSONB NOT NULL, "version" INTEGER NOT NULL DEFAULT 1, "history" JSONB NOT NULL,
"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
CONSTRAINT "ReportTemplate_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
CONSTRAINT "ReportTemplate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE);
CREATE UNIQUE INDEX "ReportTemplate_workspaceId_userId_key" ON "ReportTemplate"("workspaceId", "userId");
CREATE TABLE "CalendarCache" ("year" INTEGER NOT NULL PRIMARY KEY, "days" JSONB NOT NULL,
"papers" TEXT[] NOT NULL, "checksum" TEXT NOT NULL, "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
