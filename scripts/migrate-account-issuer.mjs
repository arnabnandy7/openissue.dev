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
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      env[key] = val;
    }
  }
  return env;
}

async function applyMigration(name, envFile) {
  console.log(`\n========================================`);
  console.log(`Applying migration 0015 to: ${name} (${envFile})`);
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
    const tableInfo = await client.execute("PRAGMA table_info(account)");
    const colNames = new Set(tableInfo.rows.map((r) => r.name));

    const indexInfo = await client.execute("PRAGMA index_list(account)");
    const indexNames = new Set(indexInfo.rows.map((r) => r.name));

    if (indexNames.has("account_issuer_accountId_uidx")) {
      console.log(`Dropping index "account_issuer_accountId_uidx"...`);
      await client.execute('DROP INDEX IF EXISTS "account_issuer_accountId_uidx";');
      console.log(`  -> Index dropped`);
    } else {
      console.log(`Index "account_issuer_accountId_uidx" does not exist, skipping drop.`);
    }

    if (colNames.has("issuer")) {
      console.log(`Dropping column "issuer" from "account"...`);
      await client.execute('ALTER TABLE "account" DROP COLUMN "issuer";');
      console.log(`  -> Column dropped`);
    } else {
      console.log(`Column "issuer" does not exist on "account", skipping drop.`);
    }

    // Verification
    const updatedTableInfo = await client.execute("PRAGMA table_info(account)");
    const remainingCols = updatedTableInfo.rows.map((r) => r.name);
    console.log(`Updated account columns:`, remainingCols.join(", "));

    const updatedIndexInfo = await client.execute("PRAGMA index_list(account)");
    console.log(`Updated account indexes:`, updatedIndexInfo.rows.map((r) => r.name).join(", "));

    const countResult = await client.execute("SELECT count(*) as count FROM account");
    console.log(`Account records preserved: ${countResult.rows[0].count}`);

    if (remainingCols.includes("issuer")) {
      throw new Error(`Column "issuer" is still present on table "account"!`);
    }

    return true;
  } catch (err) {
    console.error(`[ERROR] Failed migrating ${name}:`, err);
    return false;
  }
}

async function main() {
  const previewSuccess = await applyMigration("Preview Database", ".env.preview.local");
  const prodSuccess = await applyMigration("Production/Local Database", ".env.local");

  console.log(`\n========================================`);
  console.log(`Migration 0015 Summary:`);
  console.log(`Preview: ${previewSuccess ? "SUCCESS" : "FAILED"}`);
  console.log(`Production: ${prodSuccess ? "SUCCESS" : "FAILED"}`);
  console.log(`========================================\n`);

  if (!previewSuccess || !prodSuccess) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
