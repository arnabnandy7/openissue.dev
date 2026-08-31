import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getSession,
  insert,
  values,
  onConflictDoNothing,
  select,
  from,
  selectWhere,
  orderBy,
  deleteFromDatabase,
  deleteWhere,
} = vi.hoisted(() => ({
  getSession: vi.fn(),
  insert: vi.fn(),
  values: vi.fn(),
  onConflictDoNothing: vi.fn(),
  select: vi.fn(),
  from: vi.fn(),
  selectWhere: vi.fn(),
  orderBy: vi.fn(),
  deleteFromDatabase: vi.fn(),
  deleteWhere: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession } } }));
vi.mock("@/lib/db", () => ({
  getDatabase: () => ({
    insert,
    select,
    delete: deleteFromDatabase,
  }),
}));

import { POST } from "@/app/api/saved-searches/route";
import { DELETE } from "@/app/api/saved-searches/[id]/route";

const savedSearch = {
  id: "saved-1",
  name: "React help",
  tech: "React",
  label: "help-wanted",
  sort: "updated",
  linkedPr: "any",
  hacktoberfest: "any",
  readiness: "any",
  createdAt: "2026-08-19T00:00:00.000Z",
};

describe("saved searches API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSession.mockResolvedValue({ user: { id: "user-1" } });
    insert.mockReturnValue({ values });
    values.mockReturnValue({ onConflictDoNothing });
    onConflictDoNothing.mockResolvedValue(undefined);
    select.mockReturnValue({ from });
    from.mockReturnValue({ where: selectWhere });
    selectWhere.mockReturnValue({ orderBy });
    orderBy.mockResolvedValue([
      { ...savedSearch, userId: "user-1", createdAt: new Date(savedSearch.createdAt) },
    ]);
    deleteFromDatabase.mockReturnValue({ where: deleteWhere });
    deleteWhere.mockResolvedValue(undefined);
  });

  it("requires authentication for syncing and deleting", async () => {
    getSession.mockResolvedValue(null);

    const syncResponse = await POST(
      new Request("http://localhost/api/saved-searches", {
        method: "POST",
        body: JSON.stringify({ searches: [] }),
      }),
    );
    const deleteResponse = await DELETE(
      new Request("http://localhost/api/saved-searches/saved-1", {
        method: "DELETE",
      }),
      { params: Promise.resolve({ id: "saved-1" }) },
    );

    expect(syncResponse.status).toBe(401);
    expect(deleteResponse.status).toBe(401);
  });

  it("rejects malformed or unsafe sync payloads", async () => {
    const invalidJson = await POST(
      new Request("http://localhost/api/saved-searches", {
        method: "POST",
        body: "not-json",
      }),
    );
    const invalidSearch = await POST(
      new Request("http://localhost/api/saved-searches", {
        method: "POST",
        body: JSON.stringify({ searches: [{ ...savedSearch, createdAt: "invalid" }] }),
      }),
    );
    const malformedSearch = await POST(
      new Request("http://localhost/api/saved-searches", {
        method: "POST",
        body: JSON.stringify({ searches: [{}] }),
      }),
    );
    const oversizedBatch = await POST(
      new Request("http://localhost/api/saved-searches", {
        method: "POST",
        body: JSON.stringify({ searches: Array(101).fill(savedSearch) }),
      }),
    );

    expect(invalidJson.status).toBe(400);
    expect(invalidSearch.status).toBe(400);
    expect(malformedSearch.status).toBe(400);
    expect(oversizedBatch.status).toBe(400);
    expect(insert).not.toHaveBeenCalled();
  });

  it("migrates local searches and returns all searches for the user", async () => {
    const response = await POST(
      new Request("http://localhost/api/saved-searches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ searches: [savedSearch] }),
      }),
    );

    expect(response.status).toBe(200);
    expect(values).toHaveBeenCalledWith({
      ...savedSearch,
      userId: "user-1",
      createdAt: new Date(savedSearch.createdAt),
    });
    expect(await response.json()).toEqual({ searches: [savedSearch] });
  });

  it("deletes only the signed-in user's record", async () => {
    const response = await DELETE(
      new Request("http://localhost/api/saved-searches/saved-1", {
        method: "DELETE",
      }),
      { params: Promise.resolve({ id: "saved-1" }) },
    );

    expect(response.status).toBe(204);
    expect(deleteFromDatabase).toHaveBeenCalledOnce();
    expect(deleteWhere).toHaveBeenCalledOnce();
  });
});
