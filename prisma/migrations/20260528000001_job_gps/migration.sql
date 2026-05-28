-- AlterTable — add GPS coords to Job (idempotent)
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "latitude"  DOUBLE PRECISION;
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "longitude" DOUBLE PRECISION;
