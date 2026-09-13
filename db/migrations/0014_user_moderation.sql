ALTER TABLE "user" ADD COLUMN "role" TEXT DEFAULT 'user' NOT NULL;
ALTER TABLE "user" ADD COLUMN "banned" INTEGER DEFAULT 0 NOT NULL;
ALTER TABLE "user" ADD COLUMN "ban_reason" TEXT;
ALTER TABLE "user" ADD COLUMN "ban_expires" INTEGER;
ALTER TABLE "session" ADD COLUMN "impersonated_by" TEXT;

UPDATE "user" SET "role" = 'admin' WHERE "id" IN (SELECT "user_id" FROM "admin");
