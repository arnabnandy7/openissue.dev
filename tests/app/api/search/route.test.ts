import { beforeEach, describe, expect, it, vi } from "vitest";

const { searchGitHubIssues, headersMock } = vi.hoisted(() => ({
  searchGitHubIssues: vi.fn(),
  headersMock: vi.fn(async () => new Headers({ "x-forwarded-for": "203.0.113.10" })),
}));

vi.mock("next/headers", () => ({
  headers: headersMock,
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
      candidateCount: 0,
      rateLimitRemaining: "4999",
      tokenConfigured: false,
      issues: [],
      page: 1,
    });
    headersMock.mockResolvedValue(new Headers({ "x-forwarded-for": "203.0.113.10" }));
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
        "http://localhost/api/search?tech=React&label=good-first-issue&sort=created&linkedPr=yes&hacktoberfest=only&experience=first&contributionType=documentation&scope=small&responsiveness=responsive&readiness=ready",
      ),
    );

    expect(response.status).toBe(200);
    expect(searchGitHubIssues).toHaveBeenCalledWith({
      tech: "React",
      label: "good-first-issue",
      sort: "created",
      linkedPr: "yes",
      hacktoberfest: "only",
      experience: "first",
      contributionType: "documentation",
      scope: "small",
      responsiveness: "responsive",
      readiness: "ready",
      page: 1,
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

  it("rate limits repeated requests from one IP", async () => {
    const { GET } = await import("@/app/api/search/route");
    let response = new Response();

    for (let attempt = 0; attempt < 7; attempt += 1) {
      response = await GET(new Request("http://localhost/api/search?tech=React"));
      if (response.status === 429) break;
    }

    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({ error: expect.stringContaining("Too many") });
  });

  it("normalizes page numbers and forwarded IP lists", async () => {
    headersMock.mockResolvedValueOnce(
      new Headers({ "x-forwarded-for": "198.51.100.2, 10.0.0.1" }),
    );
    const { GET } = await import("@/app/api/search/route");
    await GET(new Request("http://localhost/api/search?tech=Go&page=-4"));
    expect(searchGitHubIssues).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 1 }),
    );

    headersMock.mockResolvedValueOnce(new Headers());
    await GET(new Request("http://localhost/api/search?tech=Go&page=invalid"));
    expect(searchGitHubIssues).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 1 }),
    );
  });

  it("uses a generic message for non-Error failures", async () => {
    headersMock.mockResolvedValueOnce(
      new Headers({ "x-forwarded-for": "192.0.2.55" }),
    );
    searchGitHubIssues.mockRejectedValueOnce("offline");
    const { GET } = await import("@/app/api/search/route");
    const response = await GET(new Request("http://localhost/api/search?tech=Go"));
    expect(await response.json()).toEqual({ error: "Unable to search GitHub issues." });
  });
});
