import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { searchGitHubIssues } from "@/features/issues/server/github-search";

const originalToken = process.env.GITHUB_TOKEN;

function jsonResponse(data: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "x-ratelimit-remaining": "4999",
      ...headers,
    },
  });
}

function githubIssue(overrides: Record<string, unknown> = {}) {
  return {
    number: 42,
    html_url: "https://github.com/acme/widgets/issues/42",
    title: "Improve widget accessibility",
    comments: 0,
    updated_at: "2026-06-26T10:00:00.000Z",
    created_at: "2026-06-20T10:00:00.000Z",
    repository_url: "https://api.github.com/repos/acme/widgets",
    labels: [{ name: "good first issue" }],
    assignee: null,
    assignees: [],
    ...overrides,
  };
}

function searchPageResponses(items: ReturnType<typeof githubIssue>[], totalCount = items.length) {
  return Array.from({ length: 5 }, () =>
    jsonResponse({
      total_count: totalCount,
      items,
    }),
  );
}

describe("searchGitHubIssues", () => {
  beforeEach(() => {
    vi.setSystemTime(new Date("2026-06-26T12:00:00.000Z"));
    delete process.env.GITHUB_TOKEN;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    if (originalToken === undefined) {
      delete process.env.GITHUB_TOKEN;
    } else {
      process.env.GITHUB_TOKEN = originalToken;
    }
  });

  it("adds the linked PR qualifier and maps linked PR counts", async () => {
    process.env.GITHUB_TOKEN = "test-token";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(searchPageResponses([githubIssue()])[0])
      .mockResolvedValueOnce(searchPageResponses([githubIssue()])[1])
      .mockResolvedValueOnce(searchPageResponses([githubIssue()])[2])
      .mockResolvedValueOnce(searchPageResponses([githubIssue()])[3])
      .mockResolvedValueOnce(searchPageResponses([githubIssue()])[4])
      .mockResolvedValueOnce(
        jsonResponse({
          full_name: "acme/widgets",
          html_url: "https://github.com/acme/widgets",
          stargazers_count: 2500,
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse([
          {
            event: "cross-referenced",
            source: {
              issue: {
                html_url: "https://github.com/acme/widgets/pull/7",
                pull_request: {},
              },
            },
          },
          {
            event: "cross-referenced",
            source: {
              issue: {
                html_url: "https://github.com/acme/widgets/pull/7",
                pull_request: {},
              },
            },
          },
          {
            event: "commented",
            source: {
              issue: {
                html_url: "https://github.com/acme/widgets/pull/9",
                pull_request: {},
              },
            },
          },
        ]),
      );

    vi.stubGlobal("fetch", fetchMock);

    const result = await searchGitHubIssues({
      tech: "React",
      label: "good-first-issue",
      sort: "updated",
      linkedPr: "yes",
    });

    const searchUrl = new URL(fetchMock.mock.calls[0][0] as string);
    expect(searchUrl.searchParams.get("q")).toBe(
      'is:issue is:open archived:false language:TypeScript label:"good first issue" linked:pr',
    );
    expect(searchUrl.searchParams.get("page")).toBe("1");
    expect(result.page).toBe(1);
    expect(result.issues[0]).toMatchObject({
      repo: "acme/widgets",
      linkedPrCount: 1,
    });
    expect(result.candidateCount).toBe(1);
  });

  it("adds the negative linked PR qualifier for no-linked-PR searches", async () => {
    const fetchMock = vi.fn();
    searchPageResponses([githubIssue()]).forEach((response) => {
      fetchMock.mockResolvedValueOnce(response);
    });

    vi.stubGlobal("fetch", fetchMock);

    await searchGitHubIssues({
      tech: "Java",
      label: "help-wanted",
      sort: "created",
      linkedPr: "no",
    });

    const searchUrl = new URL(fetchMock.mock.calls[0][0] as string);
    expect(searchUrl.searchParams.get("q")).toBe(
      'is:issue is:open archived:false language:Java label:"help wanted" -linked:pr',
    );
  });

  it("falls back to default sort, label, and linked PR filter for invalid inputs", async () => {
    const fetchMock = vi.fn();
    searchPageResponses([githubIssue()]).forEach((response) => {
      fetchMock.mockResolvedValueOnce(response);
    });

    vi.stubGlobal("fetch", fetchMock);

    await searchGitHubIssues({
      tech: "C#",
      label: "surprise",
      sort: "stars",
      linkedPr: "maybe",
    });

    const searchUrl = new URL(fetchMock.mock.calls[0][0] as string);
    expect(searchUrl.searchParams.get("q")).toBe(
      'is:issue is:open archived:false language:"C#" label:"help wanted"',
    );
    expect(searchUrl.searchParams.get("sort")).toBe("updated");
  });

  it("returns the highest scored candidates on the first result page", async () => {
    const lowerScoreIssue = githubIssue({
      html_url: "https://github.com/acme/widgets/issues/1",
      comments: 20,
      updated_at: "2026-06-01T10:00:00.000Z",
    });
    const higherScoreIssue = githubIssue({
      html_url: "https://github.com/acme/widgets/issues/2",
      comments: 0,
      updated_at: "2026-06-26T11:00:00.000Z",
      labels: [{ name: "help wanted" }, { name: "good first issue" }],
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          total_count: 2,
          items: [lowerScoreIssue],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          total_count: 2,
          items: [],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          total_count: 2,
          items: [higherScoreIssue],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          total_count: 2,
          items: [],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          total_count: 2,
          items: [],
        }),
      );

    vi.stubGlobal("fetch", fetchMock);

    const result = await searchGitHubIssues({
      tech: "Java",
      label: "help-wanted",
      sort: "updated",
      linkedPr: "any",
    });

    expect(result.issues[0].id).toBe("https://github.com/acme/widgets/issues/2");
    expect(result.candidateCount).toBe(2);
    expect(result.totalCount).toBe(2);
  });

  it("uses repository and comment enrichment when a GitHub token is configured", async () => {
    process.env.GITHUB_TOKEN = "test-token";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(searchPageResponses([githubIssue({ comments: 1 })])[0])
      .mockResolvedValueOnce(searchPageResponses([githubIssue({ comments: 1 })])[1])
      .mockResolvedValueOnce(searchPageResponses([githubIssue({ comments: 1 })])[2])
      .mockResolvedValueOnce(searchPageResponses([githubIssue({ comments: 1 })])[3])
      .mockResolvedValueOnce(searchPageResponses([githubIssue({ comments: 1 })])[4])
      .mockResolvedValueOnce(
        jsonResponse({
          full_name: "acme/widgets",
          html_url: "https://github.com/acme/widgets",
          stargazers_count: 2500,
          archived: false,
        }),
      )
      .mockResolvedValueOnce(jsonResponse([{ body: "I'm working on it" }]))
      .mockResolvedValueOnce(jsonResponse([]));

    vi.stubGlobal("fetch", fetchMock);

    const result = await searchGitHubIssues({
      tech: "React",
      label: "good-first-issue",
      sort: "updated",
      linkedPr: "any",
    });

    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      headers: expect.objectContaining({
        Authorization: "Bearer test-token",
      }),
    });
    expect(result.issues[0]).toMatchObject({
      stars: 2500,
      helpStatus: "claimed",
    });
  });
});
