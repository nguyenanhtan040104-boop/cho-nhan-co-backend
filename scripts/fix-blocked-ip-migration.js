'use strict';
/**
 * One-shot migration fixer for the stuck 20260526000000_add_blocked_ip migration.
 * Runs before `prisma migrate deploy` in start:prod.
 *
 * What it does (all idempotent):
 *  1. Creates the BlockedIp table + indexes IF NOT EXISTS
 *  2. Marks the migration row in _prisma_migrations as finished (applied)
 *     so Prisma skips it on the next `migrate deploy`
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const MIGRATION_NAME = '20260526000000_add_blocked_ip';

async function run() {
  // 1. Ensure the table exists regardless of migration state
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "BlockedIp" (
      "id"        TEXT         NOT NULL,
      "ip"        TEXT         NOT NULL,
      "reason"    TEXT,
      "blockedBy" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "BlockedIp_pkey" PRIMARY KEY ("id")
    )
  `);
  await prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS "BlockedIp_ip_key" ON "BlockedIp"("ip")`
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "BlockedIp_ip_idx" ON "BlockedIp"("ip")`
  );

  // 2. Patch _prisma_migrations: mark the failed migration as applied
  //    Only updates when finished_at IS NULL (i.e. still stuck in failed state)
  const result = await prisma.$executeRawUnsafe(`
    UPDATE "_prisma_migrations"
    SET
      finished_at          = COALESCE(finished_at, NOW()),
      applied_steps_count  = 3,
      logs                 = NULL,
      rolled_back_at       = NULL
    WHERE migration_name = '${MIGRATION_NAME}'
      AND finished_at   IS NULL
  `);

  if (result > 0) {
    console.log(`[fix-migration] Marked ${MIGRATION_NAME} as applied in _prisma_migrations`);
  } else {
    console.log(`[fix-migration] ${MIGRATION_NAME} already resolved — nothing to do`);
  }
}

run()
  .catch(err => console.error('[fix-migration] Error (non-fatal):', err.message))
  .finally(() => prisma.$disconnect());
