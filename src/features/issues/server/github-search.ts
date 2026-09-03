import {
  CONTRIBUTION_TYPE_FILTERS,
  EXPERIENCE_FILTERS,
  GITHUB_LABELS,
  GITHUB_SORTS,
  HACKTOBERFEST_FILTERS,
  LINKED_PR_FILTERS,
  LANGUAGE_ALIASES,
  READINESS_FILTERS,
  RESPONSIVENESS_FILTERS,
  SCOPE_FILTERS,
  TOPIC_ALIASES,
} from "@/features/issues/data/search-options";
import {
  classifyIssue,
  matchesClassification,
} from "@/features/issues/lib/issue-classification";
import { rankIssues } from "@/features/issues/lib/ranking";
import {
  includeLinkedPullRequestSignal,
  scoreContributionReadiness,
  unknownContributionReadiness,
} from "@/features/issues/lib/contribution-readiness";
import { scoreRepositoryHealth } from "@/features/issues/lib/repository-health";
import {
  getResponsivenessBoost,
  scoreRepositoryResponsiveness,
  unknownRepositoryResponsiveness,
  type ResponsivenessIssue,
  type ResponsivenessPullRequest,
} from "@/features/issues/lib/repository-responsiveness";
import type {
  GitHubIssue,
  GitHubRepo,
  GitHubRepoSearchResponse,
  GitHubSearchResponse,
  GitHubTimelineEvent,
  Issue,
  IssueEnrichment,
  IssueStatus,
  SearchResponse,
  RepositoryDigestIssue,
  RepositorySuggestion,
} from "@/features/issues/types/search";

const PAGE_SIZE = 24;
const CANDIDATE_PAGE_COUNT = 5;
const REPO_SEARCH_PAGE_SIZE = 20;
const REPO_ISSUE_BATCH_SIZE = 10;
const RESPONSIVENESS_REPOSITORY_LIMIT = 12;
const COMMUNITY_PROFILE_REPOSITORY_LIMIT = 12;

export class RateLimitError extends Error {
  retryAfterSeconds: number | null;

