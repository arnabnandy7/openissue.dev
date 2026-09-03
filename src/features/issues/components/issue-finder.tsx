"use client";

import {
  type ReactNode,
  type SubmitEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Image from "next/image";
import { Bookmark, Mail, Search, Sparkles, Trash2 } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { AuthControls } from "@/components/auth-controls";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  addSavedSearch,
  deleteSavedSearch,
  getSavedSearches,
  replaceSavedSearches,
  type SavedSearch,
} from "@/features/issues/lib/saved-searches";
import {
  deleteCloudSavedSearch,
  syncSavedSearches,
} from "@/features/issues/lib/saved-search-cloud";
import {
  getDigestPreference,
  getAlertEmail,
  triggerWeeklyDigest,
  updateAlertEmail,
  updateDigestPreference,
} from "@/features/issues/lib/digest-preference-cloud";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ErrorCard } from "@/components/ui/error-card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { IssueCard } from "@/features/issues/components/issue-card";
import { LoadingResults } from "@/features/issues/components/loading-results";
import { HiddenRepositories } from "@/features/issues/components/hidden-repositories";
import { OpportunityWorkflow } from "@/features/issues/components/opportunity-workflow";
import { Metric } from "@/features/issues/components/metric";
import { RepositoryDigestCard } from "@/features/issues/components/repository-digest-card";
import { AdminEmailCard } from "@/features/issues/components/admin-email-card";
import { ContributionHistory } from "@/features/issues/components/contribution-history";
import {
  CONTRIBUTION_TYPE_OPTIONS,
  EXPERIENCE_OPTIONS,
  HACKTOBERFEST_OPTIONS,
  LABEL_OPTIONS,
  LINKED_PR_OPTIONS,
  READINESS_OPTIONS,
  RESPONSIVENESS_OPTIONS,
  SORT_OPTIONS,
  SCOPE_OPTIONS,
  TECH_EXAMPLES,
} from "@/features/issues/data/search-options";
import { compactNumber } from "@/features/issues/lib/format";
import { mergeRankedIssues, rankIssues } from "@/features/issues/lib/ranking";
import type {
  EnrichmentAvailability,
  SearchEnrichment,
  SearchResponse,
  Issue,
} from "@/features/issues/types/search";
import { authClient } from "@/lib/auth-client";
import {
  getOpportunities,
  updateOpportunity,
} from "@/features/issues/lib/opportunity-cloud";
import { getRecommendations } from "@/features/issues/lib/recommendation-cloud";
import type { RecommendationResponse } from "@/features/issues/types/recommendation";

const SEARCH_COOLDOWN_MS = 3000;
const RATE_LIMIT_FALLBACK_COOLDOWN_MS = 60_000;

type SearchApiError = Error & {
  rateLimit?: boolean;
  retryAfter?: number | null;
};

function createSearchApiError(payload: SearchResponse, fallback: string) {
  const error = new Error(payload.error ?? fallback) as SearchApiError;

  if (payload.rateLimit) {
    error.rateLimit = true;
    error.retryAfter = payload.retryAfter ?? null;
  }

  return error;
}

