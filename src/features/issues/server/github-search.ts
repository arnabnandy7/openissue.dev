import {
  GITHUB_LABELS,
  GITHUB_SORTS,
  HACKTOBERFEST_FILTERS,
  LINKED_PR_FILTERS,
  LANGUAGE_ALIASES,
  TOPIC_ALIASES,
} from "@/features/issues/data/search-options";
import { rankIssues } from "@/features/issues/lib/ranking";
import type {
  GitHubIssue,
  GitHubRepo,
  GitHubRepoSearchResponse,
  GitHubSearchResponse,
  GitHubTimelineEvent,
  Issue,
  IssueStatus,
  SearchResponse,
} from "@/features/issues/types/search";

const PAGE_SIZE = 24;
const CANDIDATE_PAGE_COUNT = 5;
const REPO_SEARCH_PAGE_SIZE = 20;
const REPO_ISSUE_BATCH_SIZE = 10;

function normalize(value: string | null) {
  return (value ?? "").trim().toLowerCase();
}

function quoteSearchValue(value: string) {
  return /[\s#+.]/.test(value) ? `"${value.replaceAll('"', '\\"')}"` : value;
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
  const queryParts = [
    `topic:${quoteSearchValue(topic)}`,
    "archived:false",
  ];

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

function getRepoFullName(repositoryUrl: string) {
  const apiPrefix = "https://api.github.com/repos/";

  return repositoryUrl.startsWith(apiPrefix)
    ? repositoryUrl.slice(apiPrefix.length)
    : repositoryUrl.split("/repos/").at(-1) ?? repositoryUrl;
}

function analyzeThreadIntent(comments: Array<{ body: string }>): IssueStatus {
  if (comments.length === 0) {
    return "open";
  }

  const text = comments.map((c) => (c.body || "").toLowerCase()).join(" ");

  const resolvedIndicators = [
    "fixed in", "fixed by", "resolved", "closed by", "merged", 
    "close this", "closing this", "already fixed", "already solved"
  ];
  
  const claimedIndicators = [
    "i'm on it", "i'm working on", "i am working on", "taking this up", 
    "i will take this", "i will work on", "pr in progress", 
    "assigned to", "working on it", "submitting a pr", "submitting a pull request"
  ];

  const resolvedMatch = resolvedIndicators.some(indicator => text.includes(indicator));
  if (resolvedMatch) {
    return "resolved";
  }

  const claimedMatch = claimedIndicators.some(indicator => text.includes(indicator));
  if (claimedMatch) {
    return "claimed";
  }

  return "open";
}

function countLinkedPullRequests(events: GitHubTimelineEvent[]) {
  const linkedPullRequests = new Set<string>();

  for (const event of events) {
    const issue = event.source?.issue;

    if (event.event === "cross-referenced" && issue?.pull_request && issue.html_url) {
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
  const starScore = Math.min(25, Math.log10((repo?.stargazers_count ?? 0) + 1) * 8);
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

function dedupeIssues(issues: GitHubIssue[]) {
  const issueMap = new Map<string, GitHubIssue>();

  for (const issue of issues) {
    issueMap.set(issue.html_url, issue);
  }

  return Array.from(issueMap.values());
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
    throw new Error(`GitHub API error ${response.status}: ${body}`);
  }

  return {
    data: (await response.json()) as T,
    rateLimitRemaining: response.headers.get("x-ratelimit-remaining"),
  };
}

export async function searchGitHubIssues({
  tech,
  label: rawLabel,
  sort: rawSort,
  linkedPr: rawLinkedPr,
  hacktoberfest: rawHacktoberfest,
  page = 1,
}: {
  tech: string;
  label: string | null;
  sort: string | null;
  linkedPr: string | null;
  hacktoberfest?: string | null;
  page?: number;
}): Promise<SearchResponse> {
  const label = GITHUB_LABELS[normalize(rawLabel)] ?? "help wanted";
  const sort = GITHUB_SORTS.has(rawSort ?? "") ? rawSort! : "updated";
  const linkedPr = LINKED_PR_FILTERS.has(rawLinkedPr ?? "") ? rawLinkedPr! : "any";
  const hacktoberfest = HACKTOBERFEST_FILTERS.has(rawHacktoberfest ?? "")
    ? rawHacktoberfest!
    : "any";
  const token = process.env.GITHUB_TOKEN;
  const repoTopicQuery = buildRepoTopicQuery(tech);
  let matchingRepos: GitHubRepo[] = [];
  const queryParts = [
    "is:issue",
    "is:open",
    "archived:false",
  ];
  const linkedPrQualifier = buildLinkedPrQualifier(linkedPr);

  if (repoTopicQuery) {
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
    matchingRepos = repoSearchResult.data.items;
  } else {
    queryParts.push(buildTechQualifier(tech));
  }

  queryParts.push(`label:${quoteSearchValue(label)}`);

  if (linkedPrQualifier) {
    queryParts.push(linkedPrQualifier);
  }

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
      query: repoTopicQuery,
      totalCount: 0,
      candidateCount: 0,
      rateLimitRemaining: null,
      tokenConfigured: Boolean(token),
      issues: [],
      page,
    };
  }

  const issueQueries =
    repoBatches.length > 0
      ? repoBatches.slice(0, CANDIDATE_PAGE_COUNT).map((repoBatch) =>
          [
            ...queryParts,
            buildRepoScopeQualifier(repoBatch.map((repo) => repo.full_name)),
          ].join(" "),
        )
      : [queryParts.join(" ")];
  const query = issueQueries.join(" | ");

  const searchUrls = issueQueries.flatMap((issueQuery) => {
    const pageNumbers =
      repoBatches.length > 0
        ? [1]
        : Array.from({ length: CANDIDATE_PAGE_COUNT }, (_, index) => index + 1);

    return pageNumbers.map((pageNumber) => {
      const url = new URL("https://api.github.com/search/issues");
      url.searchParams.set("q", issueQuery);
      url.searchParams.set("sort", sort);
      url.searchParams.set("order", "desc");
      url.searchParams.set("per_page", String(PAGE_SIZE));
      url.searchParams.set("page", String(pageNumber));
      return url.toString();
    });
  });
  const searchResults = await Promise.all(
    searchUrls.map((url) => githubFetch<GitHubSearchResponse>(url, token, 180)),
  );
  const totalCount = searchResults[0]?.data.total_count ?? 0;
  const rateLimitRemaining = searchResults.at(-1)?.rateLimitRemaining ?? null;
  const candidateIssues = dedupeIssues(searchResults.flatMap((result) => result.data.items));
  const repoEntriesFromSearch = matchingRepos.map((repo) => [repo.full_name, repo] as const);
  const repoEntriesFromSearchMap = new Map(repoEntriesFromSearch);
  const shouldFetchRepos = Boolean(token) || hacktoberfest === "only";
  const repoNames = shouldFetchRepos
    ? Array.from(
        new Set(candidateIssues.map((item) => getRepoFullName(item.repository_url))),
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

  const commentEntries = await Promise.all(
    candidateIssues.map(async (issue) => {
      if (issue.comments === 0 || !token) {
        return [issue.html_url, [] as Array<{ body: string }>] as const;
      }

      const repoName = getRepoFullName(issue.repository_url);
      try {
        const commentsResult = await githubFetch<Array<{ body: string }>>(
          `https://api.github.com/repos/${repoName}/issues/${issue.number}/comments?per_page=10`,
          token,
          7200, // Cache comment details for 2 hours
        );
        return [issue.html_url, commentsResult.data] as const;
      } catch {
        return [issue.html_url, [] as Array<{ body: string }>] as const;
      }
    }),
  );

  async function fetchLinkedPrCount(issue: GitHubIssue) {
    if (!token) {
      return [issue.html_url, null] as const;
    }

    const repoName = getRepoFullName(issue.repository_url);

    try {
      const timelineResult = await githubFetch<GitHubTimelineEvent[]>(
        `https://api.github.com/repos/${repoName}/issues/${issue.number}/timeline?per_page=100`,
        token,
        7200,
      );
      return [issue.html_url, countLinkedPullRequests(timelineResult.data)] as const;
    } catch {
      return [issue.html_url, null] as const;
    }
  }

  const issueCommentsMap = new Map(commentEntries);
  const repos = new Map(repoEntries);
  const rankedIssues = rankIssues(
    candidateIssues.map((issue): Issue => {
      const repoName = getRepoFullName(issue.repository_url);
      const repo = repos.get(repoName);
      const comments = issueCommentsMap.get(issue.html_url) ?? [];
      const assigned = Boolean(issue.assignee || issue.assignees?.length);
      
      let helpStatus: IssueStatus = analyzeThreadIntent(comments);
      if (assigned) {
        helpStatus = "claimed";
      }
      const hacktoberfestSource = getHacktoberfestSource(issue, repo);

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
        qualityScore: scoreIssue(issue, repo, helpStatus, Boolean(hacktoberfestSource)),
      };
    }).filter((issue) => hacktoberfest !== "only" || issue.hacktoberfest),
  );
  const start = (page - 1) * PAGE_SIZE;
  const selectedIssues = rankedIssues.slice(start, start + PAGE_SIZE);
  const selectedIssueMap = new Map(candidateIssues.map((issue) => [issue.html_url, issue]));
  const linkedPrEntries = await Promise.all(
    selectedIssues
      .map((issue) => selectedIssueMap.get(issue.id))
      .filter((issue): issue is GitHubIssue => Boolean(issue))
      .map(fetchLinkedPrCount),
  );
  const linkedPrCountMap = new Map(linkedPrEntries);
  const issues = selectedIssues.map((issue) => ({
    ...issue,
    linkedPrCount: linkedPrCountMap.get(issue.id) ?? null,
  }));

  return {
    query,
    totalCount,
    candidateCount: rankedIssues.length,
    rateLimitRemaining,
    tokenConfigured: Boolean(token),
    issues,
    page,
  };
}
