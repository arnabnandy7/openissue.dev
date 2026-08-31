import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getSession,
  select,
  from,
  where,
  orderBy,
  limit,
  insert,
  values,
  onConflictDoUpdate,
  update,
  set,
  updateWhere,
  remove,
  deleteWhere,
} = vi.hoisted(() => ({
  getSession: vi.fn(),
  select: vi.fn(),
  from: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  insert: vi.fn(),
  values: vi.fn(),
  onConflictDoUpdate: vi.fn(),
  update: vi.fn(),
  set: vi.fn(),
  updateWhere: vi.fn(),
  remove: vi.fn(),
  deleteWhere: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession } } }));
vi.mock("@/lib/db", () => ({
  getDatabase: () => ({ select, insert, update, delete: remove }),
}));

import { GET, PATCH, POST } from "@/app/api/opportunities/route";

const savedRow = {
  id: "opportunity-1",
  userId: "user-1",
  repositoryFullName: "acme/widgets",
  issueNumber: 12,
  issueUrl: "https://github.com/acme/widgets/issues/12",
  title: "Improve widgets",
  savedAt: new Date("2026-08-20T00:00:00Z"),
  openedAt: null,
  workflowState: "saved",
  note: null,
  followUpAt: null,
  workflowUpdatedAt: new Date("2026-08-20T00:00:00Z"),
  createdAt: new Date("2026-08-20T00:00:00Z"),
  updatedAt: new Date("2026-08-20T00:00:00Z"),
};

