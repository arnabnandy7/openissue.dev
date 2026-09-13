import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSession, database, rowsByTable } = vi.hoisted(() => {
  const rowsByTable = new Map<unknown, unknown[]>();
  const database = {
    select: vi.fn().mockReturnValue({
      from: (table: unknown) => ({
        where: () => {
          const rows = rowsByTable.get(table) ?? [];
          const promise = Promise.resolve(rows);
          return {
            limit: async () => rows,
            then: promise.then.bind(promise),
          };
        },
      }),
    }),
  };
  return {
    getSession: vi.fn(),
    database,
    rowsByTable,
  };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession } } }));
vi.mock("@/lib/db", () => ({ getDatabase: () => database }));

import { admin, user } from "@/lib/auth-schema";
import { checkIsAdmin, getAdminSession } from "@/features/admin/server/admin-guard";

describe("admin guard server helper", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rowsByTable.clear();
  });

  it("returns true when user has role = 'admin'", async () => {
    rowsByTable.set(user, [{ role: "admin" }]);

    const isAdmin = await checkIsAdmin("user-1");
    expect(isAdmin).toBe(true);
  });

  it("falls back to admin table when user role is not admin", async () => {
    rowsByTable.set(user, [{ role: "user" }]);
    rowsByTable.set(admin, [{ userId: "user-2" }]);

    const isAdmin = await checkIsAdmin("user-2");
    expect(isAdmin).toBe(true);
  });

  it("returns false when user is neither admin role nor in admin table", async () => {
    rowsByTable.set(user, [{ role: "user" }]);
    rowsByTable.set(admin, []);

    const isAdmin = await checkIsAdmin("user-3");
    expect(isAdmin).toBe(false);
  });

  it("returns session and isAdmin status from getAdminSession", async () => {
    getSession.mockResolvedValue({
      user: { id: "admin-1", email: "admin@example.com" },
    });
    rowsByTable.set(user, [{ role: "admin" }]);

    const headers = new Headers();
    const result = await getAdminSession(headers);

    expect(result.session).toBeDefined();
    expect(result.isAdmin).toBe(true);
  });

  it("returns null session when unauthenticated", async () => {
    getSession.mockResolvedValue(null);

    const headers = new Headers();
    const result = await getAdminSession(headers);

    expect(result.session).toBeNull();
    expect(result.isAdmin).toBe(false);
  });
});