  constructor(message: string, retryAfterSeconds: number | null = null) {
    super(message);
    this.name = "RateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export function isRateLimitError(error: unknown): error is RateLimitError {
  return error instanceof RateLimitError;
}

type GitHubCommunityProfileResponse = {
  health_percentage: number;
  files: Partial<
    Record<
      | "readme"
      | "contributing"
      | "license"
      | "code_of_conduct"
      | "issue_template"
      | "pull_request_template",
      { html_url?: string | null } | null
    >
  >;
};

type GitHubResponsivenessResponse = {
  data?: {
    repository?: {
      issues: { nodes: ResponsivenessIssue[] };
      pullRequests: { nodes: ResponsivenessPullRequest[] };
    } | null;
  };
  errors?: Array<{ message: string }>;
};

const RESPONSIVENESS_QUERY = `
  query RepositoryResponsiveness($owner: String!, $name: String!, $since: DateTime!) {
    repository(owner: $owner, name: $name) {
      issues(first: 20, orderBy: { field: CREATED_AT, direction: DESC }, filterBy: { since: $since }) {
        nodes {
          author { login }
          closedAt
          createdAt
          labels(first: 10) { nodes { name } }
          comments(first: 20) {
            nodes { author { login } authorAssociation createdAt }
          }
        }
      }
      pullRequests(first: 20, orderBy: { field: CREATED_AT, direction: DESC }) {
        nodes { authorAssociation createdAt mergedAt }
      }
    }
  }
`;

function normalize(value: string | null) {
  return (value ?? "").trim().toLowerCase();
}

function resolveSearchOption(
  value: string | null | undefined,
  supportedOptions: Set<string>,
  fallback: string,
) {
  return value && supportedOptions.has(value) ? value : fallback;
}

function matchesSearchFilters(
  issue: Issue,
  filters: {
    hacktoberfest: string;
    responsiveness: string;
    readiness: string;
    experience: string;
    contributionType: string;
    scope: string;
  },
) {
  if (filters.hacktoberfest === "only" && !issue.hacktoberfest) return false;
  if (
    filters.responsiveness !== "any" &&
    issue.repositoryResponsiveness?.status !== filters.responsiveness
  ) {
    return false;
  }
  if (
    filters.readiness !== "any" &&
    issue.contributionReadiness?.status !== filters.readiness
  ) {
    return false;
  }
  if (!issue.classification) return false;

  return matchesClassification(
    issue.classification,
    filters.experience,
    filters.contributionType,
    filters.scope,
  );
}

function quoteSearchValue(value: string) {
  const escapedValue = value.replaceAll('"', String.raw`\"`);

  return /[\s#+.]/.test(value) ? `"${escapedValue}"` : value;
}

function buildTechQualifier(tech: string) {
  const normalized = normalize(tech);
  const language = LANGUAGE_ALIASES[normalized];

  if (language) {
    return `language:${quoteSearchValue(language)}`;
  }

  return quoteSearchValue(tech.trim());
}

function buildRepoTopicQuery(tech: string) {
  const normalized = normalize(tech);
  const topicAlias = TOPIC_ALIASES[normalized];
  const language = LANGUAGE_ALIASES[normalized];

  if (language && !topicAlias) {
    return null;
  }

  const topic = topicAlias?.topic ?? normalized.replaceAll(/\s+/g, "-");
  const queryParts = [`topic:${quoteSearchValue(topic)}`, "archived:false"];

  if (topicAlias?.language) {
    queryParts.push(`language:${quoteSearchValue(topicAlias.language)}`);
  }

  return queryParts.join(" ");
}

function buildRepoScopeQualifier(repoNames: string[]) {
  const qualifiers = repoNames.map((repoName) => `repo:${repoName}`);

  if (qualifiers.length === 1) {
    return qualifiers[0];
  }

  return `(${qualifiers.join(" OR ")})`;
}

function buildLinkedPrQualifier(linkedPr: string) {
  if (linkedPr === "yes") {
    return "linked:pr";
  }

  if (linkedPr === "no") {
    return "-linked:pr";
  }

  return null;
}

function buildUpdatedQualifier(updatedAfter?: string, updatedBefore?: string) {
  if (!updatedAfter) return null;
  const range = updatedBefore
    ? `${updatedAfter}..${updatedBefore}`
    : `>=${updatedAfter}`;
  return `updated:${range}`;
}

function getRepoFullName(repositoryUrl: string) {
  const apiPrefix = "https://api.github.com/repos/";

  return repositoryUrl.startsWith(apiPrefix)
    ? repositoryUrl.slice(apiPrefix.length)
    : (repositoryUrl.split("/repos/").at(-1) ?? repositoryUrl);
}

function analyzeThreadIntent(comments: Array<{ body: string }>): IssueStatus {
  if (comments.length === 0) {
    return "open";
  }

  const text = comments.map((c) => (c.body || "").toLowerCase()).join(" ");

  const resolvedIndicators = [
    "fixed in",
    "fixed by",
    "resolved",
    "closed by",
    "merged",
    "close this",
    "closing this",
    "already fixed",
    "already solved",
  ];

  const claimedIndicators = [
    "i'm on it",
    "i'm working on",
    "i am working on",
    "taking this up",
    "i will take this",
    "i will work on",
    "pr in progress",
    "assigned to",
    "working on it",
    "submitting a pr",
    "submitting a pull request",
  ];

  const resolvedMatch = resolvedIndicators.some((indicator) =>
    text.includes(indicator),
  );
  if (resolvedMatch) {
    return "resolved";
  }

  const claimedMatch = claimedIndicators.some((indicator) =>
    text.includes(indicator),
  );
  if (claimedMatch) {
    return "claimed";
  }

  return "open";
}

function countLinkedPullRequests(events: GitHubTimelineEvent[]) {
  const linkedPullRequests = new Set<string>();

  for (const event of events) {
    const issue = event.source?.issue;

    if (
      event.event === "cross-referenced" &&
      issue?.pull_request &&
      issue.html_url
    ) {
      linkedPullRequests.add(issue.html_url);
    }
  }

  return linkedPullRequests.size;
}

function getHacktoberfestSource(issue: GitHubIssue, repo?: GitHubRepo) {
  const hasRepoTopic = repo?.topics?.some(
    (topic) => normalize(topic) === "hacktoberfest",
  );

  if (hasRepoTopic) {
    return "repo-topic" as const;
  }

  const hasIssueLabel = issue.labels.some((label) =>
    normalize(label.name).includes("hacktoberfest"),
  );

  return hasIssueLabel ? ("issue-label" as const) : null;
}

function scoreIssue(
  issue: GitHubIssue,
  repo?: GitHubRepo,
  helpStatus?: IssueStatus,
  hacktoberfestReady = false,
) {
  const ageDays =
    (Date.now() - new Date(issue.updated_at).getTime()) / (1000 * 60 * 60 * 24);
  const recencyScore = Math.max(0, 35 - ageDays * 1.5);
  const starScore = Math.min(
    25,
    Math.log10((repo?.stargazers_count ?? 0) + 1) * 8,
  );
  const labelScore = Math.min(20, issue.labels.length * 4);
  const commentScore = Math.max(0, 15 - issue.comments * 1.5);
  const assignmentScore = issue.assignee || issue.assignees?.length ? 0 : 5;
  const hacktoberfestScore = hacktoberfestReady ? 8 : 0;

  let score = Math.round(
    recencyScore +
      starScore +
      labelScore +
      commentScore +
      assignmentScore +
      hacktoberfestScore,
  );

  if (helpStatus === "claimed") {
    score = Math.max(0, score - 25);
  } else if (helpStatus === "resolved") {
    score = Math.max(0, score - 45);
  }

  return score;
}

function scoreTrendingIssue(issue: GitHubIssue, repo?: GitHubRepo) {
  const ageDays = Math.max(
    0,
    (Date.now() - new Date(issue.updated_at).getTime()) / (1000 * 60 * 60 * 24),
  );
  const recencyScore = Math.max(0, 40 - ageDays * (40 / 30));
  const discussionScore = Math.min(20, Math.log2(issue.comments + 1) * 5);
  const starScore = Math.min(
    20,
    Math.log10((repo?.stargazers_count ?? 0) + 1) * 5,
  );
  const repositoryActivityScore =
    (scoreRepositoryHealth(repo).score ?? 0) * 0.2;

  return Math.round(
    recencyScore + discussionScore + starScore + repositoryActivityScore,
  );
}

function dedupeIssues(issues: GitHubIssue[]) {
  const issueMap = new Map<string, GitHubIssue>();

  for (const issue of issues) {
    issueMap.set(issue.html_url, issue);
  }

  return Array.from(issueMap.values());
}

function summarizeEnrichment(issues: Issue[], signal: keyof IssueEnrichment) {
  if (issues.length === 0) return "complete" as const;

  const availableCount = issues.filter(
    (issue) => issue.enrichment?.[signal],
  ).length;

  if (availableCount === 0) return "unavailable" as const;
  if (availableCount === issues.length) return "complete" as const;
  return "partial" as const;
}

async function githubFetch<T>(url: string, token?: string, revalidate = 60) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    next: { revalidate },
  });

  if (!response.ok) {
    const body = await response.text();
    const retryAfterSeconds = computeRetryAfterSeconds(response.headers);

    if (
      (response.status === 403 || response.status === 429) &&
      isRateLimitResponse(body)
    ) {
      throw new RateLimitError(
        "GitHub API rate limit exceeded. Please wait a few minutes and try again.",
        retryAfterSeconds,
      );
    }

    throw new Error(`GitHub API error ${response.status}: ${body}`);
  }

  return {
    data: (await response.json()) as T,
    rateLimitRemaining: response.headers.get("x-ratelimit-remaining"),
  };
}

