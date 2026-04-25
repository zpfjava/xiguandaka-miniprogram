-- CreateTable
CREATE TABLE "daily_checkins" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "stars" INTEGER NOT NULL,
    "streak" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "daily_checkins_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "daily_checkins_userId_idx" ON "daily_checkins"("userId");

-- CreateIndex
CREATE INDEX "daily_checkins_createdAt_idx" ON "daily_checkins"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "daily_checkins_userId_createdAt_key" ON "daily_checkins"("userId", "createdAt");
