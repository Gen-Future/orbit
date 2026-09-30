ALTER TABLE "Item" ADD COLUMN "deletedAt" TIMESTAMP(3);
CREATE INDEX "Item_workspaceId_deletedAt_idx" ON "Item"("workspaceId", "deletedAt");
