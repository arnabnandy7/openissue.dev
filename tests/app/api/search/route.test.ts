import { beforeEach, describe, expect, it, vi } from "vitest";

const searchGitHubIssues = vi.fn();

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers({ "x-forwarded-for": "203.0.113.10" })),
}));

vi.mock("@/features/issues/server/github-search", () => ({
  searchGitHubIssues,
}));

describe("GET /api/search", () => {
  beforeEach(() => {
    searchGitHubIssues.mockReset();
    searchGitHubIssues.mockResolvedValue({
      query: "is:issue",
      totalCount: 0,
      rateLimitRemaining: "4999",
      tokenConfigured: false,
      issues: [],
    });
  });

  it("requires a technology query", async () => {
    const { GET } = await import("@/app/api/search/route");

    const response = await GET(new Request("http://localhost/api/search"));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("A technology is required.");
    expect(searchGitHubIssues).not.toHaveBeenCalled();
  });

  it("passes search params through to the GitHub search service", async () => {
    const { GET } = await import("@/app/api/search/route");

    const response = await GET(
      new Request(
        "http://localhost/api/search?tech=React&label=good-first-issue&sort=created&linkedPr=yes",
      ),
    );

    expect(response.status).toBe(200);
    expect(searchGitHubIssues).toHaveBeenCalledWith({
      tech: "React",
      label: "good-first-issue",
      sort: "created",
      linkedPr: "yes",
    });
  });

  it("returns an upstream search failure as a 502", async () => {
    searchGitHubIssues.mockRejectedValueOnce(new Error("GitHub is unavailable"));
    const { GET } = await import("@/app/api/search/route");

    const response = await GET(new Request("http://localhost/api/search?tech=React"));
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body.error).toBe("GitHub is unavailable");
  });
});
