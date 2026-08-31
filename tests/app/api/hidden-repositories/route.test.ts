import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSession, select, from, where, remove, deleteWhere, and, eq } = vi.hoisted(() => ({
  getSession: vi.fn(),
  select: vi.fn(),
  from: vi.fn(),
  where: vi.fn(),
  remove: vi.fn(),
  deleteWhere: vi.fn(),
  and: vi.fn(),
  eq: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession } } }));
vi.mock("drizzle-orm", () => ({ and, eq }));
vi.mock("@/lib/db", () => ({
  getDatabase: () => ({ select, delete: remove }),
}));
vi.mock("@/lib/auth-schema", () => ({ hiddenRepository: {} }));

import { GET, DELETE } from "@/app/api/hidden-repositories/route";

describe("hidden-repositories API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSession.mockResolvedValue({ user: { id: "user-1" } });
    select.mockReturnValue({ from });
    from.mockReturnValue({ where });
    where.mockResolvedValue([]);
    remove.mockReturnValue({ where: deleteWhere });
    deleteWhere.mockResolvedValue(undefined);
  });

  it("requires authentication for GET", async () => {
    getSession.mockResolvedValue(null);
    expect((await GET(new Request("http://localhost/api/hidden-repositories"))).status).toBe(401);
  });

  it("requires authentication for DELETE", async () => {
    getSession.mockResolvedValue(null);
    expect((await DELETE(new Request("http://localhost/api/hidden-repositories"))).status).toBe(401);
  });

  it("returns repositories on GET", async () => {
    where.mockResolvedValue([{ id: "1", repositoryFullName: "acme/repo" }]);
    const response = await GET(new Request("http://localhost/api/hidden-repositories"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ repositories: [{ id: "1", repositoryFullName: "acme/repo" }] });
  });

  it("deletes repository on DELETE", async () => {
    const response = await DELETE(new Request("http://localhost/api/hidden-repositories?repositoryFullName=acme/repo"));
    expect(response.status).toBe(200);
    expect(remove).toHaveBeenCalled();
  });

  it("requires repo param for DELETE", async () => {
    const response = await DELETE(new Request("http://localhost/api/hidden-repositories"));
    expect(response.status).toBe(400);
  });
});