function getRateLimitDetails(error: unknown) {
  if (!(error instanceof Error) || !("rateLimit" in error)) return null;

  const rateLimitError = error as SearchApiError;
  if (!rateLimitError.rateLimit) return null;

  const retryAfter = rateLimitError.retryAfter ?? null;
  return {
    retryAfter,
    cooldownMs:
      retryAfter === null
        ? RATE_LIMIT_FALLBACK_COOLDOWN_MS
        : retryAfter * 1000,
  };
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

type SearchFilters = {
  tech: string;
  label: string;
  sort: string;
  linkedPr: string;
  hacktoberfest: string;
  experience: string;
  contributionType: string;
  scope: string;
  responsiveness: string;
  readiness: string;
};

const DEFAULT_SEARCH_FILTERS: SearchFilters = {
  tech: "Java",
  label: "help-wanted",
  sort: "updated",
  linkedPr: "any",
  hacktoberfest: "any",
  experience: "any",
  contributionType: "any",
  scope: "any",
  responsiveness: "any",
  readiness: "any",
};

function getSupportedValue(
  value: string | null,
  options: ReadonlyArray<{ value: string }>,
  fallback: string,
) {
  return options.find((option) => option.value === value)?.value ?? fallback;
}

function getSearchFilters(search: string): SearchFilters | null {
  const params = new URLSearchParams(search);
  const tech = params.get("tech")?.trim();

  if (!tech) return null;

  return {
    tech,
    label: getSupportedValue(params.get("label"), LABEL_OPTIONS, "help-wanted"),
    sort: getSupportedValue(params.get("sort"), SORT_OPTIONS, "updated"),
    linkedPr: getSupportedValue(
      params.get("linkedPr"),
      LINKED_PR_OPTIONS,
      "any",
    ),
    hacktoberfest: getSupportedValue(
      params.get("hacktoberfest"),
      HACKTOBERFEST_OPTIONS,
      "any",
    ),
    experience: getSupportedValue(
      params.get("experience"),
      EXPERIENCE_OPTIONS,
      "any",
    ),
    contributionType: getSupportedValue(
      params.get("contributionType"),
      CONTRIBUTION_TYPE_OPTIONS,
      "any",
    ),
    scope: getSupportedValue(params.get("scope"), SCOPE_OPTIONS, "any"),
    responsiveness: getSupportedValue(
      params.get("responsiveness"),
      RESPONSIVENESS_OPTIONS,
      "any",
    ),
    readiness: getSupportedValue(
      params.get("readiness"),
      READINESS_OPTIONS,
      "any",
    ),
  };
}

function createSearchParams(filters: SearchFilters, page?: number) {
  return new URLSearchParams({
    tech: filters.tech.trim(),
    label: filters.label,
    sort: filters.sort,
    linkedPr: filters.linkedPr,
    hacktoberfest: filters.hacktoberfest,
    experience: filters.experience,
    contributionType: filters.contributionType,
    scope: filters.scope,
    responsiveness: filters.responsiveness,
    readiness: filters.readiness,
    ...(page ? { page: String(page) } : {}),
  });
}

function leastAvailable(
  first: EnrichmentAvailability,
  second: EnrichmentAvailability,
) {
  return ENRICHMENT_PRIORITY[first] >= ENRICHMENT_PRIORITY[second]
    ? first
    : second;
}

function leastAvailableOptional(
  first?: EnrichmentAvailability,
  second?: EnrichmentAvailability,
) {
  if (!first || !second) return first ?? second;
  return leastAvailable(first, second);
}

const ENRICHMENT_PRIORITY: Record<EnrichmentAvailability, number> = {
  complete: 0,
  partial: 1,
  unavailable: 2,
};

function mergeEnrichment(
  current?: SearchEnrichment,
  next?: SearchEnrichment,
): SearchEnrichment | undefined {
  if (!current || !next) return current ?? next;

  return {
    repositoryMetadata: leastAvailable(
      current.repositoryMetadata,
      next.repositoryMetadata,
    ),
    discussionAnalysis: leastAvailable(
      current.discussionAnalysis,
      next.discussionAnalysis,
    ),
    linkedPullRequests: leastAvailable(
      current.linkedPullRequests,
      next.linkedPullRequests,
    ),
    communityProfile: leastAvailableOptional(
      current.communityProfile,
      next.communityProfile,
    ),
  };
}

function DigestControls({
  linkedEmail,
  alertEmail,
  digestEnabled,
  digestStatus,
  isPending,
  onAlertEmailChange,
  onPreferenceChange,
  onSaveAlertEmail,
  onTrigger,
}: Readonly<{
  linkedEmail?: string | null;
  alertEmail: string;
  digestEnabled: boolean;
  digestStatus: string | null;
  isPending: boolean;
  onAlertEmailChange: (value: string) => void;
  onPreferenceChange: () => void;
  onSaveAlertEmail: () => void;
  onTrigger: () => void;
}>) {
  return (
    <div className="rounded-md border p-3">
      <p className="mb-2 text-xs text-muted-foreground">
        Get recommended issues from your saved searches every Monday.
      </p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full gap-2"
        disabled={isPending}
        onClick={onPreferenceChange}
      >
        <Mail className="h-4 w-4" />
        {digestEnabled ? "Disable weekly digest" : "Enable weekly digest"}
      </Button>
      <div className="mt-2 space-y-2">
        <Input
          type="email"
          value={alertEmail}
          onChange={(event) => onAlertEmailChange(event.target.value)}
          placeholder={linkedEmail ?? "Alternate alert email"}
          aria-label="Alternate alert email"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full"
          disabled={isPending}
          onClick={onSaveAlertEmail}
        >
          Save alert email
        </Button>
        <p className="text-xs text-muted-foreground">
          Leave blank to use your GitHub-linked email for all alerts.
        </p>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="mt-2 w-full gap-2"
        disabled={isPending}
        onClick={onTrigger}
      >
        <Mail className="h-4 w-4" />
        Send digest now
      </Button>
      {digestStatus ? (
        <p className="mt-2 text-xs text-muted-foreground">{digestStatus}</p>
      ) : null}
    </div>
  );
}

function SearchSummary({
  error,
  data,
  rateLimitInfo,
  onRetry,
  cooldown,
}: Readonly<{
  error: string | null;
  data: SearchResponse | null;
  rateLimitInfo: { retryAfter: number | null } | null;
  onRetry: () => void;
  cooldown: boolean;
}>) {
  let errorCard: ReactNode = null;

  if (error && rateLimitInfo) {
    errorCard = (
      <ErrorCard
        variant="warning"
        title="Too many requests: please wait"
        message="GitHub is temporarily limiting how many searches you can run. This usually resets in a few minutes."
        description={
          rateLimitInfo.retryAfter
            ? `Please wait approximately ${rateLimitInfo.retryAfter} seconds before retrying.`
            : "Please wait a few minutes before trying again."
        }
        actions={[
          {
            label: cooldown ? "Cooldown..." : "Try again",
            onClick: onRetry,
            disabled: cooldown,
          },
        ]}
        technicalDetails={error}
      />
    );
  } else if (error) {
    errorCard = (
      <ErrorCard
        variant="error"
        title="Search failed"
        message={error}
        actions={[{ label: "Try again", onClick: onRetry }]}
      />
    );
  }

  return (
    <>
      {errorCard}
      {data ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Opportunities</h2>
            <p className="text-sm text-muted-foreground">{data.query}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">
              {compactNumber(data.candidateCount)} ranked candidates
            </Badge>
            <Badge variant="outline">
              {compactNumber(data.totalCount)} raw GitHub matches
            </Badge>
          </div>
        </div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ready when you are</CardTitle>
            <CardDescription>
              Run a search to pull live issue data from GitHub.
            </CardDescription>
          </CardHeader>
        </Card>
      )}
    </>
  );
}

function EnrichmentNotice({ data }: Readonly<{ data: SearchResponse | null }>) {
  if (!data?.enrichment) return null;

  const unavailableSignals = [
    ["repository metadata", data.enrichment.repositoryMetadata],
    ["discussion analysis", data.enrichment.discussionAnalysis],
    ["linked pull requests", data.enrichment.linkedPullRequests],
    ["community profiles", data.enrichment.communityProfile],
  ].filter(
    ([, availability]) =>
      availability !== undefined && availability !== "complete",
  );

  if (unavailableSignals.length === 0) return null;

  return (
    <Card className="border-amber-500/30 bg-amber-500/5">
      <CardHeader>
        <CardTitle className="text-base">
          Some ranking details are unavailable
        </CardTitle>
        <CardDescription>
          Results remain usable, but{" "}
          {unavailableSignals
            .map(([name, availability]) => `${name} is ${availability}`)
            .join("; ")}
          . Scores use the signals GitHub returned.
        </CardDescription>
      </CardHeader>
    </Card>
  );
}

type ContentTab =
  | "results"
  | "recommendations"
  | "workflow"
  | "contributions"
  | "hidden-repositories";

