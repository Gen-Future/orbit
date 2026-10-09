ALTER TABLE "Project" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "archivedAt" TIMESTAMP(3),
ADD COLUMN "deletedAt" TIMESTAMP(3);

DROP INDEX IF EXISTS "Project_workspaceId_idx";
CREATE INDEX "Project_workspaceId_archivedAt_deletedAt_idx" ON "Project"("workspaceId", "archivedAt", "deletedAt");

ALTER TABLE "Item" ADD COLUMN "triageStatus" TEXT NOT NULL DEFAULT 'pending';
UPDATE "Item" SET "triageStatus" = CASE WHEN "quadrant" BETWEEN 1 AND 4 THEN 'triaged' ELSE 'pending' END;
UPDATE "Item" SET "quadrant" = 2 WHERE "quadrant" NOT BETWEEN 1 AND 4;
ALTER TABLE "Item" ALTER COLUMN "quadrant" SET DEFAULT 2;
ALTER TABLE "Item" ADD CONSTRAINT "Item_quadrant_bounds" CHECK ("quadrant" BETWEEN 1 AND 4);
ALTER TABLE "Item" ADD CONSTRAINT "Item_triage_status" CHECK ("triageStatus" IN ('pending', 'triaged'));
CREATE INDEX "Item_workspaceId_triageStatus_status_idx" ON "Item"("workspaceId", "triageStatus", "status");
