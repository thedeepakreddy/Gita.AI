-- CreateTable
CREATE TABLE "CitationViolation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "conversationId" TEXT,
    "provider" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "cited" TEXT NOT NULL,
    "supplied" TEXT NOT NULL,
    "afterRetry" BOOLEAN NOT NULL DEFAULT false,
    "question" TEXT NOT NULL,
    "reply" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "CitationViolation_createdAt_idx" ON "CitationViolation"("createdAt");
