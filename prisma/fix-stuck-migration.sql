-- Idempotent fix for the stuck 20260526000000_add_blocked_ip migration.
-- Runs via `prisma db execute --file` on every startup.
-- After the first successful run, all statements become no-ops.

-- 1. Ensure the BlockedIp table exists (in case the original migration
--    partially committed before the connection dropped)
CREATE TABLE IF NOT EXISTS "BlockedIp" (
    "id"        TEXT         NOT NULL,
    "ip"        TEXT         NOT NULL,
    "reason"    TEXT,
    "blockedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BlockedIp_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "BlockedIp_ip_key" ON "BlockedIp"("ip");
CREATE INDEX IF NOT EXISTS "BlockedIp_ip_idx" ON "BlockedIp"("ip");

-- 2. Patch _prisma_migrations: mark the stuck migration as cleanly applied
--    so prisma migrate deploy stops blocking on it.
UPDATE "_prisma_migrations"
SET finished_at         = COALESCE(finished_at, NOW()),
    applied_steps_count = GREATEST(applied_steps_count, 3),
    logs                = NULL,
    rolled_back_at      = NULL
WHERE migration_name = '20260526000000_add_blocked_ip';
