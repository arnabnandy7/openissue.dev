import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSession, insert, values, onConflictDoNothing } = vi.hoisted(() => ({
  getSession: vi.fn(),
  insert: vi.fn(),
  values: vi.fn(),
  onConflictDoNothing: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession } } }));
vi.mock("@/lib/db", () => ({
  getDatabase: () => ({ insert }),
}));
vi.mock("@/lib/utils", () => ({ crypto: { randomUUID: () => "uuid" } }));
vi.mock("@/lib/auth-schema", () => ({ issueFeedback: {}, hiddenRepository: {} }));

import { POST } from "@/app/api/feedback/route";

describe("feedback API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSession.mockResolvedValue({ user: { id: "user-1" } });
    insert.mockReturnValue({ values });
    values.mockReturnValue({ onConflictDoNothing });
    onConflictDoNothing.mockResolvedValue(undefined);
  });

  it("requires authentication", async () => {
    getSession.mockResolvedValue(null);
    expect((await POST(new Request("http://localhost/api/feedback", { method: "POST" }))).status).toBe(401);
  });

  it("requires required fields", async () => {
    const response = await POST(new Request("http://localhost/api/feedback", {
      method: "POST",
      body: JSON.stringify({}),
    }));
    expect(response.status).toBe(400);
  });

  it("inserts hidden repository", async () => {
    const response = await POST(new Request("http://localhost/api/feedback", {
      method: "POST",
      body: JSON.stringify({
        repositoryFullName: "acme/repo",
        issueNumber: 12,
        issueUrl: "http://github.com/acme/repo/issues/12",
        reason: "Hide this repository"
      }),
    }));
    expect(response.status).toBe(200);
    expect(insert).toHaveBeenCalled();
  });

  it("inserts feedback", async () => {
    const response = await POST(new Request("http://localhost/api/feedback", {
      method: "POST",
      body: JSON.stringify({
        repositoryFullName: "acme/repo",
        issueNumber: 12,
        issueUrl: "http://github.com/acme/repo/issues/12",
        reason: "Not interested"
      }),
    }));
    expect(response.status).toBe(200);
    expect(insert).toHaveBeenCalled();
  });
});
