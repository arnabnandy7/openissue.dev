import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getRecentRepositoryIssues,
  searchGitHubIssues,
  searchGitHubRepositories,
} from "@/features/issues/server/github-search";

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

function responsivenessResponse() {
  return jsonResponse({
    data: {
      repository: {
        issues: { nodes: [] },
        pullRequests: { nodes: [] },
      },
    },
  });
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
      .mockResolvedValueOnce(responsivenessResponse())
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
      tech: "TypeScript",
      label: "good-first-issue",
      sort: "updated",
      linkedPr: "yes",
    });

    const searchUrl = new URL(fetchMock.mock.calls[0][0] as string);
    const responsivenessRequest = JSON.parse(
      fetchMock.mock.calls[6][1]?.body as string,
    ) as { query: string };
    expect(searchUrl.searchParams.get("q")).toBe(
      'is:issue is:open archived:false language:TypeScript label:"good first issue" linked:pr',
    );
    expect(searchUrl.searchParams.get("page")).toBe("1");
    expect(responsivenessRequest.query).toContain(
      "issues(first: 20, orderBy: { field: CREATED_AT, direction: DESC }",
    );
    expect(responsivenessRequest.query).toContain(
      "pullRequests(first: 20, orderBy: { field: CREATED_AT, direction: DESC }",
    );
    expect(result.page).toBe(1);
    expect(result.issues[0]).toMatchObject({
      repo: "acme/widgets",
      linkedPrCount: 1,
    });
    expect(result.candidateCount).toBe(1);
  });

  it("searches framework terms by repository topic instead of issue text", async () => {
    const springIssue = githubIssue({
      html_url: "https://github.com/spring-projects/spring-boot/issues/123",
      repository_url: "https://api.github.com/repos/spring-projects/spring-boot",
      title: "Improve actuator diagnostics",
      labels: [{ name: "help wanted" }],
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          total_count: 1,
          items: [
            {
              full_name: "spring-projects/spring-boot",
              html_url: "https://github.com/spring-projects/spring-boot",
              stargazers_count: 82000,
              archived: false,
              topics: ["spring-boot"],
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          total_count: 1,
          items: [springIssue],
        }),
      );

    vi.stubGlobal("fetch", fetchMock);

    const result = await searchGitHubIssues({
      tech: "Spring Boot",
      label: "help-wanted",
      sort: "updated",
      linkedPr: "any",
    });

    const repoSearchUrl = new URL(fetchMock.mock.calls[0][0] as string);
    const issueSearchUrl = new URL(fetchMock.mock.calls[1][0] as string);
    const issueQuery = issueSearchUrl.searchParams.get("q") ?? "";

    expect(repoSearchUrl.pathname).toBe("/search/repositories");
    expect(repoSearchUrl.searchParams.get("q")).toBe(
      "topic:spring-boot archived:false language:Java",
    );
    expect(issueSearchUrl.pathname).toBe("/search/issues");
    expect(issueQuery).toBe(
      "is:issue is:open archived:false label:\"help wanted\" repo:spring-projects/spring-boot",
    );
    expect(issueQuery).not.toContain("Spring Boot");
    expect(result.query).toBe(
      'topic:spring-boot archived:false language:Java label:"help wanted"',
    );
    expect(result.issues[0]).toMatchObject({
      repo: "spring-projects/spring-boot",
      stars: 82000,
    });
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

  it("filters Hacktoberfest-ready issues by repo topic or issue label", async () => {
    const topicIssue = githubIssue({
      html_url: "https://github.com/acme/hacktober/issues/1",
      repository_url: "https://api.github.com/repos/acme/hacktober",
      labels: [{ name: "help wanted" }],
    });
    const labelIssue = githubIssue({
      html_url: "https://github.com/acme/labeled/issues/2",
      repository_url: "https://api.github.com/repos/acme/labeled",
      labels: [{ name: "help wanted" }, { name: "Hacktoberfest" }],
    });
    const plainIssue = githubIssue({
      html_url: "https://github.com/acme/plain/issues/3",
      repository_url: "https://api.github.com/repos/acme/plain",
      labels: [{ name: "help wanted" }],
    });
    const fetchMock = vi.fn();
    searchPageResponses([topicIssue, labelIssue, plainIssue], 3).forEach((response) => {
      fetchMock.mockResolvedValueOnce(response);
    });
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          full_name: "acme/hacktober",
          html_url: "https://github.com/acme/hacktober",
          stargazers_count: 100,
          topics: ["hacktoberfest"],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          full_name: "acme/labeled",
          html_url: "https://github.com/acme/labeled",
          stargazers_count: 100,
          topics: [],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          full_name: "acme/plain",
          html_url: "https://github.com/acme/plain",
          stargazers_count: 100,
          topics: [],
        }),
      );

    vi.stubGlobal("fetch", fetchMock);

    const result = await searchGitHubIssues({
      tech: "Java",
      label: "help-wanted",
      sort: "updated",
      linkedPr: "any",
      hacktoberfest: "only",
    });

    const searchUrl = new URL(fetchMock.mock.calls[0][0] as string);
    expect(searchUrl.searchParams.get("q")).toBe(
      'is:issue is:open archived:false language:Java label:"help wanted"',
    );
    expect(result.candidateCount).toBe(2);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "https://github.com/acme/hacktober/issues/1",
          hacktoberfest: true,
          hacktoberfestSource: "repo-topic",
        }),
        expect.objectContaining({
          id: "https://github.com/acme/labeled/issues/2",
          hacktoberfest: true,
          hacktoberfestSource: "issue-label",
        }),
      ]),
    );
    expect(result.issues).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "https://github.com/acme/plain/issues/3" }),
      ]),
    );
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

  it("ranks recent active issues in trending mode", async () => {
    const discussedIssue = githubIssue({
      html_url: "https://github.com/acme/widgets/issues/1",
      comments: 16,
      updated_at: "2026-06-26T11:00:00.000Z",
    });
    const quietIssue = githubIssue({
      html_url: "https://github.com/acme/widgets/issues/2",
      comments: 0,
      updated_at: "2026-06-25T11:00:00.000Z",
    });
    const fetchMock = vi.fn();
    searchPageResponses([quietIssue, discussedIssue], 2).forEach((response) => {
      fetchMock.mockResolvedValueOnce(response);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await searchGitHubIssues({
      tech: "Java",
      label: "help-wanted",
      sort: "trending",
      linkedPr: "any",
    });

    const searchUrl = new URL(fetchMock.mock.calls[0][0] as string);
    expect(searchUrl.searchParams.get("sort")).toBe("updated");
    expect(searchUrl.searchParams.get("q")).toContain("updated:>=2026-05-27");
    expect(result.issues[0].id).toBe(discussedIssue.html_url);
    expect(result.issues[0].trendingScore).toBeGreaterThan(
      result.issues[1].trendingScore ?? 0,
    );
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
      .mockResolvedValueOnce(responsivenessResponse())
      .mockResolvedValueOnce(jsonResponse([{ body: "I'm working on it" }]))
      .mockResolvedValueOnce(jsonResponse([]));

    vi.stubGlobal("fetch", fetchMock);

    const result = await searchGitHubIssues({
      tech: "TypeScript",
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
      enrichment: {
        repositoryMetadata: true,
        discussionAnalysis: true,
        linkedPullRequests: true,
      },
    });
    expect(result.enrichment).toEqual({
      repositoryMetadata: "complete",
      discussionAnalysis: "complete",
      linkedPullRequests: "complete",
    });
  });

  it("supports custom technology terms and surfaces GitHub API errors", async () => {
    const fetchMock = vi.fn();
    searchPageResponses([]).forEach((response) => fetchMock.mockResolvedValueOnce(response));
    vi.stubGlobal("fetch", fetchMock);

    await searchGitHubIssues({
      tech: "Web Components",
      label: null,
      sort: null,
      linkedPr: null,
    });
    expect(new URL(fetchMock.mock.calls[0][0]).searchParams.get("q")).toBe(
      "topic:web-components archived:false",
    );

    fetchMock
      .mockReset()
      .mockImplementation(() =>
        Promise.resolve(new Response("forbidden", { status: 403 })),
      );
    await expect(
      searchGitHubIssues({
        tech: "Java",
        label: null,
        sort: null,
        linkedPr: null,
      }),
    ).rejects.toThrow("GitHub API error 403: forbidden");
  });

  it("detects rate limit errors and throws RateLimitError", async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({ message: "API rate limit exceeded for user" }),
          {
            status: 403,
            headers: { "content-type": "application/json", "retry-after": "120" },
          },
        ),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      searchGitHubIssues({
        tech: "Java",
        label: null,
        sort: null,
        linkedPr: null,
      }),
    ).rejects.toMatchObject({
      name: "RateLimitError",
      retryAfterSeconds: 120,
    });
  });

  it("detects 429 responses as rate limit errors", async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({ message: "secondary rate limit exceeded" }),
          {
            status: 429,
            headers: { "content-type": "application/json", "retry-after": "60" },
          },
        ),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      searchGitHubIssues({
        tech: "Java",
        label: null,
        sort: null,
        linkedPr: null,
      }),
    ).rejects.toMatchObject({
      name: "RateLimitError",
      retryAfterSeconds: 60,
    });
  });

  it("returns an empty result when a topic has no matching repositories", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse({ total_count: 0, items: [] }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await searchGitHubIssues({
      tech: "Kubernetes",
      label: "help-wanted",
      sort: "updated",
      linkedPr: "any",
      page: 2,
    });

    expect(result).toMatchObject({ candidateCount: 0, issues: [], page: 2 });
  });

  it("tolerates enrichment failures and treats assigned issues as claimed", async () => {
    process.env.GITHUB_TOKEN = "test-token";
    const assignedIssue = githubIssue({
      comments: 1,
      assignee: { login: "maintainer" },
      assignees: [{ login: "maintainer" }],
      repository_url: "https://example.test/repos/acme/widgets",
    });
    const failure = new Response("unavailable", { status: 503 });
    const fetchMock = vi.fn();
    searchPageResponses([assignedIssue]).forEach((response) =>
      fetchMock.mockResolvedValueOnce(response),
    );
    fetchMock
      .mockResolvedValueOnce(failure)
      .mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
      .mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
      .mockResolvedValueOnce(new Response("unavailable", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await searchGitHubIssues({
      tech: "Java",
      label: "help-wanted",
      sort: "updated",
      linkedPr: "any",
    });

    expect(result.issues[0]).toMatchObject({
      assigned: true,
      stars: null,
      linkedPrCount: null,
      helpStatus: "claimed",
      enrichment: {
        repositoryMetadata: false,
        discussionAnalysis: false,
        linkedPullRequests: false,
      },
    });
    expect(result.enrichment).toEqual({
      repositoryMetadata: "unavailable",
      discussionAnalysis: "unavailable",
      linkedPullRequests: "unavailable",
    });
  });

  it("distinguishes resolved and still-open discussion threads", async () => {
    process.env.GITHUB_TOKEN = "test-token";
    const resolvedIssue = githubIssue({
      html_url: "https://github.com/acme/widgets/issues/1",
      number: 1,
      comments: 1,
    });
    const openIssue = githubIssue({
      html_url: "https://github.com/acme/widgets/issues/2",
      number: 2,
      comments: 1,
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ total_count: 2, items: [resolvedIssue, openIssue] }))
      .mockResolvedValueOnce(jsonResponse({ total_count: 2, items: [] }))
      .mockResolvedValueOnce(jsonResponse({ total_count: 2, items: [] }))
      .mockResolvedValueOnce(jsonResponse({ total_count: 2, items: [] }))
      .mockResolvedValueOnce(jsonResponse({ total_count: 2, items: [] }))
      .mockResolvedValueOnce(
        jsonResponse({
          full_name: "acme/widgets",
          html_url: "https://github.com/acme/widgets",
          stargazers_count: 500,
          archived: false,
        }),
      )
      .mockResolvedValueOnce(responsivenessResponse())
      .mockResolvedValueOnce(jsonResponse([{ body: "This was fixed in #99" }]))
      .mockResolvedValueOnce(jsonResponse([{ body: "Thanks for reporting this" }]))
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse([]));
    vi.stubGlobal("fetch", fetchMock);

    const result = await searchGitHubIssues({
      tech: "Java",
      label: "help-wanted",
      sort: "updated",
      linkedPr: "any",
    });

    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: resolvedIssue.html_url, helpStatus: "resolved" }),
        expect.objectContaining({ id: openIssue.html_url, helpStatus: "open" }),
      ]),
    );
  });
});

