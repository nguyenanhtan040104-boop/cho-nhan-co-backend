-- AlterTable — add GPS coords to Product (idempotent so Railway retry doesn't fail)
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "latitude"  DOUBLE PRECISION;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "longitude" DOUBLE PRECISION;
