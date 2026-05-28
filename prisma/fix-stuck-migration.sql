-- Idempotent fix for migrations Railway has marked as "failed".
-- Runs before `prisma migrate deploy` on every container startup.
-- After the first successful run, all statements become no-ops.

-- ─── 1. BlockedIp table (migration 20260526000000_add_blocked_ip) ────
CREATE TABLE IF NOT EXISTS "BlockedIp" (
    "id"        TEXT         NOT NULL,
    "ip"        TEXT         NOT NULL,
    "reason"    TEXT,
    "blockedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BlockedIp_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "BlockedIp_ip_key" ON "BlockedIp"("ip");
CREATE INDEX        IF NOT EXISTS "BlockedIp_ip_idx" ON "BlockedIp"("ip");

-- ─── 2. SearchLog table (migration 20260527000000_add_search_log) ────
CREATE TABLE IF NOT EXISTS "SearchLog" (
    "id"         TEXT         NOT NULL,
    "query"      TEXT         NOT NULL,
    "category"   TEXT         NOT NULL DEFAULT '',
    "count"      INTEGER      NOT NULL DEFAULT 1,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SearchLog_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "SearchLog_query_category_key"
    ON "SearchLog"("query", "category");
CREATE INDEX IF NOT EXISTS "SearchLog_count_idx"
    ON "SearchLog"("count" DESC);
CREATE INDEX IF NOT EXISTS "SearchLog_category_count_idx"
    ON "SearchLog"("category", "count" DESC);
CREATE INDEX IF NOT EXISTS "SearchLog_lastSeenAt_idx"
    ON "SearchLog"("lastSeenAt");

-- ─── 3. Product GPS columns (migration 20260528000000_product_gps) ───
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "latitude"  DOUBLE PRECISION;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "longitude" DOUBLE PRECISION;

-- ─── 4. Patch _prisma_migrations: mark our known migrations applied ──
-- The WHERE clause is intentionally specific (by migration_name) so an
-- unrelated future migration that legitimately fails will NOT be hidden.
UPDATE "_prisma_migrations"
SET finished_at         = COALESCE(finished_at, NOW()),
    applied_steps_count = GREATEST(applied_steps_count, 1),
    logs                = NULL,
    rolled_back_at      = NULL
WHERE migration_name IN (
    '20260526000000_add_blocked_ip',
    '20260527000000_add_search_log',
    '20260528000000_product_gps'
);