function isRateLimitResponse(body: string): boolean {
  const lower = body.toLowerCase();
  return (
    lower.includes("rate limit") ||
    lower.includes("rate_limit") ||
    lower.includes("api rate limit exceeded") ||
    lower.includes("secondary rate limit")
  );
}

// GitHub's primary rate-limit responses commonly omit `retry-after` and
// instead provide `x-ratelimit-reset`, a Unix timestamp (seconds) for when
// the limit resets. Fall back to computing the delay from that header so we
// don't under-report the wait time with a default cooldown.
function computeRetryAfterSeconds(headers: Headers): number | null {
  const retryAfter = headers.get("retry-after");
  if (retryAfter) {
    const parsed = Number.parseInt(retryAfter, 10);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }

  const resetHeader = headers.get("x-ratelimit-reset");
  if (resetHeader) {
    const resetEpochSeconds = Number.parseInt(resetHeader, 10);
    if (!Number.isNaN(resetEpochSeconds)) {
      const nowEpochSeconds = Math.floor(Date.now() / 1000);
      return Math.max(0, resetEpochSeconds - nowEpochSeconds);
    }
  }

  return null;
}

async function buildSearchScope(tech: string, token?: string) {
  const repoTopicQuery = buildRepoTopicQuery(tech);
  const queryParts = ["is:issue", "is:open", "archived:false"];

  if (!repoTopicQuery) {
    queryParts.push(buildTechQualifier(tech));
    return { repoTopicQuery, matchingRepos: [], queryParts };
  }

  const repoSearchUrl = new URL("https://api.github.com/search/repositories");
  repoSearchUrl.searchParams.set("q", repoTopicQuery);
  repoSearchUrl.searchParams.set("sort", "updated");
  repoSearchUrl.searchParams.set("order", "desc");
  repoSearchUrl.searchParams.set("per_page", String(REPO_SEARCH_PAGE_SIZE));
  repoSearchUrl.searchParams.set("page", "1");
  const repoSearchResult = await githubFetch<GitHubRepoSearchResponse>(
    repoSearchUrl.toString(),
    token,
    7200,
  );

  return {
    repoTopicQuery,
    matchingRepos: repoSearchResult.data.items,
    queryParts,
  };
}

