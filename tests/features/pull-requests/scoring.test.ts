import { describe, expect, it } from "vitest";
import { scorePullRequest } from "@/features/pull-requests/scoring";
import type { PullRequestReview } from "@/features/pull-requests/types";

const ready: PullRequestReview = {
  reviewDecision: "APPROVED",
  checks: "SUCCESS",
  reviewers: [],
  linkedIssues: [],
  linkedIssueCount: 0,
  details: { additions: 100, deletions: 100, changedFiles: 5, mergeable: true },
};

describe("PR readiness scoring", () => {
  it("scores complete, approved, passing, conflict-free changes at 100", () => {
    expect(scorePullRequest("open", ready)).toMatchObject({
      minimum: 100,
      maximum: 100,
      coverage: 100,
      label: "Ready",
    });
  });
  it("shows a range without treating unavailable insights as failures", () => {
    const score = scorePullRequest("open");
    expect(score).toMatchObject({
      minimum: 20,
      maximum: 100,
      coverage: 20,
      label: "Partial",
    });
    expect(
      score.signals.filter((signal) => signal.points === null),
    ).toHaveLength(4);
  });
  it("keeps unknown review decisions and CI states unscored", () => {
    expect(
      scorePullRequest("open", {
        ...ready,
        reviewDecision: "UNRECOGNIZED",
        checks: "UNRECOGNIZED",
      }),
    ).toMatchObject({
      minimum: 45,
      maximum: 100,
      coverage: 45,
      label: "Partial",
    });
  });
  it("caps drafts even with otherwise perfect signals", () => {
    expect(scorePullRequest("draft", ready)).toMatchObject({
      minimum: 39,
      maximum: 39,
      label: "Draft",
    });
    expect(scorePullRequest("draft")).toMatchObject({
      minimum: 0,
      maximum: 39,
      coverage: 20,
    });
  });
  it.each([
    { ...ready, reviewDecision: "CHANGES_REQUESTED" },
    { ...ready, checks: "FAILURE" },
    { ...ready, checks: "ERROR" },
    { ...ready, details: { ...ready.details!, mergeable: false } },
  ])("never labels a known blocker as ready", (review) => {
    expect(scorePullRequest("open", review)).toMatchObject({
      minimum: 49,
      maximum: 49,
      label: "Blocked",
    });
  });
  it.each(["PENDING", "EXPECTED"])(
    "gives pending checks partial credit: %s",
    (checks) => {
      expect(
        scorePullRequest("open", {
          ...ready,
          checks,
          reviewDecision: "REVIEW_REQUIRED",
        }),
      ).toMatchObject({ minimum: 60, maximum: 60, label: "Needs attention" });
    },
  );
  it.each([
    [200, 5, 10],
    [201, 5, 5],
    [200, 6, 5],
    [1000, 20, 5],
    [1001, 20, 0],
    [1000, 21, 0],
  ])(
    "scores review effort at size boundaries (%i lines, %i files)",
    (additions, changedFiles, points) => {
      const result = scorePullRequest("open", ready, {
        additions,
        deletions: 0,
        changedFiles,
        mergeable: true,
      });
      expect(
        result.signals.find((signal) => signal.label === "Review size")?.points,
      ).toBe(points);
    },
  );
  it("treats invalid size and unknown mergeability as missing evidence", () => {
    expect(
      scorePullRequest("open", ready, {
        additions: -1,
        deletions: 0,
        changedFiles: 1,
        mergeable: null,
      }),
    ).toMatchObject({
      minimum: 75,
      maximum: 100,
      coverage: 75,
      label: "Partial",
    });
  });
  it("refines the range when on-demand details arrive", () => {
    expect(scorePullRequest("open", null, ready.details)).toMatchObject({
      minimum: 45,
      maximum: 100,
      coverage: 45,
    });
    expect(
      scorePullRequest("open", ready, { ...ready.details!, mergeable: false })
        .label,
    ).toBe("Blocked");
  });
  it.each(["merged", "closed"] as const)(
    "does not misrepresent %s PRs as active opportunities",
    (status) => {
      expect(scorePullRequest(status, ready)).toMatchObject({
        minimum: null,
        maximum: null,
        label: "Not applicable",
        signals: [],
      });
    },
  );
});
