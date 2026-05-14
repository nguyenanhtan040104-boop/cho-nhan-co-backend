-- Add balance column to User table (if not exists)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "balance" DECIMAL NOT NULL DEFAULT 0;

-- Create Transaction table (if not exists)
CREATE TABLE IF NOT EXISTS "Transaction" (
    "id"          TEXT NOT NULL,
    "userId"      TEXT NOT NULL,
    "type"        TEXT NOT NULL,
    "amount"      DECIMAL NOT NULL,
    "description" TEXT NOT NULL,
    "status"      TEXT NOT NULL DEFAULT 'pending',
    "refType"     TEXT,
    "refId"       TEXT,
    "adminNote"   TEXT,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- Add foreign key (if not exists)
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'Transaction_userId_fkey'
    ) THEN
        ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

-- Add indexes
CREATE INDEX IF NOT EXISTS "Transaction_userId_idx" ON "Transaction"("userId");
CREATE INDEX IF NOT EXISTS "Transaction_status_idx" ON "Transaction"("status");
CREATE INDEX IF NOT EXISTS "Transaction_type_idx" ON "Transaction"("type");
