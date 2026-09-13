import type {
  OrganizationIssueFilters,
  OrganizationIssueSort,
  OrganizationIssueStatus,
} from "./types";

export const DEFAULT_ORGANIZATION_FILTERS: OrganizationIssueFilters = {
  org: "",
  tech: "",
  repository: "",
  status: "open",
  sort: "updated",
  page: 1,
};

const SUPPORTED_STATUSES = new Set<OrganizationIssueStatus>([
  "open",
  "closed",
  "all",
]);

const SUPPORTED_SORTS = new Set<OrganizationIssueSort>([
  "updated",
  "created",
  "comments",
]);

export function readOrganizationFilters(
  params: URLSearchParams,
): OrganizationIssueFilters {
  const statusParam = params.get("status");
  const sortParam = params.get("sort");
  const pageParam = Number.parseInt(params.get("page") ?? "1", 10);

  return {
    org: (params.get("org") ?? "").trim(),
    tech: (params.get("tech") ?? "").trim(),
    repository: (params.get("repository") ?? "").trim(),
    status: SUPPORTED_STATUSES.has(statusParam as OrganizationIssueStatus)
      ? (statusParam as OrganizationIssueStatus)
      : "open",
    sort: SUPPORTED_SORTS.has(sortParam as OrganizationIssueSort)
      ? (sortParam as OrganizationIssueSort)
      : "updated",
    page: Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1,
  };
}

function validateRepositoryFilter(
  repository: string,
  org: string,
): string | null {
  const repo = repository.trim();
  if (!repo) return null;
  if (repo.length > 140) {
    return "Repository name must be 140 characters or fewer.";
  }
  const repoPattern = /^(?:[a-zA-Z0-9-]+\/)?[a-zA-Z0-9_.-]+$/;
  if (!repoPattern.test(repo)) {
    return "Repository name is invalid.";
  }
  if (repo.includes("/")) {
    const [repoOwner] = repo.split("/");
    if (repoOwner.toLowerCase() !== org.trim().toLowerCase()) {
      return `Repository must belong to the "${org}" organization.`;
    }
  }
  return null;
}

export function validateOrganizationFilters(
  filters: OrganizationIssueFilters,
): string | null {
  if (!filters.org.trim()) {
    return "Organization is required.";
  }
  if (filters.org.length > 39 || !/^[a-zA-Z0-9-]+$/.test(filters.org.trim())) {
    return "Organization name may contain up to 39 alphanumeric characters or hyphens.";
  }
  if (!filters.tech.trim()) {
    return "Technology is required.";
  }
  if (filters.tech.length > 80) {
    return "Technology must be 80 characters or fewer.";
  }
  const repoError = validateRepositoryFilter(filters.repository, filters.org);
  if (repoError) {
    return repoError;
  }
  if (!SUPPORTED_STATUSES.has(filters.status)) {
    return "Unsupported status filter.";
  }
  if (!SUPPORTED_SORTS.has(filters.sort)) {
    return "Unsupported sort filter.";
  }
  return null;
}

export function organizationSearchParams(
  filters: OrganizationIssueFilters,
): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.org.trim()) params.set("org", filters.org.trim());
  if (filters.tech.trim()) params.set("tech", filters.tech.trim());
  if (filters.repository.trim())
    params.set("repository", filters.repository.trim());
  if (filters.status && filters.status !== "open")
    params.set("status", filters.status);
  if (filters.sort && filters.sort !== "updated")
    params.set("sort", filters.sort);
  if (filters.page > 1) params.set("page", String(filters.page));
  return params;
}
