import { afterEach, describe, expect, it, vi } from "vitest";
import { searchPullRequests } from "@/features/pull-requests/server/search";
import {
  DEFAULT_PR_FILTERS,
  readPullRequestFilters,
  validatePullRequestFilters,
  pullRequestSearchParams,
} from "@/features/pull-requests/filters";

const filters = { ...DEFAULT_PR_FILTERS, org: "acme", tech: "TypeScript" };
const json = (body: unknown) => new Response(JSON.stringify(body));
const item = (number: number, overrides = {}) => ({
  node_id: `PR_${number}`,
  number,
  title: `PR ${number}`,
  html_url: `https://github.com/acme/widgets/pull/${number}`,
  repository_url: "https://api.github.com/repos/acme/widgets",
  user: { login: "alice" },
  assignees: [{ login: "bob" }],
  state: "open",
  labels: [{ name: "bug" }],
  comments: number,
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-02T00:00:00Z",
  pull_request: {},
  ...overrides,
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("PR filters", () => {
  it("round-trips bookmarkable filters", () => {
    expect(
      readPullRequestFilters(
        pullRequestSearchParams({
          ...filters,
          repository: "acme/widgets",
          page: 2,
        }),
      ),
    ).toEqual({ ...filters, repository: "acme/widgets", page: 2 });
    expect(readPullRequestFilters(new URLSearchParams())).toEqual(
      DEFAULT_PR_FILTERS,
    );
    expect(validatePullRequestFilters(filters)).toBeNull();
  });
  it.each([
    { org: "acme is:private" },
    { org: "" },
    { tech: "" },
    { tech: "topic:x" },
    { tech: "x".repeat(81) },
    { repository: "other/widgets" },
    { repository: "acme/../secret" },
    { repository: "acme/.." },
    { repository: "acme/." },
    { status: "invalid" },
    { sort: "invalid" },
    { page: 0 },
    { page: 11 },
    { page: 1.5 },
  ])("rejects invalid filters %j", (change) => {
    expect(
      validatePullRequestFilters({ ...filters, ...change } as typeof filters),
    ).toBeTruthy();
  });
});

describe("PR search", () => {
  it.each([
    "PHP",
    "Kotlin",
    "Swift",
    "Dart",
    "C",
    "Haskell",
    "Elixir",
    "Objective-C",
  ])("searches %s as a language without repository discovery", async (tech) => {
    const fetch = vi
      .fn()
      .mockResolvedValue(json({ total_count: 0, items: [] }));
    vi.stubGlobal("fetch", fetch);
    await searchPullRequests({ ...filters, tech });
    expect(fetch).toHaveBeenCalledTimes(1);
    const url = new URL(fetch.mock.calls[0][0]);
    expect(url.pathname).toBe("/search/issues");
    expect(url.searchParams.get("q")).toContain(`language:"${tech}"`);
  });
  it.each([
    ["open", "draft:false"],
    ["draft", "draft:true"],
    ["merged", "is:merged"],
    ["closed", "is:unmerged"],
    ["all", "is:pr"],
  ] as const)(
    "searches %s public PRs with language and organization scope",
    async (status, qualifier) => {
      const fetch = vi
        .fn()
        .mockResolvedValue(json({ total_count: 25, items: [item(1)] }));
      vi.stubGlobal("fetch", fetch);
      const result = await searchPullRequests({ ...filters, status });
      const query = new URL(fetch.mock.calls[0][0]).searchParams.get("q");
      expect(query).toContain("is:pr is:public");
      expect(query).toContain("org:acme");
      expect(query).toContain('language:"TypeScript"');
      expect(query).toContain(qualifier);
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(result.hasMore).toBe(true);
      expect(result.pullRequests[0]).toMatchObject({
        author: "alice",
        assignees: ["bob"],
        labels: ["bug"],
        repository: "acme/widgets",
      });
    },
  );
  it("maps draft, merged, closed and deleted authors, paginates, and reports incomplete results", async () => {
    vi.stubEnv("GITHUB_TOKEN", "test-token");
    const fetch = vi.fn().mockResolvedValue(
      json({
        total_count: 500,
        incomplete_results: true,
        items: [
          item(1, { draft: true, user: null, assignees: undefined }),
          item(2, { state: "closed" }),
          item(3, {
            state: "closed",
            pull_request: { merged_at: "2026-09-01" },
          }),
        ],
      }),
    );
    vi.stubGlobal("fetch", fetch);
    const result = await searchPullRequests({
      ...filters,
      status: "all",
      repository: "acme/widgets",
      page: 10,
      sort: "comments",
    });
    expect(new URL(fetch.mock.calls[0][0]).searchParams.get("page")).toBe("10");
    expect(new URL(fetch.mock.calls[0][0]).searchParams.get("q")).not.toContain(
      "org:",
    );
    expect(new URL(fetch.mock.calls[0][0]).searchParams.get("q")).toContain(
      "repo:acme/widgets",
    );
    expect(result.pullRequests.map((pr) => pr.status)).toEqual([
      "merged",
      "closed",
      "draft",
    ]);
    expect(result.pullRequests[2]).toMatchObject({
      author: "ghost",
      assignees: [],
    });
    expect(result.hasMore).toBe(false);
    expect(result.tokenConfigured).toBe(true);
    expect(result.notices).toHaveLength(2);
  });
  it("discovers framework repositories inside the organization without imposing a language", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        json({
          total_count: 25,
          incomplete_results: true,
          items: [{ full_name: "acme/widgets", private: false }],
        }),
      )
      .mockResolvedValueOnce(json({ total_count: 1, items: [item(1)] }));
    vi.stubGlobal("fetch", fetch);
    const result = await searchPullRequests({ ...filters, tech: "React" });
    const discovery = new URL(fetch.mock.calls[0][0]).searchParams.get("q");
    expect(discovery).toContain("org:acme topic:react");
    expect(discovery).not.toContain("language:");
    expect(new URL(fetch.mock.calls[1][0]).searchParams.get("q")).toContain(
      "repo:acme/widgets",
    );
    expect(result.notices.join(" ")).toContain("out of 25");
    expect(result.notices.join(" ")).toContain("incomplete repository");
  });
  it.each([
    { private: true, topics: ["react"] },
    { private: false, archived: true, topics: ["react"] },
    { private: false, topics: ["vue"] },
  ])(
    "does not search nonmatching or private selected repositories",
    async (repo) => {
      const fetch = vi
        .fn()
        .mockResolvedValue(json({ full_name: "acme/widgets", ...repo }));
      vi.stubGlobal("fetch", fetch);
      const result = await searchPullRequests({
        ...filters,
        tech: "React",
        repository: "acme/widgets",
      });
      expect(result.pullRequests).toEqual([]);
      expect(fetch).toHaveBeenCalledTimes(1);
    },
  );
  it("allows an exact repository outside the discovery cap and custom topics", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        json({
          full_name: "acme/widgets",
          private: false,
          topics: ["custom-framework"],
        }),
      )
      .mockResolvedValueOnce(json({ total_count: 1, items: [item(1)] }));
    vi.stubGlobal("fetch", fetch);
    expect(
      (
        await searchPullRequests({
          ...filters,
          tech: "Custom Framework",
          repository: "acme/widgets",
        })
      ).totalCount,
    ).toBe(1);
  });
  it("merges sorted repository groups before slicing a later page", async () => {
    const names = Array.from(
      { length: 4 },
      (_, index) => `acme/${String(index).repeat(95)}`,
    );
    const fetch = vi.fn(async (input: string) => {
      const url = new URL(input);
      if (url.pathname.endsWith("repositories"))
        return json({
          total_count: 4,
          items: names.map((full_name) => ({ full_name, private: false })),
        });
      expect(url.searchParams.get("q")!.length).toBeLessThanOrEqual(256);
      const group = names.findIndex((name) =>
        url.searchParams.get("q")!.includes(name),
      );
      return json({
        total_count: 100,
        items: Array.from({ length: 48 }, (_, index) =>
          item(400 - (index * 4 + group)),
        ),
      });
    });
    vi.stubGlobal("fetch", fetch);
    const result = await searchPullRequests({
      ...filters,
      tech: "React",
      sort: "comments",
      page: 2,
    });
    expect(result.pullRequests).toHaveLength(24);
    expect(result.pullRequests[0].comments).toBe(376);
    expect(result.pullRequests[23].comments).toBe(353);
    expect(result.totalCount).toBe(400);
  });
});
