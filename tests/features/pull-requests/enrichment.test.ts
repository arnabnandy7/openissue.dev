import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  enrichPullRequests,
  getPullRequestDetails,
} from "@/features/pull-requests/server/enrichment";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });
const reference = { id: "PR_1", repository: "acme/widgets" };
const review = {
  id: "PR_1",
  repository: { isPrivate: false },
  reviewDecision: "APPROVED",
  reviewRequests: {
    nodes: [
      { requestedReviewer: { login: "alice" } },
      { requestedReviewer: { name: "Maintainers" } },
      { requestedReviewer: null },
    ],
  },
  commits: { nodes: [{ commit: { statusCheckRollup: { state: "SUCCESS" } } }] },
  closingIssuesReferences: {
    totalCount: 1,
    nodes: [
      {
        title: "Fix widgets",
        url: "https://github.com/acme/widgets/issues/2",
        repository: { isPrivate: false },
      },
    ],
  },
};
function mockFetch(input: string, options?: RequestInit) {
  if (input.endsWith("graphql")) {
    const body = JSON.parse(options!.body as string);
    if (body.variables.ids) return json({ data: { nodes: [review] } });
    return json({
      data: {
        repository: { issues: { nodes: [] }, pullRequests: { nodes: [] } },
      },
    });
  }
  if (input.endsWith("community/profile"))
    return json({
      health_percentage: 80,
      files: { readme: { html_url: "https://github.com/acme/widgets#readme" } },
    });
  return json({
    private: false,
    stargazers_count: 100,
    topics: ["hacktoberfest"],
    pushed_at: new Date().toISOString(),
  });
}
beforeEach(() => vi.stubEnv("GITHUB_TOKEN", "test-token"));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("PR enrichment", () => {
  it("never exposes a connection total that may include private issues beyond the sample", async () => {
    const publicNodes = Array.from({ length: 10 }, (_, index) => ({
      title: `Public issue ${index}`,
      url: `https://github.com/acme/widgets/issues/${index + 1}`,
      repository: { isPrivate: false },
    }));
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string, options?: RequestInit) => {
        if (options?.body?.toString().includes("PullRequestInsights")) {
          expect(options.body.toString()).not.toContain("totalCount");
          return json({
            data: {
              nodes: [
                {
                  ...review,
                  closingIssuesReferences: {
                    totalCount: 1234,
                    nodes: publicNodes,
                  },
                },
              ],
            },
          });
        }
        return mockFetch(input, options);
      }),
    );
    const result = await enrichPullRequests([reference]);
    expect(result.reviews.PR_1?.linkedIssueCount).toBe(10);
    expect(JSON.stringify(result)).not.toContain("1234");
  });
  it.each([
    ["MERGEABLE", true],
    ["CONFLICTING", false],
    ["UNKNOWN", null],
  ] as const)(
    "includes batched scoring details with %s mergeability",
    async (mergeable, expected) => {
      const fetch = vi.fn((input: string, options?: RequestInit) => {
        if (options?.body?.toString().includes("PullRequestInsights")) {
          return json({
            data: {
              nodes: [
                {
                  ...review,
                  additions: 30,
                  deletions: 5,
                  changedFiles: 2,
                  mergeable,
                },
              ],
            },
          });
        }
        return mockFetch(input, options);
      });
      vi.stubGlobal("fetch", fetch);
      const result = await enrichPullRequests([reference]);
      expect(result.reviews.PR_1?.details).toEqual({
        additions: 30,
        deletions: 5,
        changedFiles: 2,
        mergeable: expected,
      });
      expect(fetch).toHaveBeenCalledTimes(4);
      expect(fetch.mock.calls.some(([url]) => url.includes("/pulls/"))).toBe(
        false,
      );
    },
  );
  it("deduplicates repositories, batches reviews, and includes shared insights", async () => {
    const fetch = vi.fn(mockFetch);
    vi.stubGlobal("fetch", fetch);
    const result = await enrichPullRequests([
      reference,
      { ...reference, id: "PR_2" },
    ]);
    expect(
      fetch.mock.calls.filter(
        ([url]) => url === "https://api.github.com/repos/acme/widgets",
      ),
    ).toHaveLength(1);
    expect(result.repositories[reference.repository]).toMatchObject({
      stars: 100,
      hacktoberfest: true,
    });
    expect(result.reviews.PR_1).toMatchObject({
      reviewDecision: "APPROVED",
      reviewers: ["alice", "Maintainers"],
      checks: "SUCCESS",
      linkedIssueCount: 1,
    });
    expect(result.reviews.PR_2).toBeNull();
    const request = fetch.mock.calls.find(([, options]) =>
      options?.body?.toString().includes("PullRequestInsights"),
    );
    expect(JSON.parse(request![1]!.body as string).variables.ids).toEqual([
      "PR_1",
      "PR_2",
    ]);
  });
  it("limits insights to 12 repositories", async () => {
    vi.stubGlobal("fetch", vi.fn(mockFetch));
    const result = await enrichPullRequests(
      Array.from({ length: 13 }, (_, index) => ({
        id: `PR_${index}`,
        repository: `acme/repo${index}`,
      })),
    );
    expect(Object.keys(result.repositories)).toHaveLength(12);
    expect(result.notices.join(" ")).toContain("limited to 12");
  });
  it("works without a token, leaving authenticated insights unknown", async () => {
    vi.stubEnv("GITHUB_TOKEN", "");
    const fetch = vi.fn(mockFetch);
    vi.stubGlobal("fetch", fetch);
    const result = await enrichPullRequests([reference]);
    expect(fetch).not.toHaveBeenCalled();
    expect(result.repositories).toEqual({});
    expect(result.reviews.PR_1).toBeNull();
    expect(result.notices.join(" ")).toContain("insights are unavailable");
    expect(result.notices.join(" ")).not.toMatch(/token|configur/i);
  });
  it("does not expose private repository, PR, or linked issue information", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string) =>
        input.endsWith("graphql")
          ? json({
              data: { nodes: [{ ...review, repository: { isPrivate: true } }] },
            })
          : json({ private: true, stargazers_count: 999 }),
      ),
    );
    const result = await enrichPullRequests([reference]);
    expect(result.repositories).toEqual({});
    expect(result.reviews.PR_1).toBeNull();
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string, options?: RequestInit) =>
        input.endsWith("graphql") &&
        options?.body?.toString().includes("PullRequestInsights")
          ? json({
              data: {
                nodes: [
                  {
                    ...review,
                    closingIssuesReferences: {
                      totalCount: 2,
                      nodes: [
                        {
                          title: "secret",
                          url: "secret",
                          repository: { isPrivate: true },
                        },
                        ...review.closingIssuesReferences.nodes,
                      ],
                    },
                  },
                ],
              },
            })
          : mockFetch(input, options),
      ),
    );
    const publicResult = await enrichPullRequests([reference]);
    expect(publicResult.reviews.PR_1!.linkedIssues).toHaveLength(1);
    expect(JSON.stringify(publicResult)).not.toContain("secret");
  });
  it("keeps basic repository data when optional services fail", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string, options?: RequestInit) =>
        input.endsWith("graphql") || input.endsWith("profile")
          ? json({}, 502)
          : mockFetch(input, options),
      ),
    );
    const result = await enrichPullRequests([reference]);
    expect(result.repositories[reference.repository].stars).toBe(100);
    expect(result.repositories[reference.repository].documentation).toBeNull();
    expect(result.reviews.PR_1).toBeNull();
    expect(result.notices.join(" ")).toContain("unavailable");
  });
  it("stops repository batches on rate limiting", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(json({ message: "rate limit exceeded" }, 429));
    vi.stubGlobal("fetch", fetch);
    const result = await enrichPullRequests(
      Array.from({ length: 12 }, (_, index) => ({
        id: `PR_${index}`,
        repository: `acme/repo${index}`,
      })),
    );
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(result.notices.join(" ")).toContain("rate limited");
  });
  it("treats partial GraphQL fields as unknown", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string, options?: RequestInit) =>
        input.endsWith("graphql")
          ? json({
              data: { nodes: [review] },
              errors: [{ path: ["nodes", 0, "reviewDecision"] }],
            })
          : mockFetch(input, options),
      ),
    );
    expect((await enrichPullRequests([reference])).reviews.PR_1).toBeNull();
  });
  it("returns changes on demand and preserves unknown mergeability", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        json({
          base: { repo: { private: false } },
          additions: 12,
          deletions: 3,
          changed_files: 2,
          mergeable: null,
        }),
      ),
    );
    expect(await getPullRequestDetails("acme/widgets", 1)).toEqual({
      additions: 12,
      deletions: 3,
      changedFiles: 2,
      mergeable: null,
    });
  });
  it("rejects private change details", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(json({ base: { repo: { private: true } } })),
    );
    await expect(getPullRequestDetails("acme/widgets", 1)).rejects.toThrow(
      "Public pull request unavailable",
    );
  });
});
