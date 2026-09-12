-- CreateTable
CREATE TABLE "TranslationRevision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "verseId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'in-review',
    "translator" TEXT,
    "source" TEXT,
    "license" TEXT,
    "note" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TranslationRevision_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VoiceViolation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "conversationId" TEXT,
    "provider" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "matched" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "reply" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Bookmark" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "verseId" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Bookmark_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReadingProgress" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "scripture" TEXT NOT NULL,
    "chapter" INTEGER NOT NULL,
    "verse" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ReadingProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT,
    "email" TEXT,
    "emailVerified" DATETIME,
    "image" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "trialMessagesUsed" INTEGER NOT NULL DEFAULT 0,
    "role" TEXT NOT NULL DEFAULT 'user'
);
INSERT INTO "new_User" ("createdAt", "email", "emailVerified", "id", "image", "name", "trialMessagesUsed") SELECT "createdAt", "email", "emailVerified", "id", "image", "name", "trialMessagesUsed" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "TranslationRevision_locale_status_idx" ON "TranslationRevision"("locale", "status");

-- CreateIndex
CREATE UNIQUE INDEX "TranslationRevision_verseId_locale_key" ON "TranslationRevision"("verseId", "locale");

-- CreateIndex
CREATE INDEX "VoiceViolation_createdAt_idx" ON "VoiceViolation"("createdAt");

-- CreateIndex
CREATE INDEX "Bookmark_userId_createdAt_idx" ON "Bookmark"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Bookmark_userId_verseId_key" ON "Bookmark"("userId", "verseId");

-- CreateIndex
CREATE UNIQUE INDEX "ReadingProgress_userId_scripture_key" ON "ReadingProgress"("userId", "scripture");
