-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "openid" TEXT,
    "phone" TEXT,
    "password" TEXT,
    "nickname" TEXT,
    "avatar" TEXT,
    "grade" TEXT,
    "totalStars" INTEGER NOT NULL DEFAULT 0,
    "currentStars" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_users" ("avatar", "createdAt", "currentStars", "id", "nickname", "openid", "totalStars", "updatedAt") SELECT "avatar", "createdAt", "currentStars", "id", "nickname", "openid", "totalStars", "updatedAt" FROM "users";
DROP TABLE "users";
ALTER TABLE "new_users" RENAME TO "users";
CREATE UNIQUE INDEX "users_openid_key" ON "users"("openid");
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
