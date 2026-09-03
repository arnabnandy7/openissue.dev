import "server-only";
import { searchGitHubIssues } from "@/features/issues/server/github-search";
import type { SavedSearch } from "@/features/issues/lib/saved-searches";
import type { RecommendedIssue } from "@/features/issues/types/recommendation";

const MAX_PREFERENCES = 1;
const MAX_RECOMMENDATIONS = 24;
const PREFERENCE_MATCH_SCORE = 12;
const FAMILIAR_REPOSITORY_SCORE = 4;

function preferenceSignals(preference: SavedSearch) {
  const signals = [
    `Technology: ${preference.tech}`,
    `Label: ${preference.label}`,
  ];

  if (preference.experience && preference.experience !== "any") {
    signals.push(`Experience: ${preference.experience}`);
  }
  if (preference.contributionType && preference.contributionType !== "any") {
    signals.push(`Contribution type: ${preference.contributionType}`);
  }
  if (preference.scope === "small") signals.push("Scope: small");
  if (preference.readiness === "ready") signals.push("Ready to start");

  return signals;
}

function addMatchSignals(recommendation: RecommendedIssue, signals: string[]) {
  for (const signal of signals) {
    if (recommendation.matchSignals.includes(signal)) continue;
    recommendation.matchSignals.push(signal);
    recommendation.recommendationScore += PREFERENCE_MATCH_SCORE;
  }
}

function addFamiliarRepositorySignal(recommendation: RecommendedIssue) {
  if (recommendation.matchSignals.includes("Familiar repository")) return;
  recommendation.matchSignals.push("Familiar repository");
  recommendation.recommendationScore += FAMILIAR_REPOSITORY_SCORE;
}

export async function buildPersonalizedRecommendations(
  savedSearches: SavedSearch[],
  opportunities: Array<{ issueUrl: string; repositoryFullName: string }>,
  feedback?: {
    dismissedIssueUrls: Set<string>;
    hiddenRepositories: Set<string>;
  },
): Promise<{ recommendations: RecommendedIssue[]; preferenceCount: number }> {
  const dismissedIssueUrls = feedback?.dismissedIssueUrls ?? new Set<string>();
  const hiddenRepositories = feedback?.hiddenRepositories ?? new Set<string>();
  const distinctPreferences = new Map<string, SavedSearch>();

  for (const search of [...savedSearches].sort(
    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
  )) {
    const key = `${search.tech.trim().toLowerCase()}\0${search.label.toLowerCase()}`;
    if (!distinctPreferences.has(key)) distinctPreferences.set(key, search);
  }

  const preferences = Array.from(distinctPreferences.values()).slice(
    0,
    MAX_PREFERENCES,
  );

  if (preferences.length === 0) {
    return { recommendations: [], preferenceCount: 0 };
  }

  const results = await Promise.all(
    preferences.map((preference) =>
      searchGitHubIssues({
        tech: preference.tech,
        label: preference.label,
        sort: "updated",
        linkedPr: "any",
        hacktoberfest: "any",
        experience: preference.experience ?? "any",
        contributionType: preference.contributionType ?? "any",
        scope: preference.scope ?? "any",
        readiness: preference.readiness ?? "any",
      }),
    ),
  );
  const excludedUrls = new Set(opportunities.map((item) => item.issueUrl));
  const familiarRepositories = new Set(
    opportunities.map((item) => item.repositoryFullName.toLowerCase()),
  );
  const recommendations = new Map<string, RecommendedIssue>();

  results.forEach((result, index) => {
    const preference = preferences[index];

    for (const issue of result.issues) {
      if (excludedUrls.has(issue.url)) continue;
      if (dismissedIssueUrls.has(issue.url)) continue;
      if (hiddenRepositories.has(issue.repo.toLowerCase())) continue;

      const current = recommendations.get(issue.id) ?? {
        issue,
        recommendationScore: issue.qualityScore,
        matchSignals: [],
      };
      addMatchSignals(current, preferenceSignals(preference));

      if (
        familiarRepositories.has(issue.repo.toLowerCase()) &&
        !current.matchSignals.includes("Familiar repository")
      ) {
        addFamiliarRepositorySignal(current);
      }

      recommendations.set(issue.id, current);
    }
  });

  return {
    preferenceCount: preferences.length,
    recommendations: Array.from(recommendations.values())
      .sort(
        (a, b) =>
          b.recommendationScore - a.recommendationScore ||
          Date.parse(b.issue.updatedAt) - Date.parse(a.issue.updatedAt),
      )
      .slice(0, MAX_RECOMMENDATIONS),
  };
}
