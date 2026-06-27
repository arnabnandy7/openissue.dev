import { describe, expect, it } from "vitest";
import { mergeRankedIssues, rankIssues } from "@/features/issues/lib/ranking";
import type { Issue } from "@/features/issues/types/search";

function issue(overrides: Partial<Issue>): Issue {
  return {
    id: "https://github.com/acme/widgets/issues/1",
    title: "Improve widgets",
    url: "https://github.com/acme/widgets/issues/1",
    repo: "acme/widgets",
    repoUrl: "https://github.com/acme/widgets",
    stars: 100,
    comments: 0,
    labels: ["help wanted"],
    updatedAt: "2026-06-20T10:00:00.000Z",
    createdAt: "2026-06-19T10:00:00.000Z",
    assigned: false,
    linkedPrCount: 0,
    qualityScore: 50,
    helpStatus: "open",
    ...overrides,
  };
}

describe("issue ranking", () => {
  it("sorts issues by quality score and then recency", () => {
    const rankedIssues = rankIssues([
      issue({ id: "low", qualityScore: 40 }),
      issue({ id: "older-high", qualityScore: 90, updatedAt: "2026-06-18T10:00:00.000Z" }),
      issue({ id: "newer-high", qualityScore: 90, updatedAt: "2026-06-19T10:00:00.000Z" }),
    ]);

    expect(rankedIssues.map((item) => item.id)).toEqual([
      "newer-high",
      "older-high",
      "low",
    ]);
  });

  it("merges loaded pages before ranking the visible list", () => {
    const mergedIssues = mergeRankedIssues(
      [
        issue({ id: "first-page-low", qualityScore: 45 }),
        issue({ id: "shared", qualityScore: 70 }),
      ],
      [
        issue({ id: "second-page-high", qualityScore: 95 }),
        issue({ id: "shared", qualityScore: 75 }),
      ],
    );

    expect(mergedIssues.map((item) => item.id)).toEqual([
      "second-page-high",
      "shared",
      "first-page-low",
    ]);
    expect(mergedIssues).toHaveLength(3);
    expect(mergedIssues[1].qualityScore).toBe(75);
  });
});