function RankedIssuesPanel({
  error,
  data,
  issues,
  isLoading,
  hasMore,
  isLoadingMore,
  savedOpportunityUrls,
  rateLimitInfo,
  onRetry,
  cooldown,
  onIssueOpen,
  onIssueSaveChange,
  onLoadMore,
}: Readonly<{
  error: string | null;
  data: SearchResponse | null;
  issues: Issue[];
  isLoading: boolean;
  hasMore: boolean;
  isLoadingMore: boolean;
  savedOpportunityUrls: ReadonlySet<string>;
  rateLimitInfo: { retryAfter: number | null } | null;
  onRetry: () => void;
  cooldown: boolean;
  onIssueOpen?: (issue: Issue) => void;
  onIssueSaveChange?: (issue: Issue, saved: boolean) => void;
  onLoadMore: () => void;
}>) {
  return (
    <div
      id="ranked-issues-panel"
      role="tabpanel"
      aria-label="Opportunities"
      className="space-y-4"
    >
      <SearchSummary
        error={error}
        data={data}
        rateLimitInfo={rateLimitInfo}
        onRetry={onRetry}
        cooldown={cooldown}
      />
      <EnrichmentNotice data={data} />
      {isLoading ? <LoadingResults /> : null}
      {!isLoading && data && issues.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">No matching issues</CardTitle>
            <CardDescription>
              Try a broader technology, another label, or recently updated
              sorting.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}
      {!isLoading
        ? issues.map((issue) => (
            <IssueCard
              key={issue.id}
              issue={issue}
              isSaved={savedOpportunityUrls.has(issue.url)}
              onOpen={onIssueOpen}
              onSaveChange={onIssueSaveChange}
            />
          ))
        : null}
      {!isLoading && hasMore ? (
        <div className="flex justify-center pt-4">
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={onLoadMore}
            disabled={isLoadingMore}
            className="w-full max-w-[200px]"
          >
            {isLoadingMore ? "Loading more..." : "Load More"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function RecommendationsPanel({
  savedSearches,
  savedOpportunityUrls,
  onIssueOpen,
  onIssueSaveChange,
}: Readonly<{
  savedSearches: SavedSearch[];
  savedOpportunityUrls: ReadonlySet<string>;
  onIssueOpen: (issue: Issue) => void;
  onIssueSaveChange: (issue: Issue, saved: boolean) => void;
}>) {
  const [data, setData] = useState<RecommendationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preferredSearchId, setPreferredSearchId] = useState(
    () => savedSearches.at(-1)?.id ?? "",
  );
  const selectedSearchId = savedSearches.some(
    (search) => search.id === preferredSearchId,
  )
    ? preferredSearchId
    : (savedSearches.at(-1)?.id ?? "");

  useEffect(() => {
    let cancelled = false;

    if (!selectedSearchId) {
      return () => {
        cancelled = true;
      };
    }

    void getRecommendations(selectedSearchId)
      .then((response) => {
        if (!cancelled) setData(response);
      })
      .catch((recommendationError) => {
        if (!cancelled) {
          setError(
            recommendationError instanceof Error
              ? recommendationError.message
              : "Unable to load recommendations.",
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedSearchId]);

  function selectSearch(searchId: string) {
    setData(null);
    setError(null);
    setPreferredSearchId(searchId);
  }

  async function handleDismiss(issue: Issue, reason: string) {
    if (!data) return;

    setData({
      ...data,
      recommendations: data.recommendations.filter(
        (r) => r.issue.id !== issue.id,
      ),
    });

    try {
      await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repositoryFullName: issue.repo,
          issueNumber: Number.parseInt(issue.url.split("/").pop() ?? "0", 10),
          issueUrl: issue.url,
          reason,
        }),
      });
    } catch (e) {
      console.error("Failed to save feedback", e);
    }
  }

  return (
    <div
      id="recommendations-panel"
      role="tabpanel"
      aria-label="Recommended for you"
      className="space-y-4"
    >
      <div>
        <h2 className="text-xl font-semibold">Recommended for you</h2>
        <p className="text-sm text-muted-foreground">
          Ranked from your most recent saved search preferences.
        </p>
      </div>
      {savedSearches.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Recommendation preferences
            </CardTitle>
            <CardDescription>
              Select one saved search to use its technology and label.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Select value={selectedSearchId} onValueChange={selectSearch}>
              <SelectTrigger
                className="w-full"
                aria-label="Recommendation saved search"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {savedSearches.map((search) => (
                  <SelectItem key={search.id} value={search.id}>
                    {search.name} · {search.tech} · {search.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
      ) : null}
      {selectedSearchId && !data && !error ? <LoadingResults /> : null}
      {error ? (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="text-base text-destructive">
              Recommendations unavailable
            </CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
        </Card>
      ) : null}
      {!selectedSearchId || data?.preferenceCount === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Save a search to get recommendations
            </CardTitle>
            <CardDescription>
              Saved technologies and labels become your recommendation
              preferences.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}
      {data && data.preferenceCount > 0 && data.recommendations.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">No new recommendations</CardTitle>
            <CardDescription>
              Try saving another technology or label preference.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}
      {selectedSearchId
        ? data?.recommendations.map((recommendation) => (
            <IssueCard
              key={recommendation.issue.id}
              issue={recommendation.issue}
              matchSignals={recommendation.matchSignals}
              isSaved={savedOpportunityUrls.has(recommendation.issue.url)}
              onOpen={onIssueOpen}
              onSaveChange={onIssueSaveChange}
              onDismiss={handleDismiss}
            />
          ))
        : null}
    </div>
  );
}

function getActiveIssuePanel({
  activeTab,
  authenticated,
  contributionRevision,
  rankedIssuesPanel,
  recommendationsPanel,
}: Readonly<{
  activeTab: ContentTab;
  authenticated: boolean;
  contributionRevision: number;
  rankedIssuesPanel: ReactNode;
  recommendationsPanel: ReactNode;
}>) {
  if (!authenticated) return rankedIssuesPanel;

  switch (activeTab) {
    case "recommendations":
      return recommendationsPanel;
    case "contributions":
      return (
        <div
          id="contribution-history-panel"
          role="tabpanel"
          aria-label="Contribution history"
        >
          <ContributionHistory key={contributionRevision} />
        </div>
      );
    case "workflow":
      return (
        <div
          id="opportunity-workflow-panel"
          role="tabpanel"
          aria-label="Contribution workflow"
        >
          <OpportunityWorkflow />
        </div>
      );
    case "hidden-repositories":
      return (
        <div
          id="hidden-repositories-panel"
          role="tabpanel"
          aria-label="Hidden repositories"
        >
          <HiddenRepositories />
        </div>
      );
    default:
      return rankedIssuesPanel;
  }
}

function AuthenticatedIssueTabs({
  activeTab,
  onTabChange,
}: Readonly<{
  activeTab: ContentTab;
  onTabChange: (tab: ContentTab) => void;
}>) {
  return (
    <>
      <Button
        type="button"
        role="tab"
        aria-selected={activeTab === "recommendations"}
        aria-controls="recommendations-panel"
        variant={activeTab === "recommendations" ? "default" : "outline"}
        size="sm"
        className="gap-2"
        onClick={() => onTabChange("recommendations")}
      >
        <Sparkles className="h-4 w-4" />
        Recommended for you
      </Button>
      <Button
        type="button"
        role="tab"
        aria-selected={activeTab === "workflow"}
        aria-controls="opportunity-workflow-panel"
        variant={activeTab === "workflow" ? "default" : "outline"}
        size="sm"
        onClick={() => onTabChange("workflow")}
      >
        Workflow
      </Button>
      <Button
        type="button"
        role="tab"
        aria-selected={activeTab === "contributions"}
        aria-controls="contribution-history-panel"
        variant={activeTab === "contributions" ? "default" : "outline"}
        size="sm"
        onClick={() => onTabChange("contributions")}
      >
        Contribution history
      </Button>
      <Button
        type="button"
        role="tab"
        aria-selected={activeTab === "hidden-repositories"}
        aria-controls="hidden-repositories-panel"
        variant={activeTab === "hidden-repositories" ? "default" : "outline"}
        size="sm"
        onClick={() => onTabChange("hidden-repositories")}
      >
        Hidden repositories
      </Button>
    </>
  );
}

function IssueContentTabs({
  activeTab,
  authenticated,
  contributionRevision,
  onTabChange,
  rankedIssuesPanel,
  recommendationsPanel,
}: Readonly<{
  activeTab: ContentTab;
  authenticated: boolean;
  contributionRevision: number;
  onTabChange: (tab: ContentTab) => void;
  rankedIssuesPanel: ReactNode;
  recommendationsPanel: ReactNode;
}>) {
  const activePanel = getActiveIssuePanel({
    activeTab,
    authenticated,
    contributionRevision,
    rankedIssuesPanel,
    recommendationsPanel,
  });

  return (
    <div className="space-y-4">
      <div
        className="flex gap-2 border-b pb-3"
        role="tablist"
        aria-label="Issue activity"
      >
        <Button
          type="button"
          role="tab"
          aria-selected={activeTab === "results"}
          aria-controls="ranked-issues-panel"
          variant={activeTab === "results" ? "default" : "outline"}
          size="sm"
          onClick={() => onTabChange("results")}
        >
          Opportunities
        </Button>
        {authenticated ? (
          <AuthenticatedIssueTabs
            activeTab={activeTab}
            onTabChange={onTabChange}
          />
        ) : null}
      </div>
      {activePanel}
    </div>
  );
}

function IssueFinderSidebar({
  tech,
  savedSearchName,
  savedSearches,
  authenticated,
  linkedEmail,
  alertEmail,
  digestEnabled,
  digestStatus,
  isDigestPending,
  onTechChange,
  onLabelChange,
  onSavedSearchNameChange,
  onSaveSearch,
  onRunSavedSearch,
  onDeleteSavedSearch,
  onAlertEmailChange,
  onDigestPreferenceChange,
  onSaveAlertEmail,
  onDigestTrigger,
}: Readonly<{
  tech: string;
  savedSearchName: string;
  savedSearches: SavedSearch[];
  authenticated: boolean;
  linkedEmail?: string | null;
  alertEmail: string;
  digestEnabled: boolean;
  digestStatus: string | null;
  isDigestPending: boolean;
  onTechChange: (value: string) => void;
  onLabelChange: (value: string) => void;
  onSavedSearchNameChange: (value: string) => void;
  onSaveSearch: () => void;
  onRunSavedSearch: (savedSearch: SavedSearch) => void;
  onDeleteSavedSearch: (id: string) => void;
  onAlertEmailChange: (value: string) => void;
  onDigestPreferenceChange: () => void;
  onSaveAlertEmail: () => void;
  onDigestTrigger: () => void;
}>) {
  return (
    <aside className="space-y-4 lg:self-start">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Quick searches</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {TECH_EXAMPLES.map((example) => (
            <Button
              key={example}
              type="button"
              variant={tech === example ? "default" : "outline"}
              size="sm"
              onClick={() => onTechChange(example)}
            >
              {example}
            </Button>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Supported labels</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {LABEL_OPTIONS.map((option) => {
            const Icon = option.icon;

            return (
              <button
                key={option.value}
                type="button"
                onClick={() => onLabelChange(option.value)}
                className="flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors hover:bg-accent"
              >
                <Icon className="h-4 w-4 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{option.label}</span>
              </button>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Saved searches</CardTitle>
          <CardDescription>
            Save your current filters and reuse them later.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Input
              value={savedSearchName}
              onChange={(event) => onSavedSearchNameChange(event.target.value)}
              placeholder="Search name"
              aria-label="Saved search name"
            />
            <Button
              type="button"
              className="w-full gap-2"
              onClick={onSaveSearch}
            >
              <Bookmark className="h-4 w-4" />
              Save current search
            </Button>
          </div>

          {authenticated ? (
            <DigestControls
              linkedEmail={linkedEmail}
              alertEmail={alertEmail}
              digestEnabled={digestEnabled}
              digestStatus={digestStatus}
              isPending={isDigestPending}
              onAlertEmailChange={onAlertEmailChange}
              onPreferenceChange={onDigestPreferenceChange}
              onSaveAlertEmail={onSaveAlertEmail}
              onTrigger={onDigestTrigger}
            />
          ) : null}

          {savedSearches.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No saved searches yet.
            </p>
          ) : (
            <div className="space-y-2">
              {savedSearches.map((savedSearch) => (
                <div key={savedSearch.id} className="rounded-md border p-3">
                  <div className="mb-2 min-w-0">
                    <p className="truncate text-sm font-medium">
                      {savedSearch.name}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {savedSearch.tech} · {savedSearch.label}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => onRunSavedSearch(savedSearch)}
                    >
                      Run
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      aria-label={`Delete ${savedSearch.name}`}
                      onClick={() => onDeleteSavedSearch(savedSearch.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      {authenticated ? <RepositoryDigestCard /> : null}
      {authenticated ? (
        <AdminEmailCard defaultEmail={alertEmail || linkedEmail} />
      ) : null}
    </aside>
  );
}

export function IssueFinder() {
  const { data: session, isPending: isSessionPending } =
    authClient.useSession();
  const [tech, setTech] = useState(DEFAULT_SEARCH_FILTERS.tech);
  const [label, setLabel] = useState(DEFAULT_SEARCH_FILTERS.label);
  const [sort, setSort] = useState(DEFAULT_SEARCH_FILTERS.sort);
  const [linkedPr, setLinkedPr] = useState(DEFAULT_SEARCH_FILTERS.linkedPr);
  const [hacktoberfest, setHacktoberfest] = useState(
    DEFAULT_SEARCH_FILTERS.hacktoberfest,
  );
  const [experience, setExperience] = useState(
    DEFAULT_SEARCH_FILTERS.experience,
  );
  const [contributionType, setContributionType] = useState(
    DEFAULT_SEARCH_FILTERS.contributionType,
  );
  const [scope, setScope] = useState(DEFAULT_SEARCH_FILTERS.scope);
  const [responsiveness, setResponsiveness] = useState(
    DEFAULT_SEARCH_FILTERS.responsiveness,
  );
  const [readiness, setReadiness] = useState(DEFAULT_SEARCH_FILTERS.readiness);
  const [data, setData] = useState<SearchResponse | null>(null);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rateLimitInfo, setRateLimitInfo] = useState<{
    retryAfter: number | null;
  } | null>(null);
  const [cooldown, setCooldown] = useState(false);
  const [errorSource, setErrorSource] = useState<"search" | "loadMore" | null>(
    null,
  );
  const searchRequestId = useRef(0);
  const cooldownTimeoutId = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [savedSearchName, setSavedSearchName] = useState("");
  const [digestEnabled, setDigestEnabled] = useState(false);
  const [isDigestPending, setIsDigestPending] = useState(false);
  const [digestStatus, setDigestStatus] = useState<string | null>(null);
  const [alertEmail, setAlertEmail] = useState("");
  const [savedOpportunityUrls, setSavedOpportunityUrls] = useState<Set<string>>(
    new Set(),
  );
  const [opportunityRevision, setOpportunityRevision] = useState(0);
  const [activeContentTab, setActiveContentTab] =
    useState<ContentTab>("results");
  const selectedContentTab = session?.user.id ? activeContentTab : "results";

  useEffect(() => {
    // Hydration must start with the server's empty snapshot before reading browser storage.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSavedSearches(getSavedSearches());
  }, []);

  useEffect(
    () => () => {
      if (cooldownTimeoutId.current) {
        clearTimeout(cooldownTimeoutId.current);
      }
    },
    [],
  );

  function scheduleCooldownEnd(durationMs: number) {
    if (cooldownTimeoutId.current) {
      clearTimeout(cooldownTimeoutId.current);
    }

    setCooldown(true);
    cooldownTimeoutId.current = setTimeout(() => {
      setCooldown(false);
      cooldownTimeoutId.current = null;
    }, durationMs);
  }

  useEffect(() => {
    function restoreSearch() {
      const linkedSearch = getSearchFilters(window.location.search);

      if (!linkedSearch) {
        searchRequestId.current += 1;
        setTech(DEFAULT_SEARCH_FILTERS.tech);
        setLabel(DEFAULT_SEARCH_FILTERS.label);
        setSort(DEFAULT_SEARCH_FILTERS.sort);
        setLinkedPr(DEFAULT_SEARCH_FILTERS.linkedPr);
        setHacktoberfest(DEFAULT_SEARCH_FILTERS.hacktoberfest);
        setExperience(DEFAULT_SEARCH_FILTERS.experience);
        setContributionType(DEFAULT_SEARCH_FILTERS.contributionType);
        setScope(DEFAULT_SEARCH_FILTERS.scope);
        setResponsiveness(DEFAULT_SEARCH_FILTERS.responsiveness);
        setReadiness(DEFAULT_SEARCH_FILTERS.readiness);
        setData(null);
        setIssues([]);
        setError(null);
        setRateLimitInfo(null);
        setErrorSource(null);
        setPage(1);
        setIsLoading(false);
        return;
      }

      setTech(linkedSearch.tech);
      setLabel(linkedSearch.label);
      setSort(linkedSearch.sort);
      setLinkedPr(linkedSearch.linkedPr);
      setHacktoberfest(linkedSearch.hacktoberfest);
      setExperience(linkedSearch.experience);
      setContributionType(linkedSearch.contributionType);
      setScope(linkedSearch.scope);
      setResponsiveness(linkedSearch.responsiveness);
      setReadiness(linkedSearch.readiness);
      void searchIssues(undefined, linkedSearch, false);
    }

    restoreSearch();
    window.addEventListener("popstate", restoreSearch);

    return () => window.removeEventListener("popstate", restoreSearch);
    // The URL is an initial navigation input, not reactive component state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (isSessionPending || !session?.user.id) return;

    let cancelled = false;

    async function syncWithAccount() {
      try {
        const syncedSearches = await syncSavedSearches(getSavedSearches());

        if (!cancelled) {
          replaceSavedSearches(syncedSearches);
          setSavedSearches(syncedSearches);
        }
      } catch {
        // Local saved searches remain available if account sync is unavailable.
      }
    }

    void syncWithAccount();

    return () => {
      cancelled = true;
    };
  }, [isSessionPending, session?.user.id]);

  useEffect(() => {
    if (isSessionPending || !session?.user.id) return;

    let cancelled = false;
    void getOpportunities()
      .then((opportunities) => {
        if (!cancelled) {
          setSavedOpportunityUrls(
            new Set(
              opportunities
                .filter((opportunity) => opportunity.savedAt)
                .map((opportunity) => opportunity.issueUrl),
            ),
          );
        }
      })
      .catch(() => {
        // Issue discovery remains available if opportunity history cannot load.
      });

    return () => {
      cancelled = true;
    };
  }, [isSessionPending, session?.user.id]);

  async function handleOpportunitySave(issue: Issue, saved: boolean) {
    try {
      await updateOpportunity(issue, saved ? "save" : "unsave");
      setSavedOpportunityUrls((current) => {
        const next = new Set(current);
        if (saved) next.add(issue.url);
        else next.delete(issue.url);
        return next;
      });
      setOpportunityRevision((current) => current + 1);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to update the opportunity.",
      );
    }
  }

  function handleOpportunityOpen(issue: Issue) {
    void updateOpportunity(issue, "open")
      .then(() => setOpportunityRevision((current) => current + 1))
      .catch(() => {
        // Opening GitHub should not be blocked if activity tracking fails.
      });
  }

  useEffect(() => {
    if (isSessionPending || !session?.user.id) return;

    let cancelled = false;

    void Promise.all([getDigestPreference(), getAlertEmail()])
      .then(([enabled, savedAlertEmail]) => {
        if (!cancelled) {
          setDigestEnabled(enabled);
          setAlertEmail(savedAlertEmail);
        }
      })
      .catch(() => {
        // Saved searches remain usable if the preference cannot be loaded.
      });

    return () => {
      cancelled = true;
    };
  }, [isSessionPending, session?.user.id]);

  const selectedLabel = useMemo(
    () =>
      LABEL_OPTIONS.find((item) => item.value === label) ?? LABEL_OPTIONS[0],
    [label],
  );
  const selectedLinkedPr = useMemo(
    () =>
      LINKED_PR_OPTIONS.find((item) => item.value === linkedPr) ??
      LINKED_PR_OPTIONS[0],
    [linkedPr],
  );
  const selectedSort = useMemo(
    () => SORT_OPTIONS.find((item) => item.value === sort) ?? SORT_OPTIONS[0],
    [sort],
  );
  const selectedHacktoberfest = useMemo(
    () =>
      HACKTOBERFEST_OPTIONS.find((item) => item.value === hacktoberfest) ??
      HACKTOBERFEST_OPTIONS[0],
    [hacktoberfest],
  );
  const selectedExperience = useMemo(
    () =>
      EXPERIENCE_OPTIONS.find((item) => item.value === experience) ??
      EXPERIENCE_OPTIONS[0],
    [experience],
  );
  const selectedContributionType = useMemo(
    () =>
      CONTRIBUTION_TYPE_OPTIONS.find(
        (item) => item.value === contributionType,
      ) ?? CONTRIBUTION_TYPE_OPTIONS[0],
    [contributionType],
  );
  const selectedScope = useMemo(
    () =>
      SCOPE_OPTIONS.find((item) => item.value === scope) ?? SCOPE_OPTIONS[0],
    [scope],
  );
  const selectedResponsiveness = useMemo(
    () =>
      RESPONSIVENESS_OPTIONS.find((item) => item.value === responsiveness) ??
      RESPONSIVENESS_OPTIONS[0],
    [responsiveness],
  );
  const selectedReadiness = useMemo(
    () =>
      READINESS_OPTIONS.find((item) => item.value === readiness) ??
      READINESS_OPTIONS[0],
    [readiness],
  );

  const hasMore = useMemo(() => {
    if (!data) return false;
    return issues.length < data.candidateCount && data.issues.length === 24;
  }, [data, issues]);

  function handleSaveSearch() {
    const name = savedSearchName.trim();

    if (!name) {
      setError("Enter a name for the saved search.");
      return;
    }

    if (!tech.trim()) {
      setError("Enter a technology before saving the search.");
      return;
    }
    try {
      const savedSearch = addSavedSearch({
        name,
        tech: tech.trim(),
        label,
        sort,
        linkedPr,
        hacktoberfest,
        experience,
        contributionType,
        scope,
        responsiveness,
        readiness,
      });

      setSavedSearches((current) => [...current, savedSearch]);
      setSavedSearchName("");
      setError(null);

      if (session?.user.id) {
        void syncSavedSearches(getSavedSearches())
          .then((syncedSearches) => {
            replaceSavedSearches(syncedSearches);
            setSavedSearches(syncedSearches);
          })
          .catch(() => {
            setError("Search saved locally, but account sync failed.");
          });
      }
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to save search.",
      );
    }
  }

  async function handleDeleteSavedSearch(id: string) {
    if (session?.user.id) {
      try {
        await deleteCloudSavedSearch(id);
      } catch (deleteError) {
        setError(
          deleteError instanceof Error
            ? deleteError.message
            : "Unable to remove the saved search from your account.",
        );
        return;
      }
    }

    deleteSavedSearch(id);
    setSavedSearches(getSavedSearches());
    setError(null);
  }

  function handleRunSavedSearch(savedSearch: SavedSearch) {
    setTech(savedSearch.tech);
    setLabel(savedSearch.label);
    setSort(savedSearch.sort);
    setLinkedPr(savedSearch.linkedPr);
    setHacktoberfest(savedSearch.hacktoberfest);
    setExperience(savedSearch.experience ?? "any");
    setContributionType(savedSearch.contributionType ?? "any");
    setScope(savedSearch.scope ?? "any");
    setResponsiveness(savedSearch.responsiveness ?? "any");
    setReadiness(savedSearch.readiness ?? "any");

    void searchIssues(undefined, {
      tech: savedSearch.tech,
      label: savedSearch.label,
      sort: savedSearch.sort,
      linkedPr: savedSearch.linkedPr,
      hacktoberfest: savedSearch.hacktoberfest,
      experience: savedSearch.experience ?? "any",
      contributionType: savedSearch.contributionType ?? "any",
      scope: savedSearch.scope ?? "any",
      responsiveness: savedSearch.responsiveness ?? "any",
      readiness: savedSearch.readiness ?? "any",
    });
  }

  async function handleDigestPreference() {
    setIsDigestPending(true);

    try {
      const enabled = await updateDigestPreference(!digestEnabled);
      setDigestEnabled(enabled);
      setError(null);
    } catch (preferenceError) {
      setError(
        preferenceError instanceof Error
          ? preferenceError.message
          : "Unable to update the weekly digest preference.",
      );
    } finally {
      setIsDigestPending(false);
    }
  }

  async function handleDigestTrigger() {
    setIsDigestPending(true);
    setDigestStatus(null);

    try {
      await triggerWeeklyDigest();
      setDigestStatus("Weekly digest sent. Check your inbox.");
      setError(null);
    } catch (triggerError) {
      setError(
        triggerError instanceof Error
          ? triggerError.message
          : "Unable to send the weekly digest.",
      );
    } finally {
      setIsDigestPending(false);
    }
  }

  async function handleAlertEmail() {
    setIsDigestPending(true);
    setDigestStatus(null);

    try {
      const savedAlertEmail = await updateAlertEmail(alertEmail);
      setAlertEmail(savedAlertEmail);
      setDigestStatus(
        savedAlertEmail
          ? `Alerts will be sent to ${savedAlertEmail}.`
          : "Alerts will use your GitHub-linked email.",
      );
      setError(null);
    } catch (alertEmailError) {
      setError(
        alertEmailError instanceof Error
          ? alertEmailError.message
          : "Unable to update the alert email.",
      );
    } finally {
      setIsDigestPending(false);
    }
  }

  async function searchIssues(
    event?: SubmitEvent<HTMLFormElement>,
    searchOverride?: SearchFilters,
    updateHistory = true,
  ) {
    event?.preventDefault();

    const searchTech = searchOverride?.tech ?? tech;
    const searchLabel = searchOverride?.label ?? label;
    const searchSort = searchOverride?.sort ?? sort;
    const searchLinkedPr = searchOverride?.linkedPr ?? linkedPr;
    const searchHacktoberfest = searchOverride?.hacktoberfest ?? hacktoberfest;
    const searchExperience = searchOverride?.experience ?? experience;
    const searchContributionType =
      searchOverride?.contributionType ?? contributionType;
    const searchScope = searchOverride?.scope ?? scope;
    const searchResponsiveness =
      searchOverride?.responsiveness ?? responsiveness;
    const searchReadiness = searchOverride?.readiness ?? readiness;

    if (!searchTech.trim()) {
      setError("Enter a technology to search.");
      return;
    }

    setIsLoading(true);
    setActiveContentTab("results");
    setCooldown(true);
    setError(null);
    setRateLimitInfo(null);
    setErrorSource(null);
    setIssues([]);
    setPage(1);

    const params = createSearchParams({
      tech: searchTech,
      label: searchLabel,
      sort: searchSort,
      linkedPr: searchLinkedPr,
      hacktoberfest: searchHacktoberfest,
      experience: searchExperience,
      contributionType: searchContributionType,
      scope: searchScope,
      responsiveness: searchResponsiveness,
      readiness: searchReadiness,
    });
    const requestId = ++searchRequestId.current;
    let cooldownDurationMs = SEARCH_COOLDOWN_MS;

    try {
      const response = await fetch(`/api/search?${params.toString()}`);
      const payload = (await response.json()) as SearchResponse;

      if (!response.ok) {
        throw createSearchApiError(payload, "Search failed.");
      }

      if (requestId !== searchRequestId.current) return;

      setData(payload);
      setIssues(rankIssues(payload.issues, searchSort));
      if (updateHistory) {
        const nextUrl = `${window.location.pathname}?${params.toString()}`;
        const currentUrl = `${window.location.pathname}${window.location.search}`;

        if (nextUrl !== currentUrl) {
          window.history.pushState(null, "", nextUrl);
        }
      }
    } catch (searchError) {
      if (requestId !== searchRequestId.current) return;

      setError(
        getErrorMessage(
          searchError,
          "Search failed. Try another technology or label.",
        ),
      );
      setErrorSource("search");

      const rateLimit = getRateLimitDetails(searchError);
      if (rateLimit) {
        setRateLimitInfo({ retryAfter: rateLimit.retryAfter });
        cooldownDurationMs = rateLimit.cooldownMs;
      }
    } finally {
      if (requestId === searchRequestId.current) {
        setIsLoading(false);
        scheduleCooldownEnd(cooldownDurationMs);
      }
    }
  }

  async function loadMoreIssues() {
    if (isLoadingMore || !tech.trim() || !data) return;

    setIsLoadingMore(true);
    setError(null);
    setRateLimitInfo(null);
    setErrorSource(null);

    const nextPage = page + 1;
    const params = createSearchParams(
      {
        tech,
        label,
        sort,
        linkedPr,
        hacktoberfest,
        experience,
        contributionType,
        scope,
        responsiveness,
        readiness,
      },
      nextPage,
    );
    let rateLimitCooldownMs: number | null = null;

    try {
      const response = await fetch(`/api/search?${params.toString()}`);
      const payload = (await response.json()) as SearchResponse;

      if (!response.ok) {
        throw createSearchApiError(payload, "Failed to load more issues.");
      }

      setIssues((prev) => mergeRankedIssues(prev, payload.issues, sort));
      setPage(nextPage);
      setData((current) => ({
        ...payload,
        enrichment: mergeEnrichment(current?.enrichment, payload.enrichment),
      }));
    } catch (searchError) {
      setError(getErrorMessage(searchError, "Failed to load more issues."));
      setErrorSource("loadMore");

      const rateLimit = getRateLimitDetails(searchError);
      if (rateLimit) {
        setRateLimitInfo({ retryAfter: rateLimit.retryAfter });
        rateLimitCooldownMs = rateLimit.cooldownMs;
      }
    } finally {
      setIsLoadingMore(false);
      if (rateLimitCooldownMs !== null) {
        scheduleCooldownEnd(rateLimitCooldownMs);
      }
    }
  }

  let tokenStatus = "unknown";
  if (data) {
    tokenStatus = data.tokenConfigured ? "configured" : "not set";
  }

  const handleRetry =
    errorSource === "loadMore"
      ? () => void loadMoreIssues()
      : () => void searchIssues();

  return (
    <main className="min-h-screen bg-background">
      <section className="border-b bg-muted/30">
        <div className="mx-auto grid w-full max-w-7xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:px-8">
          <div className="flex min-w-0 flex-col justify-between gap-8">
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary" className="gap-1.5">
                    <Image
                      src="/openissue-logo.png"
                      alt=""
                      width={16}
                      height={16}
                      className="h-4 w-4"
                    />
                    OSS Issue Finder
                  </Badge>
                  <Badge variant="outline">GitHub Search API</Badge>
                </div>
                <div className="flex items-center gap-2">
                  <AuthControls />
                  <ThemeToggle />
                </div>
              </div>
              <div className="max-w-3xl space-y-4">
                <h1 className="text-4xl font-semibold tracking-normal text-foreground sm:text-5xl">
                  Find active open-source issues by tech.
                </h1>
                <p className="max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
                  Search contributor-friendly GitHub issues with labels like
                  help wanted, good first issue, up-for-grabs, and
                  documentation.
                </p>
              </div>
            </div>

            <form
              onSubmit={searchIssues}
              className="grid min-w-0 gap-3 rounded-lg border bg-card p-3 shadow-sm sm:grid-cols-2 lg:grid-cols-3"
            >
              <div className="relative min-w-0">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={tech}
                  onChange={(event) => setTech(event.target.value)}
                  placeholder="Java, React, Kubernetes..."
                  className="h-11 pl-9"
                  aria-label="Technology"
                />
              </div>

              <Select value={label} onValueChange={setLabel}>
                <SelectTrigger
                  className="h-11 w-full"
                  size="lg"
                  aria-label="Issue label"
                >
                  <SelectValue>{selectedLabel.label}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {LABEL_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={sort} onValueChange={setSort}>
                <SelectTrigger
                  className="h-11 w-full"
                  size="lg"
                  aria-label="Sort results"
                >
                  <SelectValue>{selectedSort.label}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {SORT_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={linkedPr} onValueChange={setLinkedPr}>
                <SelectTrigger
                  className="h-11 w-full"
                  size="lg"
                  aria-label="Linked PR filter"
                >
                  <SelectValue>{selectedLinkedPr.label}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {LINKED_PR_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={hacktoberfest} onValueChange={setHacktoberfest}>
                <SelectTrigger
                  className="h-11 w-full"
                  size="lg"
                  aria-label="Hacktoberfest filter"
                >
                  <SelectValue>{selectedHacktoberfest.label}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {HACKTOBERFEST_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={experience} onValueChange={setExperience}>
                <SelectTrigger
                  className="h-11 w-full"
                  size="lg"
                  aria-label="Experience filter"
                >
                  <SelectValue>{selectedExperience.label}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {EXPERIENCE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={contributionType}
                onValueChange={setContributionType}
              >
                <SelectTrigger
                  className="h-11 w-full"
                  size="lg"
                  aria-label="Contribution type filter"
                >
                  <SelectValue>{selectedContributionType.label}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {CONTRIBUTION_TYPE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={scope} onValueChange={setScope}>
                <SelectTrigger
                  className="h-11 w-full"
                  size="lg"
                  aria-label="Scope filter"
                >
                  <SelectValue>{selectedScope.label}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {SCOPE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={responsiveness} onValueChange={setResponsiveness}>
                <SelectTrigger
                  className="h-11 w-full"
                  size="lg"
                  aria-label="Maintainer responsiveness filter"
                >
                  <SelectValue>{selectedResponsiveness.label}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {RESPONSIVENESS_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={readiness} onValueChange={setReadiness}>
                <SelectTrigger
                  className="h-11 w-full"
                  size="lg"
                  aria-label="Contribution readiness filter"
                >
                  <SelectValue>{selectedReadiness.label}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {READINESS_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button
                type="submit"
                className="h-11 w-full gap-2 sm:col-span-2 lg:col-span-1"
                disabled={isLoading || cooldown}
              >
                <Search className="h-4 w-4" />
                {cooldown && !isLoading ? "Cooldown..." : "Search"}
              </Button>
            </form>
          </div>

          <Card className="self-end">
            <CardHeader>
              <CardTitle className="text-base">Search overview</CardTitle>
              <CardDescription>
                Current filters and GitHub search coverage.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 text-sm">
              <Metric label="Label" value={selectedLabel.label} />
              <Metric
                label="Sort"
                value={sort === "created" ? "newest" : sort}
              />
              <Metric
                label="Linked PR"
                value={selectedLinkedPr.label.replace("Linked PR: ", "")}
              />
              <Metric
                label="Hacktoberfest"
                value={selectedHacktoberfest.label}
              />
              <Metric label="Experience" value={selectedExperience.label} />
              <Metric label="Type" value={selectedContributionType.label} />
              <Metric label="Scope" value={selectedScope.label} />
              <Metric
                label="Responsiveness"
                value={selectedResponsiveness.label}
              />
              <Metric
                label="Ranked"
                value={data ? compactNumber(data.candidateCount) : "-"}
              />
              <Metric
                label="Raw GitHub matches"
                value={data ? compactNumber(data.totalCount) : "-"}
              />
              <Metric label="GitHub token" value={tokenStatus} />
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[260px_minmax(0,1fr)] lg:px-8">
        <IssueFinderSidebar
          tech={tech}
          savedSearchName={savedSearchName}
          savedSearches={savedSearches}
          authenticated={Boolean(session?.user.id)}
          linkedEmail={session?.user.email}
          alertEmail={alertEmail}
          digestEnabled={digestEnabled}
          digestStatus={digestStatus}
          isDigestPending={isDigestPending}
          onTechChange={setTech}
          onLabelChange={setLabel}
          onSavedSearchNameChange={setSavedSearchName}
          onSaveSearch={handleSaveSearch}
          onRunSavedSearch={handleRunSavedSearch}
          onDeleteSavedSearch={(id) => void handleDeleteSavedSearch(id)}
          onAlertEmailChange={setAlertEmail}
          onDigestPreferenceChange={() => void handleDigestPreference()}
          onSaveAlertEmail={() => void handleAlertEmail()}
          onDigestTrigger={() => void handleDigestTrigger()}
        />

        <IssueContentTabs
          activeTab={selectedContentTab}
          authenticated={Boolean(session?.user.id)}
          contributionRevision={opportunityRevision}
          onTabChange={setActiveContentTab}
          rankedIssuesPanel={
            <RankedIssuesPanel
              error={error}
              data={data}
              issues={issues}
              isLoading={isLoading}
              hasMore={hasMore}
              isLoadingMore={isLoadingMore}
              savedOpportunityUrls={savedOpportunityUrls}
              rateLimitInfo={rateLimitInfo}
              onRetry={handleRetry}
              cooldown={cooldown}
              onIssueOpen={session?.user.id ? handleOpportunityOpen : undefined}
              onIssueSaveChange={
                session?.user.id
                  ? (selectedIssue, saved) =>
                      void handleOpportunitySave(selectedIssue, saved)
                  : undefined
              }
              onLoadMore={() => void loadMoreIssues()}
            />
          }
          recommendationsPanel={
            <RecommendationsPanel
              savedSearches={savedSearches}
              savedOpportunityUrls={savedOpportunityUrls}
              onIssueOpen={handleOpportunityOpen}
              onIssueSaveChange={(selectedIssue, saved) =>
                void handleOpportunitySave(selectedIssue, saved)
              }
            />
          }
        />
      </section>
    </main>
  );
}
