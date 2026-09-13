import {
  LANGUAGE_ALIASES,
  TOPIC_ALIASES,
} from "@/features/issues/data/search-options";
import { githubFetch } from "@/lib/github";
import linguistLanguages from "../data/languages.json";
import type { GitHubRepo } from "@/features/issues/types/search";
import type {
  PullRequest,
  PullRequestFilters,
  PullRequestSearchResponse,
} from "../types";

const PAGE_SIZE = 24;
// GitHub Linguist names/aliases, bundled to avoid a runtime catalog request.
const LANGUAGES = new Map([
  ...Object.entries(linguistLanguages),
  ...Object.entries(LANGUAGE_ALIASES),
]);
type SearchItem = {
  node_id: string;
  number: number;
  title: string;
  html_url: string;
  repository_url: string;
  user: { login: string } | null;
  assignees?: Array<{ login: string }>;
  state: "open" | "closed";
  draft?: boolean;
  pull_request: { merged_at?: string | null };
  labels: Array<{ name: string }>;
  comments: number;
  created_at: string;
  updated_at: string;
};
type SearchResult = {
  total_count: number;
  incomplete_results?: boolean;
  items: SearchItem[];
};
type PublicRepo = GitHubRepo & { private: boolean; language?: string };

function pullRequestStatus(item: SearchItem): PullRequest["status"] {
  if (item.pull_request.merged_at) return "merged";
  if (item.state === "closed") return "closed";
  return item.draft ? "draft" : "open";
}

function mapPullRequest(item: SearchItem): PullRequest {
  return {
    id: item.node_id,
    number: item.number,
    title: item.title,
    url: item.html_url,
    repository: item.repository_url.split("/repos/")[1],
    author: item.user?.login ?? "ghost",
    assignees: (item.assignees ?? []).map((user) => user.login),
    status: pullRequestStatus(item),
    labels: item.labels.map((label) => label.name),
    comments: item.comments,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
  };
}

async function searchPage(
  query: string,
  sort: string,
  page: number,
  size: number,
) {
  const url = new URL("https://api.github.com/search/issues");
  url.search = new URLSearchParams({
    q: query,
    sort,
    order: "desc",
    page: String(page),
    per_page: String(size),
  }).toString();
  return (
    await githubFetch<SearchResult>(url.toString(), process.env.GITHUB_TOKEN)
  ).data;
}

const STATUS_QUERY = {
  open: "is:open draft:false",
  draft: "is:open draft:true",
  merged: "is:merged",
  closed: "is:closed is:unmerged",
  all: "",
};

async function frameworkRepositories(
  filters: PullRequestFilters,
  topic: string,
) {
  if (filters.repository) {
    const { data } = await githubFetch<PublicRepo>(
      `https://api.github.com/repos/${filters.repository}`,
      process.env.GITHUB_TOKEN,
      7200,
    );
    const matches =
      !data.private && !data.archived && data.topics?.includes(topic);
    return {
      names: matches ? [data.full_name] : [],
      total: matches ? 1 : 0,
      incomplete: false,
    };
  }
  const url = new URL("https://api.github.com/search/repositories");
  url.search = new URLSearchParams({
    q: `org:${filters.org} topic:${topic} archived:false is:public`,
    sort: "updated",
    order: "desc",
    per_page: "20",
  }).toString();
  const { data } = await githubFetch<{
    items: PublicRepo[];
    total_count: number;
    incomplete_results?: boolean;
  }>(url.toString(), process.env.GITHUB_TOKEN, 7200);
  return {
    names: data.items
      .filter((repo) => !repo.private)
      .map((repo) => repo.full_name),
    total: data.total_count,
    incomplete: !!data.incomplete_results,
  };
}

function repositoryQueries(base: string, names: string[]) {
  const queries: string[] = [];
  let query = base;
  for (const name of names) {
    const qualifier = ` repo:${name}`;
    if ((query + qualifier).length > 256 && query !== base) {
      queries.push(query);
      query = base;
    }
    query += qualifier;
  }
  if (query !== base) queries.push(query);
  return queries;
}

