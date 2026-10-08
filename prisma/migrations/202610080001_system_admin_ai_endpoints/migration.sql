-- AlterTable
ALTER TABLE "User" ADD COLUMN "isSystemAdmin" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "AIEndpoint" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'openai',
    "baseUrl" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "encryptedKey" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AIEndpoint_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AIEndpoint_name_key" ON "AIEndpoint"("name");

-- CreateIndex
CREATE INDEX "AIEndpoint_active_idx" ON "AIEndpoint"("active");
