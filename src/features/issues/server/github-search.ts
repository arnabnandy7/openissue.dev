import {
  GITHUB_LABELS,
  GITHUB_SORTS,
  LANGUAGE_ALIASES,
} from "@/features/issues/data/search-options";
import type {
  GitHubIssue,
  GitHubRepo,
  GitHubSearchResponse,
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

function getRepoFullName(repositoryUrl: string) {
  const apiPrefix = "https://api.github.com/repos/";

  return repositoryUrl.startsWith(apiPrefix)
    ? repositoryUrl.slice(apiPrefix.length)
    : repositoryUrl.split("/repos/").at(-1) ?? repositoryUrl;
}

function scoreIssue(issue: GitHubIssue, repo?: GitHubRepo) {
  const ageDays =
    (Date.now() - new Date(issue.updated_at).getTime()) / (1000 * 60 * 60 * 24);
  const recencyScore = Math.max(0, 35 - ageDays * 1.5);
  const starScore = Math.min(25, Math.log10((repo?.stargazers_count ?? 0) + 1) * 8);
  const labelScore = Math.min(20, issue.labels.length * 4);
  const commentScore = Math.max(0, 15 - issue.comments * 1.5);
  const assignmentScore = issue.assignee || issue.assignees?.length ? 0 : 5;

  return Math.round(recencyScore + starScore + labelScore + commentScore + assignmentScore);
}

async function githubFetch<T>(url: string, token?: string) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    next: { revalidate: 60 },
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
}: {
  tech: string;
  label: string | null;
  sort: string | null;
}): Promise<SearchResponse> {
  const label = GITHUB_LABELS[normalize(rawLabel)] ?? "help wanted";
  const sort = GITHUB_SORTS.has(rawSort ?? "") ? rawSort! : "updated";
  const query = [
    "is:issue",
    "is:open",
    "archived:false",
    buildTechQualifier(tech),
    `label:${quoteSearchValue(label)}`,
  ].join(" ");

  const token = process.env.GITHUB_TOKEN;
  const url = new URL("https://api.github.com/search/issues");
  url.searchParams.set("q", query);
  url.searchParams.set("sort", sort);
  url.searchParams.set("order", "desc");
  url.searchParams.set("per_page", "24");

  const search = await githubFetch<GitHubSearchResponse>(url.toString(), token);
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
        );
        return [fullName, repo.data] as const;
      } catch {
        return [fullName, undefined] as const;
      }
    }),
  );

  const repos = new Map(repoEntries);
  const issues = search.data.items
    .map((issue) => {
      const repoName = getRepoFullName(issue.repository_url);
      const repo = repos.get(repoName);

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
        assigned: Boolean(issue.assignee || issue.assignees?.length),
        qualityScore: scoreIssue(issue, repo),
      };
    })
    .sort((a, b) => b.qualityScore - a.qualityScore);

  return {
    query,
    totalCount: search.data.total_count,
    rateLimitRemaining: search.rateLimitRemaining,
    tokenConfigured: Boolean(token),
    issues,
  };
}
