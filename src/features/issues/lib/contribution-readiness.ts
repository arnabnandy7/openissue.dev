import type {
  ContributionDocumentation,
  ContributionReadiness,
  IssueStatus,
  RepositoryHealth,
  RepositoryResponsiveness,
} from "@/features/issues/types/search";

export type GitHubCommunityProfile = {
  healthPercentage: number;
  documentation: ContributionDocumentation;
};

const EMPTY_DOCUMENTATION: ContributionDocumentation = {
  readme: null,
  contributing: null,
  license: null,
  codeOfConduct: null,
  issueTemplate: null,
  pullRequestTemplate: null,
};

export function unknownContributionReadiness(
  signal = "Community profile unavailable",
): ContributionReadiness {
  return {
    score: null,
    status: "unknown",
    signals: [signal],
    documentation: EMPTY_DOCUMENTATION,
  };
}

function getResponsivenessScore(
  status: RepositoryResponsiveness["status"],
) {
  if (status === "responsive") return 10;
  if (status === "variable") return 5;
  return 0;
}

export function includeLinkedPullRequestSignal(
  readiness: ContributionReadiness,
  linkedPullRequestCount: number | null,
): ContributionReadiness {
  if (!linkedPullRequestCount || readiness.status === "unknown") return readiness;

  return {
    ...readiness,
    status: "claimed",
    signals: [
      ...readiness.signals,
      `${linkedPullRequestCount} linked pull request${linkedPullRequestCount === 1 ? "" : "s"}`,
    ],
  };
}

export function scoreContributionReadiness({
  profile,
  repositoryHealth,
  responsiveness,
  assigned,
  helpStatus,
}: {
  profile?: GitHubCommunityProfile;
  repositoryHealth: RepositoryHealth;
  responsiveness: RepositoryResponsiveness;
  assigned: boolean;
  helpStatus: IssueStatus;
}): ContributionReadiness {
  if (!profile) return unknownContributionReadiness();

  const { documentation } = profile;
  const documentationCount = Object.values(documentation).filter(Boolean).length;
  const signals = [
    `${documentationCount} of 6 community documents available`,
    ...repositoryHealth.signals.slice(0, 1),
    ...responsiveness.signals.slice(0, 1),
    assigned ? "Issue is assigned" : "Issue is unassigned",
  ];
  const score = Math.round(
    profile.healthPercentage * 0.6 +
      (repositoryHealth.score ?? 0) * 0.25 +
      getResponsivenessScore(responsiveness.status) +
      (assigned ? 0 : 5),
  );

  if (repositoryHealth.label === "stale") {
    return { score, status: "inactive", signals, documentation };
  }
  if (assigned || helpStatus === "claimed") {
    return { score, status: "claimed", signals, documentation };
  }
  if (!documentation.readme || !documentation.contributing) {
    return { score, status: "poorlyDocumented", signals, documentation };
  }

  return {
    score,
    status: score >= 70 ? "ready" : "ask",
    signals,
    documentation,
  };
}
