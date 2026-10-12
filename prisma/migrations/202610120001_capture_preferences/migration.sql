CREATE TABLE "CapturePreference" (
  "workspaceId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "instructions" TEXT NOT NULL DEFAULT '',
  "reminderMinutes" INTEGER NOT NULL DEFAULT 0,
  "proactiveEnabled" BOOLEAN NOT NULL DEFAULT false,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CapturePreference_pkey" PRIMARY KEY ("workspaceId", "userId"),
  CONSTRAINT "CapturePreference_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CapturePreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
