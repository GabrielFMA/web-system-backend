-- CreateEnum
CREATE TYPE "SessionRetentionMode" AS ENUM ('DELETE', 'REVOKE');

-- AlterTable
ALTER TABLE "UserMeta"
ADD COLUMN "maxSessions" INTEGER,
ADD COLUMN "sessionRetentionMode" "SessionRetentionMode";

-- CreateTable
CREATE TABLE "SystemConfig" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "maxSessionsGlobal" INTEGER NOT NULL DEFAULT 0,
    "sessionRetentionMode" "SessionRetentionMode" NOT NULL DEFAULT 'REVOKE',
    "idleTimeoutMinutes" INTEGER NOT NULL DEFAULT 30,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemConfig_pkey" PRIMARY KEY ("id")
);

-- Seed a default singleton row
INSERT INTO "SystemConfig" ("id", "maxSessionsGlobal", "sessionRetentionMode", "idleTimeoutMinutes", "updatedAt")
VALUES (1, 0, 'REVOKE', 30, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

