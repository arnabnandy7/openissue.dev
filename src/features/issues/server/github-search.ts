import {
  GITHUB_LABELS,
  GITHUB_SORTS,
  LINKED_PR_FILTERS,
  LANGUAGE_ALIASES,
} from "@/features/issues/data/search-options";
import type {
  GitHubIssue,
  GitHubRepo,
  GitHubSearchResponse,
  GitHubTimelineEvent,
  IssueStatus,
  SearchResponse,
} from "@/features/issues/types/search";

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

function scoreIssue(issue: GitHubIssue, repo?: GitHubRepo, helpStatus?: IssueStatus) {
  const ageDays =
    (Date.now() - new Date(issue.updated_at).getTime()) / (1000 * 60 * 60 * 24);
  const recencyScore = Math.max(0, 35 - ageDays * 1.5);
  const starScore = Math.min(25, Math.log10((repo?.stargazers_count ?? 0) + 1) * 8);
  const labelScore = Math.min(20, issue.labels.length * 4);
  const commentScore = Math.max(0, 15 - issue.comments * 1.5);
  const assignmentScore = issue.assignee || issue.assignees?.length ? 0 : 5;

  let score = Math.round(recencyScore + starScore + labelScore + commentScore + assignmentScore);

  if (helpStatus === "claimed") {
    score = Math.max(0, score - 25);
  } else if (helpStatus === "resolved") {
    score = Math.max(0, score - 45);
  }

  return score;
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
  page = 1,
}: {
  tech: string;
  label: string | null;
  sort: string | null;
  linkedPr: string | null;
  page?: number;
}): Promise<SearchResponse> {
  const label = GITHUB_LABELS[normalize(rawLabel)] ?? "help wanted";
  const sort = GITHUB_SORTS.has(rawSort ?? "") ? rawSort! : "updated";
  const linkedPr = LINKED_PR_FILTERS.has(rawLinkedPr ?? "") ? rawLinkedPr! : "any";
  const queryParts = [
    "is:issue",
    "is:open",
    "archived:false",
    buildTechQualifier(tech),
    `label:${quoteSearchValue(label)}`,
  ];
  const linkedPrQualifier = buildLinkedPrQualifier(linkedPr);

  if (linkedPrQualifier) {
    queryParts.push(linkedPrQualifier);
  }

  const query = queryParts.join(" ");

  const token = process.env.GITHUB_TOKEN;
  const url = new URL("https://api.github.com/search/issues");
  url.searchParams.set("q", query);
  url.searchParams.set("sort", sort);
  url.searchParams.set("order", "desc");
  url.searchParams.set("per_page", "24");
  url.searchParams.set("page", String(page));

  const search = await githubFetch<GitHubSearchResponse>(url.toString(), token, 180);
  const repoNames = token
    ? Array.from(
        new Set(search.data.items.map((item) => getRepoFullName(item.repository_url))),
      )
    : [];

  const repoEntries = await Promise.all(
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

  const commentEntries = await Promise.all(
    search.data.items.map(async (issue) => {
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
    })
  );

  const linkedPrEntries = await Promise.all(
    search.data.items.map(async (issue) => {
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
    }),
  );

  const issueCommentsMap = new Map(commentEntries);
  const linkedPrCountMap = new Map(linkedPrEntries);
  const repos = new Map(repoEntries);
  const issues = search.data.items
    .map((issue) => {
      const repoName = getRepoFullName(issue.repository_url);
      const repo = repos.get(repoName);
      const comments = issueCommentsMap.get(issue.html_url) ?? [];
      const assigned = Boolean(issue.assignee || issue.assignees?.length);
      
      let helpStatus: IssueStatus = analyzeThreadIntent(comments);
      if (assigned) {
        helpStatus = "claimed";
      }

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
        linkedPrCount: linkedPrCountMap.get(issue.html_url) ?? null,
        helpStatus,
        qualityScore: scoreIssue(issue, repo, helpStatus),
      };
    })
    .sort((a, b) => b.qualityScore - a.qualityScore);

  return {
    query,
    totalCount: search.data.total_count,
    rateLimitRemaining: search.rateLimitRemaining,
    tokenConfigured: Boolean(token),
    issues,
    page,
  };
}
