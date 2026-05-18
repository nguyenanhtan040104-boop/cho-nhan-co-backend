-- AlterTable: add googleId column and make password optional
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "googleId" TEXT;
ALTER TABLE "User" ALTER COLUMN "password" SET DEFAULT '';

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "User_googleId_key" ON "User"("googleId");