describe("repository digest GitHub queries", () => {
  afterEach(() => vi.restoreAllMocks());

  it("maps repository autocomplete results", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        total_count: 1,
        items: [
          {
            full_name: "acme/widgets",
            html_url: "https://github.com/acme/widgets",
            description: "Widget tools",
            stargazers_count: 250,
            archived: false,
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(searchGitHubRepositories(" widgets ")).resolves.toEqual([
      {
        fullName: "acme/widgets",
        url: "https://github.com/acme/widgets",
        description: "Widget tools",
        stars: 250,
      },
    ]);
    expect(String(fetchMock.mock.calls[0][0])).toContain(
      "widgets+in%3Aname%2Cdescription+archived%3Afalse",
    );
  });

  it("maps the five newest open repository issues with concise summaries", async () => {
    const issues = Array.from({ length: 6 }, (_, index) =>
      githubIssue({
        number: index + 1,
        html_url: `https://github.com/acme/widgets/issues/${index + 1}`,
        title: `Issue ${index + 1}`,
        body: index === 0 ? "A   concise\nsummary" : null,
        comments: index,
        assignee: index === 0 ? { login: "owner" } : null,
      }),
    );
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ total_count: 6, items: issues }))
      .mockResolvedValueOnce(
        jsonResponse({
          full_name: "acme/widgets",
          html_url: "https://github.com/acme/widgets",
          stargazers_count: 2500,
          archived: false,
          pushed_at: "2026-08-29T00:00:00Z",
          open_issues_count: 20,
          forks_count: 100,
          has_issues: true,
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await getRecentRepositoryIssues("acme/widgets");
    expect(result).toHaveLength(5);
    expect(result[0]).toMatchObject({
      summary: "A concise summary",
      assigned: true,
      qualityScore: expect.any(Number),
      repositoryHealth: expect.objectContaining({ label: "active" }),
    });
    expect(result[1].summary).toBe("No description provided.");
    expect(String(fetchMock.mock.calls[0][0])).toContain("is%3Aopen");
    expect(String(fetchMock.mock.calls[1][0])).toContain("repos/acme/widgets");
  });

  it("keeps repository digest issues when health enrichment fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ total_count: 1, items: [githubIssue()] }),
      )
      .mockResolvedValueOnce(new Response("unavailable", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await getRecentRepositoryIssues("acme/widgets");

    expect(result[0]).toMatchObject({
      qualityScore: expect.any(Number),
      repositoryHealth: {
        score: null,
        label: "unknown",
        signals: ["Repository metadata unavailable"],
      },
    });
  });

  it("enriches and filters issues that are ready to start", async () => {
    const repository = {
      full_name: "acme/widgets",
      html_url: "https://github.com/acme/widgets",
      stargazers_count: 500,
      archived: false,
      pushed_at: "2026-06-25T00:00:00.000Z",
      open_issues_count: 10,
      forks_count: 20,
      has_issues: true,
      topics: ["react"],
    };
    let includeContributingGuide = true;
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("/community/profile")) {
        return jsonResponse({
          health_percentage: 100,
          files: {
            readme: { html_url: `${repository.html_url}#readme` },
            ...(includeContributingGuide
              ? {
                  contributing: {
                    html_url: `${repository.html_url}/blob/main/CONTRIBUTING.md`,
                  },
                }
              : {}),
            issue_template: { html_url: `${repository.html_url}/issues/new/choose` },
          },
        });
      }
      if (url.includes("search/repositories")) {
        return jsonResponse({ total_count: 1, items: [repository] });
      }
      return jsonResponse({ total_count: 1, items: [githubIssue()] });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await searchGitHubIssues({
      tech: "React",
      label: "good-first-issue",
      sort: "updated",
      linkedPr: "yes",
      readiness: "ready",
    });

    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].contributionReadiness).toMatchObject({
      status: "ready",
      documentation: {
        contributing: `${repository.html_url}/blob/main/CONTRIBUTING.md`,
      },
    });
    expect(result.enrichment?.communityProfile).toBe("complete");
    const issueSearchUrl = fetchMock.mock.calls
      .map(([input]) => String(input))
      .find((url) => url.includes("search/issues"));
    expect(issueSearchUrl).toContain("-linked%3Apr");

    includeContributingGuide = false;
    const poorlyDocumentedResult = await searchGitHubIssues({
      tech: "React",
      label: "good-first-issue",
      sort: "updated",
      linkedPr: "any",
      readiness: "ready",
    });
    expect(poorlyDocumentedResult.issues).toHaveLength(0);

    const unresponsiveResult = await searchGitHubIssues({
      tech: "React",
      label: "good-first-issue",
      sort: "updated",
      linkedPr: "any",
      responsiveness: "responsive",
    });
    expect(unresponsiveResult.issues).toHaveLength(0);
  });
});

describe("updated issue ranges", () => {
  afterEach(() => vi.restoreAllMocks());

  it("supports an open-ended updated-after qualifier", async () => {
    const fetchMock = vi.fn();
    searchPageResponses([]).forEach((response) =>
      fetchMock.mockResolvedValueOnce(response),
    );
    vi.stubGlobal("fetch", fetchMock);

    await searchGitHubIssues({
      tech: "Java",
      label: "help-wanted",
      sort: "updated",
      linkedPr: "any",
      updatedAfter: "2026-08-01",
    });
    expect(String(fetchMock.mock.calls[0][0])).toContain(
      "updated%3A%3E%3D2026-08-01",
    );
  });
});