function appendQualifier(queryParts: string[], qualifier: string | null) {
  if (qualifier) queryParts.push(qualifier);
}

function getSearchTotalCount(
  searchResults: Array<{ data: GitHubSearchResponse }>,
  searchesRepositories: boolean,
) {
  if (searchesRepositories) {
    return searchResults.reduce(
      (count, result) => count + result.data.total_count,
      0,
    );
  }
  return searchResults[0]?.data.total_count ?? 0;
}

export async function getRepositoryResponsiveness(
  fullName: string,
  token = process.env.GITHUB_TOKEN,
) {
  if (!token) {
    return unknownRepositoryResponsiveness(
      "GitHub token required for responsiveness analysis",
    );
  }

  const [owner, name] = fullName.split("/");
  if (!owner || !name) return unknownRepositoryResponsiveness();

  const sinceDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  sinceDate.setUTCHours(Math.floor(sinceDate.getUTCHours() / 6) * 6, 0, 0, 0);
  const since = sinceDate.toISOString();
  const response = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify({
      query: RESPONSIVENESS_QUERY,
      variables: { owner, name, since },
    }),
    next: { revalidate: 21600 },
  });

  if (!response.ok) {
    const body = await response.text();
    const retryAfterSeconds = computeRetryAfterSeconds(response.headers);

    if (
      (response.status === 403 || response.status === 429) &&
      isRateLimitResponse(body)
    ) {
      throw new RateLimitError(
        "GitHub API rate limit exceeded. Please wait a few minutes and try again.",
        retryAfterSeconds,
      );
    }

    throw new Error(`GitHub GraphQL error ${response.status}`);
  }
  const payload = (await response.json()) as GitHubResponsivenessResponse;
  const repository = payload.data?.repository;

  if (!repository || payload.errors?.length) {
    throw new Error(
      payload.errors?.[0]?.message ?? "Repository analytics unavailable",
    );
  }

  return scoreRepositoryResponsiveness(
    repository.issues.nodes,
    repository.pullRequests.nodes,
  );
}

async function getCommunityProfile(fullName: string, token?: string) {
  const result = await githubFetch<GitHubCommunityProfileResponse>(
    `https://api.github.com/repos/${fullName}/community/profile`,
    token,
    21600,
  );
  const files = result.data.files ?? {};

  return {
    healthPercentage: result.data.health_percentage,
    documentation: {
      readme: files.readme?.html_url ?? null,
      contributing: files.contributing?.html_url ?? null,
      license: files.license?.html_url ?? null,
      codeOfConduct: files.code_of_conduct?.html_url ?? null,
      issueTemplate: files.issue_template?.html_url ?? null,
      pullRequestTemplate: files.pull_request_template?.html_url ?? null,
    },
  };
}

