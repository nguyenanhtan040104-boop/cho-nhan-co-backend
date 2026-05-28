-- CreateTable
CREATE TABLE "SearchLog" (
    "id" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT '',
    "count" INTEGER NOT NULL DEFAULT 1,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SearchLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (unique pair so we can upsert per (query, category))
CREATE UNIQUE INDEX "SearchLog_query_category_key" ON "SearchLog"("query", "category");

-- CreateIndex
CREATE INDEX "SearchLog_count_idx" ON "SearchLog"("count" DESC);

-- CreateIndex
CREATE INDEX "SearchLog_category_count_idx" ON "SearchLog"("category", "count" DESC);

-- CreateIndex
CREATE INDEX "SearchLog_lastSeenAt_idx" ON "SearchLog"("lastSeenAt");
