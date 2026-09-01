import { describe, expect, it } from "vitest";
import {
  includeLinkedPullRequestSignal,
  scoreContributionReadiness,
  unknownContributionReadiness,
  type GitHubCommunityProfile,
} from "@/features/issues/lib/contribution-readiness";

const profile: GitHubCommunityProfile = {
  healthPercentage: 90,
  documentation: {
    readme: "https://github.com/acme/widgets#readme",
    contributing: "https://github.com/acme/widgets/blob/main/CONTRIBUTING.md",
    license: "https://github.com/acme/widgets/blob/main/LICENSE",
    codeOfConduct: "https://github.com/acme/widgets/blob/main/CODE_OF_CONDUCT.md",
    issueTemplate: "https://github.com/acme/widgets/issues/new/choose",
    pullRequestTemplate: "https://github.com/acme/widgets/blob/main/PULL_REQUEST_TEMPLATE.md",
  },
};

const activeRepository = {
  score: 90,
  label: "active" as const,
  signals: ["Pushed within 30 days"],
};

const responsiveMaintainers = {
  status: "responsive" as const,
  sampleDays: 90,
  sampleSize: 8,
  signals: ["Maintainers usually respond within 3 days"],
};

function score(overrides: Partial<Parameters<typeof scoreContributionReadiness>[0]> = {}) {
  return scoreContributionReadiness({
    profile,
    repositoryHealth: activeRepository,
    responsiveness: responsiveMaintainers,
    assigned: false,
    helpStatus: "open",
    ...overrides,
  });
}

describe("contribution readiness", () => {
  it("returns unknown when the community profile is unavailable", () => {
    expect(unknownContributionReadiness()).toMatchObject({
      score: null,
      status: "unknown",
    });
    expect(score({ profile: undefined }).status).toBe("unknown");
    expect(unknownContributionReadiness("Profile request failed").signals)
      .toEqual(["Profile request failed"]);
  });

  it("marks documented, active, unclaimed issues ready to start", () => {
    expect(score()).toMatchObject({ status: "ready", score: 92 });
  });

  it("gives inactivity and claimed work priority", () => {
    expect(score({
      repositoryHealth: { score: 20, label: "stale", signals: ["No recent push"] },
    }).status).toBe("inactive");
    expect(score({ assigned: true }).status).toBe("claimed");
    expect(score({ helpStatus: "claimed" }).status).toBe("claimed");
  });

  it("distinguishes weak documentation and lower-confidence starts", () => {
    expect(score({
      profile: {
        ...profile,
        documentation: { ...profile.documentation, contributing: null },
      },
    }).status).toBe("poorlyDocumented");
    expect(score({
      profile: { ...profile, healthPercentage: 50 },
      repositoryHealth: { score: 50, label: "moderate", signals: ["Some activity"] },
      responsiveness: {
        status: "slow",
        sampleDays: 90,
        sampleSize: 8,
        signals: ["Responses are often delayed"],
      },
    }).status).toBe("ask");
  });

  it("marks known linked work as possibly claimed", () => {
    expect(includeLinkedPullRequestSignal(score(), 2)).toMatchObject({
      status: "claimed",
      signals: expect.arrayContaining(["2 linked pull requests"]),
    });
    expect(includeLinkedPullRequestSignal(unknownContributionReadiness(), 1).status)
      .toBe("unknown");
    expect(includeLinkedPullRequestSignal(score(), null).status).toBe("ready");
    expect(includeLinkedPullRequestSignal(score(), 1).signals)
      .toContain("1 linked pull request");
  });

  it("scores variable responsiveness without repository health metadata", () => {
    expect(score({
      repositoryHealth: {
        score: null,
        label: "unknown",
        signals: [],
      },
      responsiveness: {
        status: "variable",
        sampleDays: 90,
        sampleSize: 4,
        signals: [],
      },
    })).toMatchObject({ status: "ask", score: 64 });
  });
});
