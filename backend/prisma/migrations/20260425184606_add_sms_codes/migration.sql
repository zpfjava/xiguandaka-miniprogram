-- CreateTable
CREATE TABLE "sms_codes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "phone" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "ip" TEXT,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT,
    CONSTRAINT "sms_codes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "sms_codes_phone_idx" ON "sms_codes"("phone");

-- CreateIndex
CREATE INDEX "sms_codes_expiresAt_idx" ON "sms_codes"("expiresAt");

-- CreateIndex
CREATE INDEX "sms_codes_userId_idx" ON "sms_codes"("userId");
