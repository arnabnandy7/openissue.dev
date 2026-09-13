import { githubFetch, isRateLimitError } from "@/lib/github";
import { POPULAR_ORGANIZATIONS, POPULAR_TECHNOLOGIES } from "../data/popular";
import linguistLanguages from "../data/languages.json";
import type {
  OrganizationSuggestion,
  OrgRepositorySuggestion,
  TechnologySuggestion,
} from "../types";

type GitHubUserItem = {
  login: string;
  avatar_url: string;
  description?: string;
};

type GitHubRepoItem = {
  name: string;
  full_name: string;
  stargazers_count: number;
  description: string | null;
  private: boolean;
};

// Map of all language names from Linguist
const LINGUIST_LANGUAGES: TechnologySuggestion[] = Array.from(
  new Set(Object.values(linguistLanguages)),
).map((name) => ({ name, type: "language" }));

export async function getOrganizationSuggestions(
  query: string,
): Promise<OrganizationSuggestion[]> {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) {
    return POPULAR_ORGANIZATIONS.slice(0, 8);
  }

  // Local popular matches
  const localMatches = POPULAR_ORGANIZATIONS.filter((org) =>
    org.login.toLowerCase().includes(trimmed),
  );

  try {
    const url = new URL("https://api.github.com/search/users");
    url.searchParams.set("q", `${trimmed} type:org`);
    url.searchParams.set("per_page", "8");

    const { data } = await githubFetch<{ items: GitHubUserItem[] }>(
      url.toString(),
      process.env.GITHUB_TOKEN,
      300,
    );

    const remoteSuggestions: OrganizationSuggestion[] = data.items.map(
      (item) => ({
        login: item.login,
        avatarUrl: item.avatar_url,
        description: item.description ?? null,
      }),
    );

    // Merge local and remote, deduplicating by login
    const seen = new Set<string>();
    const results: OrganizationSuggestion[] = [];

    for (const item of [...remoteSuggestions, ...localMatches]) {
      const key = item.login.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        results.push(item);
      }
      if (results.length >= 8) break;
    }

    return results;
  } catch (error) {
    if (isRateLimitError(error)) throw error;
    // Fall back to local popular matches if network/remote fails
    return localMatches.slice(0, 8);
  }
}

export function getTechnologySuggestions(
  query: string,
): TechnologySuggestion[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) {
    return POPULAR_TECHNOLOGIES.slice(0, 10);
  }

  const results: TechnologySuggestion[] = [];
  const seen = new Set<string>();

  // Prioritize popular technologies
  for (const tech of POPULAR_TECHNOLOGIES) {
    if (tech.name.toLowerCase().includes(trimmed)) {
      seen.add(tech.name.toLowerCase());
      results.push(tech);
    }
    if (results.length >= 10) return results;
  }

  // Then add from linguist catalog
  for (const lang of LINGUIST_LANGUAGES) {
    const key = lang.name.toLowerCase();
    if (!seen.has(key) && key.includes(trimmed)) {
      seen.add(key);
      results.push(lang);
    }
    if (results.length >= 10) break;
  }

  return results;
}

export async function getRepositorySuggestions(
  org: string,
  query = "",
): Promise<OrgRepositorySuggestion[]> {
  const cleanOrg = org.trim();
  if (!cleanOrg) return [];

  const cleanQuery = query.trim();
  const url = new URL("https://api.github.com/search/repositories");

  const q = cleanQuery
    ? `org:${cleanOrg} ${cleanQuery} in:name archived:false`
    : `org:${cleanOrg} archived:false`;

  url.searchParams.set("q", q);
  url.searchParams.set("sort", "stars");
  url.searchParams.set("order", "desc");
  url.searchParams.set("per_page", "8");

  try {
    const { data } = await githubFetch<{ items: GitHubRepoItem[] }>(
      url.toString(),
      process.env.GITHUB_TOKEN,
      180,
    );

    return data.items
      .filter((repo) => !repo.private)
      .map((repo) => ({
        name: repo.name,
        fullName: repo.full_name,
        stars: repo.stargazers_count,
        description: repo.description,
      }));
  } catch (error) {
    if (isRateLimitError(error)) throw error;
    return [];
  }
}
