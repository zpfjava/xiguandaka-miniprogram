-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_wishlists" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "starsCost" INTEGER NOT NULL,
    "savedStars" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "redeemedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "wishlists_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_wishlists" ("createdAt", "description", "id", "redeemedAt", "starsCost", "status", "title", "updatedAt", "userId") SELECT "createdAt", "description", "id", "redeemedAt", "starsCost", "status", "title", "updatedAt", "userId" FROM "wishlists";
DROP TABLE "wishlists";
ALTER TABLE "new_wishlists" RENAME TO "wishlists";
CREATE INDEX "wishlists_userId_idx" ON "wishlists"("userId");
CREATE INDEX "wishlists_status_idx" ON "wishlists"("status");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