describe("opportunity API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSession.mockResolvedValue({ user: { id: "user-1" } });
    select.mockReturnValue({ from });
    from.mockReturnValue({ where });
    where.mockReturnValue({ orderBy, limit });
    orderBy.mockResolvedValue([savedRow]);
    limit.mockResolvedValue([savedRow]);
    insert.mockReturnValue({ values });
    values.mockReturnValue({ onConflictDoUpdate });
    onConflictDoUpdate.mockResolvedValue(undefined);
    update.mockReturnValue({ set });
    set.mockReturnValue({ where: updateWhere });
    updateWhere.mockResolvedValue(undefined);
    remove.mockReturnValue({ where: deleteWhere });
    deleteWhere.mockResolvedValue(undefined);
  });

  it("requires authentication", async () => {
    getSession.mockResolvedValue(null);
    expect((await GET(new Request("http://localhost/api/opportunities"))).status).toBe(401);
    expect(
      (
        await POST(
          new Request("http://localhost/api/opportunities", {
            method: "POST",
            body: "{}",
          }),
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await PATCH(
          new Request("http://localhost/api/opportunities", {
            method: "PATCH",
            body: "{}",
          }),
        )
      ).status,
    ).toBe(401);
  });

  it("lists user-owned opportunities", async () => {
    orderBy.mockResolvedValueOnce([
      savedRow,
      {
        ...savedRow,
        id: "opportunity-2",
        savedAt: null,
        openedAt: new Date("2026-08-21T00:00:00Z"),
      },
    ]);
    await expect(
      (await GET(new Request("http://localhost/api/opportunities"))).json(),
    ).resolves.toEqual({
      opportunities: [
        expect.objectContaining({
          issueUrl: savedRow.issueUrl,
          savedAt: "2026-08-20T00:00:00.000Z",
        }),
        expect.objectContaining({
          savedAt: null,
          openedAt: "2026-08-21T00:00:00.000Z",
        }),
      ],
    });
  });

  it("upserts a canonical GitHub issue", async () => {
    const response = await POST(
      new Request("http://localhost/api/opportunities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save",
          issue: {
            title: " Improve widgets ",
            url: "https://github.com/acme/widgets/issues/12?source=openissue",
          },
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        repositoryFullName: "acme/widgets",
        issueNumber: 12,
        issueUrl: "https://github.com/acme/widgets/issues/12",
        title: "Improve widgets",
      }),
    );
    expect(onConflictDoUpdate).toHaveBeenCalledOnce();
    expect(onConflictDoUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        set: expect.objectContaining({ workflowUpdatedAt: expect.any(Date) }),
      }),
    );
  });

  it("rejects non-issue GitHub URLs", async () => {
    const response = await POST(
      new Request("http://localhost/api/opportunities", {
        method: "POST",
        body: JSON.stringify({
          action: "open",
          issue: {
            title: "Pull request",
            url: "https://github.com/acme/widgets/pull/12",
          },
        }),
      }),
    );
    expect(response.status).toBe(400);
    expect(insert).not.toHaveBeenCalled();
  });

  it("rejects malformed bodies and opportunity fields", async () => {
    const malformed = await POST(
      new Request("http://localhost/api/opportunities", {
        method: "POST",
        body: "not-json",
      }),
    );
    const missingTitle = await POST(
      new Request("http://localhost/api/opportunities", {
        method: "POST",
        body: JSON.stringify({
          action: "save",
          issue: { title: "", url: savedRow.issueUrl },
        }),
      }),
    );
    const malformedUrl = await POST(
      new Request("http://localhost/api/opportunities", {
        method: "POST",
        body: JSON.stringify({
          action: "save",
          issue: { title: savedRow.title, url: "not-a-url" },
        }),
      }),
    );
    const invalidAction = await POST(
      new Request("http://localhost/api/opportunities", {
        method: "POST",
        body: JSON.stringify({
          action: "archive",
          issue: { title: savedRow.title, url: savedRow.issueUrl },
        }),
      }),
    );
    const nonGitHubUrl = await POST(
      new Request("http://localhost/api/opportunities", {
        method: "POST",
        body: JSON.stringify({
          action: "save",
          issue: {
            title: savedRow.title,
            url: "https://example.com/acme/widgets/issues/12",
          },
        }),
      }),
    );

    expect(malformed.status).toBe(400);
    expect(missingTitle.status).toBe(400);
    expect(malformedUrl.status).toBe(400);
    expect(invalidAction.status).toBe(400);
    expect(nonGitHubUrl.status).toBe(400);
  });

  it("records opens while preserving saved state", async () => {
    await POST(
      new Request("http://localhost/api/opportunities", {
        method: "POST",
        body: JSON.stringify({
          action: "open",
          issue: { title: savedRow.title, url: savedRow.issueUrl },
        }),
      }),
    );

    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({ openedAt: expect.any(Date), savedAt: null }),
    );
    expect(onConflictDoUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        set: expect.objectContaining({ openedAt: expect.any(Date) }),
      }),
    );
  });

  it("unsaves and removes records that were never opened", async () => {
    limit.mockResolvedValueOnce([]);
    const response = await POST(
      new Request("http://localhost/api/opportunities", {
        method: "POST",
        body: JSON.stringify({
          action: "unsave",
          issue: { title: savedRow.title, url: savedRow.issueUrl },
        }),
      }),
    );

    expect(updateWhere).toHaveBeenCalledOnce();
    expect(deleteWhere).toHaveBeenCalledOnce();
    await expect(response.json()).resolves.toEqual({ opportunity: null });
  });

  it("updates user-owned workflow fields", async () => {
    const updatedRow = {
      ...savedRow,
      workflowState: "working",
      note: "Start with the parser tests.",
      followUpAt: new Date("2026-09-15T00:00:00.000Z"),
      workflowUpdatedAt: new Date("2026-09-01T00:00:00.000Z"),
    };
    limit.mockResolvedValueOnce([updatedRow]);

    const response = await PATCH(
      new Request("http://localhost/api/opportunities", {
        method: "PATCH",
        body: JSON.stringify({
          id: savedRow.id,
          workflowState: "working",
          note: " Start with the parser tests. ",
          followUpDate: "2026-09-15",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowState: "working",
        note: "Start with the parser tests.",
        followUpAt: new Date("2026-09-15T00:00:00.000Z"),
        workflowUpdatedAt: expect.any(Date),
      }),
    );
    await expect(response.json()).resolves.toEqual({
      opportunity: expect.objectContaining({
        workflowState: "working",
        note: "Start with the parser tests.",
        followUpAt: "2026-09-15T00:00:00.000Z",
      }),
    });
  });

  it("rejects invalid workflow updates and missing opportunities", async () => {
    const invalid = await PATCH(
      new Request("http://localhost/api/opportunities", {
        method: "PATCH",
        body: JSON.stringify({
          id: savedRow.id,
          workflowState: "done",
          note: "",
          followUpDate: "not-a-date",
        }),
      }),
    );
    limit.mockResolvedValueOnce([]);
    const missing = await PATCH(
      new Request("http://localhost/api/opportunities", {
        method: "PATCH",
        body: JSON.stringify({
          id: "missing",
          workflowState: "abandoned",
          note: "",
          followUpDate: "",
        }),
      }),
    );

    expect(invalid.status).toBe(400);
    expect(missing.status).toBe(404);
  });
});
