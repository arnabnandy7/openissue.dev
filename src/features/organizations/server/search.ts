import {
  LANGUAGE_ALIASES,
  TOPIC_ALIASES,
} from "@/features/issues/data/search-options";
import { githubFetch } from "@/lib/github";
import linguistLanguages from "../data/languages.json";
import type {
  OrganizationIssue,
  OrganizationIssueFilters,
  OrganizationIssueSearchResponse,
} from "../types";

const PAGE_SIZE = 24;

const LANGUAGES = new Map<string, string>([
  ...Object.entries(linguistLanguages),
  ...Object.entries(LANGUAGE_ALIASES),
]);

type SearchItem = {
  node_id: string;
  number: number;
  title: string;
  html_url: string;
  repository_url: string;
  user: { login: string; avatar_url?: string } | null;
  state: "open" | "closed";
  labels: Array<{ name: string; color?: string }>;
  comments: number;
  created_at: string;
  updated_at: string;
};

type SearchResult = {
  total_count: number;
  incomplete_results?: boolean;
  items: SearchItem[];
};

type PublicRepo = {
  full_name: string;
  private: boolean;
  archived?: boolean;
  topics?: string[];
};

function normalize(value: string | null) {
  return (value ?? "").trim().toLowerCase();
}

function resolveRepoFullName(org: string, repository: string): string {
  const cleanRepo = repository.trim();
  if (cleanRepo.includes("/")) return cleanRepo;
  return `${org.trim()}/${cleanRepo}`;
}

const STATUS_QUERY: Record<OrganizationIssueFilters["status"], string> = {
  open: "is:open",
  closed: "is:closed",
  all: "",
};

async function frameworkRepositories(
  filters: OrganizationIssueFilters,
  topic: string,
) {
  if (filters.repository) {
    const fullName = resolveRepoFullName(filters.org, filters.repository);
    try {
      const { data } = await githubFetch<PublicRepo>(
        `https://api.github.com/repos/${fullName}`,
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
    } catch {
      return { names: [], total: 0, incomplete: false };
    }
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
  if (names.length === 0) return [];
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

export async function buildOrganizationIssueQueries(
  filters: OrganizationIssueFilters,
) {
  const normalized = normalize(filters.tech);
  const language = Object.hasOwn(TOPIC_ALIASES, normalized)
    ? undefined
    : LANGUAGES.get(normalized);

  const statusPart = STATUS_QUERY[filters.status];
  const baseParts = ["is:issue", "is:public", "archived:false"];
  if (statusPart) baseParts.push(statusPart);
  const base = baseParts.join(" ");

  const notices: string[] = [];
  let queries: string[];

  if (language) {
    const scope = filters.repository
      ? `repo:${resolveRepoFullName(filters.org, filters.repository)}`
      : `org:${filters.org}`;
    queries = [`${base} ${scope} language:"${language}"`];
  } else {
    const topic =
      TOPIC_ALIASES[normalized]?.topic ?? normalized.replaceAll(/\s+/g, "-");
    const repositories = await frameworkRepositories(filters, topic);

    if (repositories.names.length === 0) {
      queries = [];
      notices.push(
        `No repositories in organization "${filters.org}" matched technology topic "${topic}".`,
      );
    } else {
      queries = repositoryQueries(base, repositories.names);
      notices.push(
        `Technology matches repository topic "${topic}".`,
      );
      if (repositories.total > repositories.names.length) {
        notices.push(
          `Searching the ${repositories.names.length} most recently updated matching repositories out of ${repositories.total}. Choose a repository to narrow the search.`,
        );
      }
      if (repositories.incomplete) {
        notices.push("GitHub returned incomplete repository discovery results.");
      }
    }
  }

  return { queries, notices };
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

function mapIssue(item: SearchItem): OrganizationIssue {
  return {
    id: item.node_id,
    number: item.number,
    title: item.title,
    url: item.html_url,
    repository: item.repository_url.split("/repos/")[1] ?? "",
    author: item.user?.login ?? "ghost",
    authorAvatarUrl: item.user?.avatar_url,
    status: item.state,
    labels: (item.labels ?? []).map((label) => ({
      name: label.name,
      color: label.color,
    })),
    comments: item.comments,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
  };
}

export async function searchOrganizationIssues(
  filters: OrganizationIssueFilters,
): Promise<OrganizationIssueSearchResponse> {
  const { queries, notices } = await buildOrganizationIssueQueries(filters);

  if (queries.length === 0) {
    return {
      issues: [],
      totalCount: 0,
      page: filters.page,
      hasMore: false,
      query: "",
      notices,
      tokenConfigured: Boolean(process.env.GITHUB_TOKEN),
    };
  }

  const prefixSize = filters.page * PAGE_SIZE;
  const size = queries.length > 1 ? Math.min(100, prefixSize) : PAGE_SIZE;
  const pages = queries.length > 1 ? Math.ceil(prefixSize / size) : 1;

  const results: Array<{
    total: number;
    incomplete: boolean;
    items: SearchItem[];
  }> = [];

  for (let start = 0; start < queries.length; start += 3) {
    const batch = await Promise.all(
      queries.slice(start, start + 3).map(async (query) => {
        const responses: SearchResult[] = [];
        for (let index = 0; index < pages; index++) {
          responses.push(
            await searchPage(query, filters.sort, index + 1, size),
          );
        }
        return {
          total: responses[0]?.total_count ?? 0,
          incomplete: responses.some((r) => r.incomplete_results),
          items: responses.flatMap((r) => r.items),
        };
      }),
    );
    results.push(...batch);
  }

  const totalCount = results.reduce((sum, r) => sum + r.total, 0);
  const seen = new Set<string>();
  const mergedItems = results
    .flatMap((r) => r.items)
    .filter((item) => {
      if (seen.has(item.node_id)) return false;
      seen.add(item.node_id);
      return true;
    })
    .sort((a, b) => {
      if (filters.sort === "comments") return b.comments - a.comments;
      if (filters.sort === "created")
        return (
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
      return (
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      );
    });

  const startIndex = (filters.page - 1) * PAGE_SIZE;
  const pageItems = mergedItems.slice(startIndex, startIndex + PAGE_SIZE);

  return {
    issues: pageItems.map(mapIssue),
    totalCount,
    page: filters.page,
    hasMore: filters.page < 10 && filters.page * PAGE_SIZE < totalCount,
    query: queries.join(" OR "),
    notices,
    tokenConfigured: Boolean(process.env.GITHUB_TOKEN),
  };
}
