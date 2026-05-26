-- CreateTable (idempotent — safe to re-run if previous attempt partially succeeded)
CREATE TABLE IF NOT EXISTS "BlockedIp" (
    "id" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "reason" TEXT,
    "blockedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BlockedIp_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "BlockedIp_ip_key" ON "BlockedIp"("ip");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BlockedIp_ip_idx" ON "BlockedIp"("ip");
