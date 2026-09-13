import { diffSchema, getExpectedSchema } from "@better-auth/core/db/internal";
import { getTableColumns, is, Table } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import * as schema from "@/lib/auth-schema";

function introspectDrizzleSchema(drizzleSchema: Record<string, unknown>) {
  const tables: Array<{
    name: string;
    columns: Array<{ name: string; nullable: boolean; hasDefault: boolean }>;
  }> = [];

  for (const [name, table] of Object.entries(drizzleSchema)) {
    if (!is(table, Table)) continue;
    const columns = Object.entries(getTableColumns(table)).map(
      ([key, column]) => ({
        name: key,
        nullable: !column.notNull,
        hasDefault:
          column.hasDefault ||
          (column as { generated?: unknown }).generated !== undefined,
      }),
    );
    tables.push({ name, columns });
  }

  return tables;
}

describe("auth schema compatibility", () => {
  it("does not have schema mismatch findings against Better Auth expected schema", () => {
    const introspected = introspectDrizzleSchema(
      schema as unknown as Record<string, unknown>,
    );
    const expected = getExpectedSchema({});
    const findings = diffSchema(expected, introspected);

    expect(findings).toEqual([]);
  });

  it("account table definition matches Better Auth without legacy issuer column", () => {
    const columns = getTableColumns(schema.account);
    const columnKeys = Object.keys(columns);

    expect(columnKeys).not.toContain("issuer");
    expect(columnKeys).toContain("id");
    expect(columnKeys).toContain("accountId");
    expect(columnKeys).toContain("providerId");
    expect(columnKeys).toContain("userId");
  });
});
