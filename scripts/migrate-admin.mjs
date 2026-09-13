import { createClient } from "@libsql/client";
import * as fs from "fs";

function parseEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const content = fs.readFileSync(filePath, "utf-8");
  const env = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx !== -1) {
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      env[key] = val;
    }
  }
  return env;
}

const STATEMENTS = [
  `ALTER TABLE "user" ADD COLUMN "role" TEXT DEFAULT 'user' NOT NULL;`,
  `ALTER TABLE "user" ADD COLUMN "banned" INTEGER DEFAULT 0 NOT NULL;`,
  `ALTER TABLE "user" ADD COLUMN "ban_reason" TEXT;`,
  `ALTER TABLE "user" ADD COLUMN "ban_expires" INTEGER;`,
  `ALTER TABLE "session" ADD COLUMN "impersonated_by" TEXT;`,
  `UPDATE "user" SET "role" = 'admin' WHERE "id" IN (SELECT "user_id" FROM "admin");`,
];

async function applyMigration(name, envFile) {
  console.log(`\n========================================`);
  console.log(`Applying migration 0014 to: ${name} (${envFile})`);
  console.log(`========================================`);

  const env = parseEnv(envFile);
  const url = env.TURSO_DATABASE_URL;
  const authToken = env.TURSO_AUTH_TOKEN;

  if (!url || !authToken) {
    console.error(`[SKIP] Missing credentials in ${envFile}`);
    return false;
  }

  const client = createClient({ url, authToken });

  try {
    const existingCols = await client.execute("PRAGMA table_info(user)");
    const colNames = new Set(existingCols.rows.map((r) => r.name));

    for (const stmt of STATEMENTS) {
      const trimmed = stmt.trim();
      if (!trimmed) continue;

      // Skip ALTER TABLE ADD COLUMN if the column already exists
      if (trimmed.startsWith('ALTER TABLE "user" ADD COLUMN "role"') && colNames.has("role")) {
        console.log(`- Column "role" already exists on "user", skipping.`);
        continue;
      }
      if (trimmed.startsWith('ALTER TABLE "user" ADD COLUMN "banned"') && colNames.has("banned")) {
        console.log(`- Column "banned" already exists on "user", skipping.`);
        continue;
      }
      if (trimmed.startsWith('ALTER TABLE "user" ADD COLUMN "ban_reason"') && colNames.has("ban_reason")) {
        console.log(`- Column "ban_reason" already exists on "user", skipping.`);
        continue;
      }
      if (trimmed.startsWith('ALTER TABLE "user" ADD COLUMN "ban_expires"') && colNames.has("ban_expires")) {
        console.log(`- Column "ban_expires" already exists on "user", skipping.`);
        continue;
      }

      console.log(`Executing: ${trimmed.slice(0, 60)}...`);
      await client.execute(trimmed);
      console.log(`  -> Success`);
    }

    // Verify
    const updatedUserCols = await client.execute("PRAGMA table_info(user)");
    console.log(`Updated user columns:`, updatedUserCols.rows.map((r) => r.name).join(", "));

    const updatedSessionCols = await client.execute("PRAGMA table_info(session)");
    console.log(`Updated session columns:`, updatedSessionCols.rows.map((r) => r.name).join(", "));

    const adminUsers = await client.execute("SELECT id, name, email, role, banned FROM user WHERE role = 'admin'");
    console.log(`Admin users verified:`, JSON.stringify(adminUsers.rows, null, 2));

    return true;
  } catch (err) {
    console.error(`[ERROR] Failed migrating ${name}:`, err);
    return false;
  }
}

async function main() {
  const previewSuccess = await applyMigration("Preview Database", ".env.preview.local");
  const prodSuccess = await applyMigration("Production/Local Database", ".env.local");

  if (previewSuccess && prodSuccess) {
    console.log("\n[SUCCESS] Migration 0014 applied successfully to both Preview and Production databases.");
    process.exit(0);
  } else {
    console.error("\n[FAILURE] One or more migrations failed.");
    process.exit(1);
  }
}

main();