async function buildPullRequestQueries(
  filters: PullRequestFilters,
) {
  const normalized = filters.tech.toLowerCase();
  const language = Object.hasOwn(TOPIC_ALIASES, normalized)
    ? undefined
    : LANGUAGES.get(normalized);
  const base =
    `is:pr is:public archived:false ${STATUS_QUERY[filters.status]}`.trim();
  const notices: string[] = [];
  let queries: string[];
  if (language) {
    const scope = filters.repository
      ? `repo:${filters.repository}`
      : `org:${filters.org}`;
    queries = [`${base} ${scope} language:"${language}"`];
  } else {
    const topic =
      TOPIC_ALIASES[normalized]?.topic ?? normalized.replaceAll(/\s+/g, "-");
    const repositories = await frameworkRepositories(filters, topic);
    queries = repositoryQueries(base, repositories.names);
    notices.push(
      `Technology matches repository topic “${topic}”, not individual changed files.`,
    );
    if (repositories.total > repositories.names.length)
      notices.push(
        `Searching the ${repositories.names.length} most recently updated matching repositories out of ${repositories.total}. Choose a repository to narrow the search.`,
      );
    if (repositories.incomplete)
      notices.push("GitHub returned incomplete repository discovery results.");
  }
  return { queries, notices };
}

export async function searchPullRequests(
  filters: PullRequestFilters,
): Promise<PullRequestSearchResponse> {
  const { queries, notices } = await buildPullRequestQueries(filters);
  // Each repository group contributes its sorted prefix before the global page is selected.
  // A single group can use GitHub pagination directly.
  const prefixSize = filters.page * PAGE_SIZE;
  const size = queries.length > 1 ? Math.min(100, prefixSize) : PAGE_SIZE;
  const pages = queries.length > 1 ? Math.ceil(prefixSize / size) : 1;
  const results: Array<{
    total: number;
    incomplete: boolean;
    items: SearchItem[];
  }> = [];
  // Bound GitHub search concurrency even for organizations with long repository names.
  for (let start = 0; start < queries.length; start += 3) {
    const batch = await Promise.all(
      queries.slice(start, start + 3).map(async (query) => {
        const responses: SearchResult[] = [];
        for (let index = 0; index < pages; index++) {
          const response = await searchPage(
            query,
            filters.sort,
            queries.length > 1 ? index + 1 : filters.page,
            size,
          );
          responses.push(response);
          if (response.items.length < size) break;
        }
        return {
          total: responses[0].total_count,
          incomplete: responses.some((response) => response.incomplete_results),
          items: responses.flatMap((response) => response.items),
        };
      }),
    );
    results.push(...batch);
  }
  const totalCount = results.reduce((sum, result) => sum + result.total, 0);
  const items = Array.from(
    new Map(
      results
        .flatMap((result) => result.items)
        .map((item) => [item.node_id, item]),
    ).values(),
  );
  items.sort((a, b) => {
    const difference = sortValue(b, filters.sort) - sortValue(a, filters.sort);
    return difference || a.html_url.localeCompare(b.html_url);
  });
  if (results.some((result) => result.incomplete))
    notices.push(
      "GitHub returned incomplete PR results. Retry or narrow your search.",
    );
  if (totalCount > 240)
    notices.push(
      "Showing up to 240 results. Narrow your search to explore more.",
    );
  const start = queries.length > 1 ? (filters.page - 1) * PAGE_SIZE : 0;
  return {
    pullRequests: items.slice(start, start + PAGE_SIZE).map(mapPullRequest),
    totalCount,
    page: filters.page,
    hasMore: filters.page < 10 && prefixSize < totalCount,
    query: queries.join(" OR "),
    notices,
    tokenConfigured: !!process.env.GITHUB_TOKEN,
  };
}

function sortValue(item: SearchItem, sort: PullRequestFilters["sort"]) {
  if (sort === "comments") return item.comments;
  return Date.parse(sort === "created" ? item.created_at : item.updated_at);
}