export async function searchGitHubRepositories(
  query: string,
): Promise<RepositorySuggestion[]> {
  const url = new URL("https://api.github.com/search/repositories");
  url.searchParams.set(
    "q",
    `${query.trim()} in:name,description archived:false`,
  );
  url.searchParams.set("sort", "stars");
  url.searchParams.set("order", "desc");
  url.searchParams.set("per_page", "8");
  const result = await githubFetch<GitHubRepoSearchResponse>(
    url.toString(),
    process.env.GITHUB_TOKEN,
    300,
  );

  return result.data.items.map((repository) => ({
    fullName: repository.full_name,
    url: repository.html_url,
    description: repository.description ?? null,
    stars: repository.stargazers_count,
  }));
}

export async function getRecentRepositoryIssues(
  repositoryFullName: string,
): Promise<RepositoryDigestIssue[]> {
  const url = new URL("https://api.github.com/search/issues");
  url.searchParams.set("q", `repo:${repositoryFullName} is:issue is:open`);
  url.searchParams.set("sort", "created");
  url.searchParams.set("order", "desc");
  url.searchParams.set("per_page", "5");
  const [result, repository] = await Promise.all([
    githubFetch<GitHubSearchResponse>(
      url.toString(),
      process.env.GITHUB_TOKEN,
      180,
    ),
    githubFetch<GitHubRepo>(
      `https://api.github.com/repos/${repositoryFullName}`,
      process.env.GITHUB_TOKEN,
      7200,
    )
      .then((response) => response.data)
      .catch(() => undefined),
  ]);
  const repositoryHealth = scoreRepositoryHealth(repository);

  return result.data.items.slice(0, 5).map((issue) => ({
    id: issue.html_url,
    title: issue.title,
    url: issue.html_url,
    summary: (issue.body ?? "No description provided.")
      .replaceAll(/\s+/g, " ")
      .trim()
      .slice(0, 240),
    labels: issue.labels.map((label) => label.name),
    createdAt: issue.created_at,
    comments: issue.comments,
    assigned: Boolean(issue.assignee || issue.assignees?.length),
    qualityScore:
      scoreIssue(
        issue,
        repository,
        undefined,
        Boolean(getHacktoberfestSource(issue, repository)),
      ) + Math.round((repositoryHealth.score ?? 0) / 10),
    repositoryHealth,
  }));
}

