import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Issue } from "@/features/issues/types/search";

vi.mock("server-only", () => ({}));
vi.mock("@/features/issues/server/github-search", () => ({
  searchGitHubIssues: vi.fn(),
}));

import { searchGitHubIssues } from "@/features/issues/server/github-search";
import { buildPersonalizedRecommendations } from "@/features/issues/server/personalized-recommendations";

const mockedSearch = vi.mocked(searchGitHubIssues);

function issue(id: number, repo = "acme/widgets", qualityScore = 50): Issue {
  return {
    id: `issue-${id}`,
    title: `Issue ${id}`,
    url: `https://github.com/${repo}/issues/${id}`,
    repo,
    repoUrl: `https://github.com/${repo}`,
    stars: 100,
    comments: 0,
    labels: ["help wanted"],
    updatedAt: "2026-08-30T00:00:00.000Z",
    createdAt: "2026-08-29T00:00:00.000Z",
    assigned: false,
    linkedPrCount: 0,
    hacktoberfest: false,
    hacktoberfestSource: null,
    qualityScore,
    repositoryHealth: { score: 70, label: "active", signals: [] },
  };
}

function savedSearch(id: string, tech: string, label: string, createdAt: string) {
  return {
    id,
    name: id,
    tech,
    label,
    sort: "updated",
    linkedPr: "any",
    hacktoberfest: "any",
    createdAt,
  };
}

describe("personalized recommendations", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns an empty result without saved preferences", async () => {
    await expect(buildPersonalizedRecommendations([], [])).resolves.toEqual({
      recommendations: [],
      preferenceCount: 0,
    });
    expect(mockedSearch).not.toHaveBeenCalled();
  });

  it("deduplicates preferences and exposes match signals", async () => {
    mockedSearch.mockResolvedValue({
      query: "query",
      totalCount: 1,
      candidateCount: 1,
      rateLimitRemaining: "100",
      tokenConfigured: true,
      issues: [issue(1)],
      page: 1,
    });

    const result = await buildPersonalizedRecommendations(
      [
        savedSearch("older", "React", "bug", "2026-08-28T00:00:00.000Z"),
        savedSearch("newer", "react", "bug", "2026-08-29T00:00:00.000Z"),
      ],
      [],
    );

    expect(mockedSearch).toHaveBeenCalledOnce();
    expect(result.preferenceCount).toBe(1);
    expect(result.recommendations[0].matchSignals).toEqual([
      "Technology: react",
      "Label: bug",
    ]);
  });

  it("preserves classification filters and explains their matches", async () => {
    mockedSearch.mockResolvedValue({
      query: "query",
      totalCount: 1,
      candidateCount: 1,
      rateLimitRemaining: "100",
      tokenConfigured: true,
      issues: [issue(1)],
      page: 1,
    });
    const preference = {
      ...savedSearch("filtered", "React", "bug", "2026-08-29T00:00:00.000Z"),
      experience: "beginner",
      contributionType: "bugfix",
      scope: "small",
    };

    const result = await buildPersonalizedRecommendations([preference], []);

    expect(mockedSearch).toHaveBeenCalledWith(
      expect.objectContaining({
        experience: "beginner",
        contributionType: "bugfix",
        scope: "small",
      }),
    );
    expect(result.recommendations[0].matchSignals).toEqual([
      "Technology: React",
      "Label: bug",
      "Experience: beginner",
      "Contribution type: bugfix",
      "Scope: small",
    ]);
  });

  it("excludes prior opportunities and boosts familiar repositories", async () => {
    mockedSearch.mockResolvedValue({
      query: "query",
      totalCount: 2,
      candidateCount: 2,
      rateLimitRemaining: "100",
      tokenConfigured: true,
      issues: [issue(1), issue(2, "acme/known", 45)],
      page: 1,
    });

    const result = await buildPersonalizedRecommendations(
      [savedSearch("search", "TypeScript", "help-wanted", "2026-08-29T00:00:00.000Z")],
      [
        {
          issueUrl: issue(1).url,
          repositoryFullName: "acme/known",
        },
      ],
    );

    expect(result.recommendations).toHaveLength(1);
    expect(result.recommendations[0].issue.id).toBe("issue-2");
    expect(result.recommendations[0].matchSignals).toContain("Familiar repository");
  });

  it("excludes dismissed issues and hidden repositories", async () => {
    const dismissedIssue = issue(1);
    mockedSearch.mockResolvedValue({
      query: "query",
      totalCount: 3,
      candidateCount: 3,
      rateLimitRemaining: "100",
      tokenConfigured: true,
      issues: [dismissedIssue, issue(2, "Acme/Hidden"), issue(3, "acme/visible")],
      page: 1,
    });

    const result = await buildPersonalizedRecommendations(
      [savedSearch("search", "TypeScript", "help-wanted", "2026-08-29T00:00:00.000Z")],
      [],
      {
        dismissedIssueUrls: new Set([dismissedIssue.url]),
        hiddenRepositories: new Set(["acme/hidden"]),
      },
    );

    expect(result.recommendations.map((item) => item.issue.id)).toEqual([
      "issue-3",
    ]);
  });

  it("uses recency to break equal recommendation scores", async () => {
    const olderIssue = issue(1);
    olderIssue.updatedAt = "2026-08-28T00:00:00.000Z";
    const newerIssue = issue(2);
    newerIssue.updatedAt = "2026-08-30T00:00:00.000Z";
    mockedSearch.mockResolvedValue({
      query: "query",
      totalCount: 2,
      candidateCount: 2,
      rateLimitRemaining: "100",
      tokenConfigured: true,
      issues: [olderIssue, newerIssue],
      page: 1,
    });

    const result = await buildPersonalizedRecommendations(
      [savedSearch("search", "Go", "bug", "2026-08-29T00:00:00.000Z")],
      [],
    );

    expect(result.recommendations.map((item) => item.issue.id)).toEqual([
      "issue-2",
      "issue-1",
    ]);
  });
});
