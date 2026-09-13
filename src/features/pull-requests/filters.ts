import { PR_SORTS, PR_STATUSES, type PullRequestFilters } from "./types";

export const DEFAULT_PR_FILTERS: PullRequestFilters = {
  org: "",
  tech: "",
  repository: "",
  status: "open",
  sort: "updated",
  page: 1,
};
export const REPOSITORY_PATTERN =
  /^[a-zA-Z0-9-]{1,39}\/(?!\.{1,2}$)[a-zA-Z0-9_.-]{1,100}$/;

export function readPullRequestFilters(
  params: Pick<URLSearchParams, "get">,
): PullRequestFilters {
  return {
    org: params.get("org")?.trim() ?? "",
    tech: params.get("tech")?.trim() ?? "",
    repository: params.get("repository")?.trim() ?? "",
    status: (params.get("status") ?? "open") as PullRequestFilters["status"],
    sort: (params.get("sort") ?? "updated") as PullRequestFilters["sort"],
    page: Number(params.get("page") ?? 1),
  };
}

export function validatePullRequestFilters(
  filters: PullRequestFilters,
): string | null {
  if (!/^[a-zA-Z0-9-]{1,39}$/.test(filters.org))
    return "Enter a valid GitHub organization.";
  if (
    !filters.tech ||
    filters.tech.length > 80 ||
    !/^[\p{L}\p{N} #+._-]+$/u.test(filters.tech)
  )
    return "Enter a language or technology (up to 80 characters).";
  if (
    filters.repository &&
    (!REPOSITORY_PATTERN.test(filters.repository) ||
      filters.repository.split("/")[0].toLowerCase() !==
        filters.org.toLowerCase())
  )
    return "Repository must use organization/name and belong to the selected organization.";
  if (!PR_STATUSES.includes(filters.status)) return "Choose a valid PR status.";
  if (!PR_SORTS.includes(filters.sort)) return "Choose a valid sort order.";
  if (!Number.isInteger(filters.page) || filters.page < 1 || filters.page > 10)
    return "Page must be between 1 and 10.";
  return null;
}

export function pullRequestSearchParams(filters: PullRequestFilters) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== "") params.set(key, String(value));
  }
  return params;
}