export async function searchGitHubIssues({
  tech,
  label: rawLabel,
  sort: rawSort,
  linkedPr: rawLinkedPr,
  hacktoberfest: rawHacktoberfest,
  experience: rawExperience,
  contributionType: rawContributionType,
  scope: rawScope,
  responsiveness: rawResponsiveness,
  readiness: rawReadiness,
  updatedAfter,
  updatedBefore,
  page = 1,
}: {
  tech: string;
  label: string | null;
  sort: string | null;
  linkedPr: string | null;
  hacktoberfest?: string | null;
  experience?: string | null;
  contributionType?: string | null;
  scope?: string | null;
  responsiveness?: string | null;
  readiness?: string | null;
  updatedAfter?: string;
  updatedBefore?: string;
  page?: number;
}): Promise<SearchResponse> {
  const label = GITHUB_LABELS[normalize(rawLabel)] ?? "help wanted";
  const sort = resolveSearchOption(rawSort, GITHUB_SORTS, "updated");
  const githubSort = sort === "trending" ? "updated" : sort;
  const linkedPr = resolveSearchOption(rawLinkedPr, LINKED_PR_FILTERS, "any");
  const hacktoberfest = resolveSearchOption(
    rawHacktoberfest,
    HACKTOBERFEST_FILTERS,
    "any",
  );
  const experience = resolveSearchOption(
    rawExperience,
    EXPERIENCE_FILTERS,
    "any",
  );
  const contributionType = resolveSearchOption(
    rawContributionType,
    CONTRIBUTION_TYPE_FILTERS,
    "any",
  );
  const scope = resolveSearchOption(rawScope, SCOPE_FILTERS, "any");
  const responsiveness = resolveSearchOption(
    rawResponsiveness,
    RESPONSIVENESS_FILTERS,
    "any",
  );
  const readiness = resolveSearchOption(rawReadiness, READINESS_FILTERS, "any");
  const token = process.env.GITHUB_TOKEN;
  const { repoTopicQuery, matchingRepos, queryParts } = await buildSearchScope(
    tech,
    token,
  );
  const linkedPrQualifier = buildLinkedPrQualifier(
    readiness === "ready" ? "no" : linkedPr,
  );

  queryParts.push(`label:${quoteSearchValue(label)}`);

  const trendingUpdatedAfter = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const updatedQualifier = buildUpdatedQualifier(
    updatedAfter ?? (sort === "trending" ? trendingUpdatedAfter : undefined),
    updatedBefore,
  );

  appendQualifier(queryParts, updatedQualifier);
  appendQualifier(queryParts, linkedPrQualifier);

  const displayQuery = repoTopicQuery
    ? [
        repoTopicQuery,
        `label:${quoteSearchValue(label)}`,
        updatedQualifier,
        linkedPrQualifier,
      ]
        .filter(Boolean)
        .join(" ")
    : queryParts.join(" ");

  const repoBatches =
    repoTopicQuery && matchingRepos.length > 0
      ? Array.from(
          { length: Math.ceil(matchingRepos.length / REPO_ISSUE_BATCH_SIZE) },
          (_, index) =>
            matchingRepos.slice(
              index * REPO_ISSUE_BATCH_SIZE,
              (index + 1) * REPO_ISSUE_BATCH_SIZE,
            ),
        )
      : [];

  if (repoTopicQuery && repoBatches.length === 0) {
    return {
      query: displayQuery,
      totalCount: 0,
      candidateCount: 0,
      rateLimitRemaining: null,
      tokenConfigured: Boolean(token),
      issues: [],
      page,
      enrichment: {
        repositoryMetadata: "complete",
        discussionAnalysis: "complete",
        linkedPullRequests: "complete",
        ...(rawReadiness !== undefined
          ? { communityProfile: "complete" as const }
          : {}),
      },
    };
  }

  const issueQueries =
    repoBatches.length > 0
      ? repoBatches
          .slice(0, CANDIDATE_PAGE_COUNT)
          .map((repoBatch) =>
            [
              ...queryParts,
              buildRepoScopeQualifier(repoBatch.map((repo) => repo.full_name)),
            ].join(" "),
          )
      : [queryParts.join(" ")];

  const searchUrls = issueQueries.flatMap((issueQuery) => {
    const pageNumbers =
      repoBatches.length > 0
        ? [1]
        : Array.from({ length: CANDIDATE_PAGE_COUNT }, (_, index) => index + 1);

    return pageNumbers.map((pageNumber) => {
      const url = new URL("https://api.github.com/search/issues");
      url.searchParams.set("q", issueQuery);
      url.searchParams.set("sort", githubSort);
      url.searchParams.set("order", "desc");
      url.searchParams.set("per_page", String(PAGE_SIZE));
      url.searchParams.set("page", String(pageNumber));
      return url.toString();
    });
  });
  const searchResults = await Promise.all(
    searchUrls.map((url) => githubFetch<GitHubSearchResponse>(url, token, 180)),
  );
  const totalCount = getSearchTotalCount(searchResults, repoBatches.length > 0);
  const rateLimitRemaining = searchResults.at(-1)?.rateLimitRemaining ?? null;
  const candidateIssues = dedupeIssues(
    searchResults.flatMap((result) => result.data.items),
  );
  const repoEntriesFromSearch = matchingRepos.map(
    (repo) => [repo.full_name, repo] as const,
  );
  const repoEntriesFromSearchMap = new Map(repoEntriesFromSearch);
  const shouldFetchRepos = Boolean(token) || hacktoberfest === "only";
  const repoNames = shouldFetchRepos
    ? Array.from(
        new Set(
          candidateIssues.map((item) => getRepoFullName(item.repository_url)),
        ),
      ).filter((fullName) => !repoEntriesFromSearchMap.has(fullName))
    : [];

  const fetchedRepoEntries = await Promise.all(
    repoNames.map(async (fullName) => {
      try {
        const repo = await githubFetch<GitHubRepo>(
          `https://api.github.com/repos/${fullName}`,
          token,
          7200, // Cache repository details for 2 hours
        );
        return [fullName, repo.data] as const;
      } catch {
        return [fullName, undefined] as const;
      }
    }),
  );
  const repoEntries = [...repoEntriesFromSearch, ...fetchedRepoEntries];
  const responsivenessRepoNames = Array.from(
    new Set(
      candidateIssues.map((issue) => getRepoFullName(issue.repository_url)),
    ),
  ).slice(0, RESPONSIVENESS_REPOSITORY_LIMIT);
  const responsivenessEntries = await Promise.all(
    responsivenessRepoNames.map(async (fullName) => {
      try {
        return [
          fullName,
          await getRepositoryResponsiveness(fullName, token),
        ] as const;
      } catch {
        return [fullName, unknownRepositoryResponsiveness()] as const;
      }
    }),
  );
  const communityProfileRepoNames =
    rawReadiness === undefined
      ? []
      : Array.from(
          new Set(
            candidateIssues.map((issue) =>
              getRepoFullName(issue.repository_url),
            ),
          ),
        ).slice(0, COMMUNITY_PROFILE_REPOSITORY_LIMIT);
  const communityProfileEntries = await Promise.all(
    communityProfileRepoNames.map(async (fullName) => {
      try {
        return [fullName, await getCommunityProfile(fullName, token)] as const;
      } catch {
        return [fullName, undefined] as const;
      }
    }),
  );

  const commentEntries = await Promise.all(
    candidateIssues.map(async (issue) => {
      if (issue.comments === 0) {
        return [
          issue.html_url,
          { comments: [] as Array<{ body: string }>, available: true },
        ] as const;
      }

      if (!token) {
        return [
          issue.html_url,
          { comments: [] as Array<{ body: string }>, available: false },
        ] as const;
      }

      const repoName = getRepoFullName(issue.repository_url);
      try {
        const commentsResult = await githubFetch<Array<{ body: string }>>(
          `https://api.github.com/repos/${repoName}/issues/${issue.number}/comments?per_page=10`,
          token,
          7200, // Cache comment details for 2 hours
        );
        return [
          issue.html_url,
          { comments: commentsResult.data, available: true },
        ] as const;
      } catch {
        return [
          issue.html_url,
          { comments: [] as Array<{ body: string }>, available: false },
        ] as const;
      }
    }),
  );

  async function fetchLinkedPrCount(issue: GitHubIssue) {
    if (!token) {
      return [issue.html_url, { count: null, available: false }] as const;
    }

    const repoName = getRepoFullName(issue.repository_url);

    try {
      const timelineResult = await githubFetch<GitHubTimelineEvent[]>(
        `https://api.github.com/repos/${repoName}/issues/${issue.number}/timeline?per_page=100`,
        token,
        7200,
      );
      return [
        issue.html_url,
        {
          count: countLinkedPullRequests(timelineResult.data),
          available: true,
        },
      ] as const;
    } catch {
      return [issue.html_url, { count: null, available: false }] as const;
    }
  }

  const issueCommentsMap = new Map<
    string,
    { comments: Array<{ body: string }>; available: boolean }
  >(commentEntries);
  const repos = new Map(repoEntries);
  const repositoryResponsiveness = new Map(responsivenessEntries);
  const communityProfiles = new Map(communityProfileEntries);
  const rankedIssues = rankIssues(
    candidateIssues
      .map((issue): Issue => {
        const repoName = getRepoFullName(issue.repository_url);
        const repo = repos.get(repoName);
        const discussion = issueCommentsMap.get(issue.html_url) ?? {
          comments: [],
          available: false,
        };
        const assigned = Boolean(issue.assignee || issue.assignees?.length);

        let helpStatus: IssueStatus = analyzeThreadIntent(discussion.comments);
        if (assigned) {
          helpStatus = "claimed";
        }
        const hacktoberfestSource = getHacktoberfestSource(issue, repo);
        const repositoryHealth = scoreRepositoryHealth(repo);
        const responsivenessSummary =
          repositoryResponsiveness.get(repoName) ??
          unknownRepositoryResponsiveness(
            "Repository outside bounded analytics sample",
          );
        const classification = classifyIssue(issue);
        const contributionReadiness = communityProfiles.has(repoName)
          ? scoreContributionReadiness({
              profile: communityProfiles.get(repoName),
              repositoryHealth,
              responsiveness: responsivenessSummary,
              assigned,
              helpStatus,
            })
          : unknownContributionReadiness(
              "Repository outside bounded community-profile sample",
            );

        return {
          id: issue.html_url,
          title: issue.title,
          url: issue.html_url,
          repo: repo?.full_name ?? repoName,
          repoUrl: repo?.html_url ?? `https://github.com/${repoName}`,
          stars: repo?.stargazers_count ?? null,
          comments: issue.comments,
          labels: issue.labels.map((item) => item.name),
          updatedAt: issue.updated_at,
          createdAt: issue.created_at,
          assigned,
          linkedPrCount: null,
          hacktoberfest: Boolean(hacktoberfestSource),
          hacktoberfestSource,
          helpStatus,
          classification,
          ...(rawReadiness !== undefined ? { contributionReadiness } : {}),
          qualityScore:
            scoreIssue(issue, repo, helpStatus, Boolean(hacktoberfestSource)) +
            Math.round((repositoryHealth.score ?? 0) / 10) +
            getResponsivenessBoost(responsivenessSummary.status),
          ...(sort === "trending"
            ? { trendingScore: scoreTrendingIssue(issue, repo) }
            : {}),
          repositoryHealth,
          repositoryResponsiveness: responsivenessSummary,
          enrichment: {
            repositoryMetadata: Boolean(repo),
            discussionAnalysis: discussion.available,
            linkedPullRequests: false,
            ...(rawReadiness !== undefined
              ? {
                  communityProfile:
                    communityProfiles.get(repoName) !== undefined,
                }
              : {}),
          },
        };
      })
      .filter((issue) =>
        matchesSearchFilters(issue, {
          hacktoberfest,
          responsiveness,
          readiness,
          experience,
          contributionType,
          scope,
        }),
      ),
    sort,
  );
  const start = (page - 1) * PAGE_SIZE;
  const selectedIssues = rankedIssues.slice(start, start + PAGE_SIZE);
  const selectedIssueMap = new Map(
    candidateIssues.map((issue) => [issue.html_url, issue]),
  );
  const linkedPrEntries = await Promise.all(
    selectedIssues
      .map((issue) => selectedIssueMap.get(issue.id))
      .filter((issue): issue is GitHubIssue => Boolean(issue))
      .map(fetchLinkedPrCount),
  );
  const linkedPrCountMap = new Map<
    string,
    { count: number | null; available: boolean }
  >(linkedPrEntries);
  const issues = selectedIssues.map((issue) => {
    const linkedPullRequests = linkedPrCountMap.get(issue.id) ?? {
      count: null,
      available: false,
    };

    return {
      ...issue,
      linkedPrCount: linkedPullRequests.count,
      ...(issue.contributionReadiness
        ? {
            contributionReadiness: includeLinkedPullRequestSignal(
              issue.contributionReadiness,
              linkedPullRequests.count,
            ),
          }
        : {}),
      enrichment: {
        repositoryMetadata: issue.enrichment?.repositoryMetadata ?? false,
        discussionAnalysis: issue.enrichment?.discussionAnalysis ?? false,
        linkedPullRequests: linkedPullRequests.available,
        ...(rawReadiness !== undefined
          ? { communityProfile: issue.enrichment?.communityProfile ?? false }
          : {}),
      },
    };
  });

  return {
    query: displayQuery,
    totalCount,
    candidateCount: rankedIssues.length,
    rateLimitRemaining,
    tokenConfigured: Boolean(token),
    issues,
    page,
    enrichment: {
      repositoryMetadata: summarizeEnrichment(issues, "repositoryMetadata"),
      discussionAnalysis: summarizeEnrichment(issues, "discussionAnalysis"),
      linkedPullRequests: summarizeEnrichment(issues, "linkedPullRequests"),
      ...(rawReadiness !== undefined
        ? { communityProfile: summarizeEnrichment(issues, "communityProfile") }
        : {}),
    },
  };
}
