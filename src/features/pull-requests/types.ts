import type {
  ContributionDocumentation,
  RepositoryHealth,
  RepositoryResponsiveness,
} from "@/features/issues/types/search";

export const PR_STATUSES = [
  "open",
  "draft",
  "merged",
  "closed",
  "all",
] as const;
export const PR_SORTS = ["updated", "created", "comments"] as const;
export type PullRequestFilters = {
  org: string;
  tech: string;
  repository: string;
  status: (typeof PR_STATUSES)[number];
  sort: (typeof PR_SORTS)[number];
  page: number;
};
export type PullRequest = {
  id: string;
  number: number;
  title: string;
  url: string;
  repository: string;
  author: string;
  assignees: string[];
  status: "open" | "draft" | "merged" | "closed";
  labels: string[];
  comments: number;
  createdAt: string;
  updatedAt: string;
};
export type PullRequestSearchResponse = {
  pullRequests: PullRequest[];
  totalCount: number;
  page: number;
  hasMore: boolean;
  query: string;
  notices: string[];
  tokenConfigured: boolean;
};
export type RepositoryInsights = {
  stars: number | null;
  health: RepositoryHealth;
  responsiveness: RepositoryResponsiveness;
  documentation: ContributionDocumentation | null;
  hacktoberfest: boolean | null;
};
export type PullRequestReview = {
  details?: PullRequestDetails;
  reviewDecision: string | null;
  reviewers: string[];
  checks: string | null;
  linkedIssues: Array<{ title: string; url: string }>;
  linkedIssueCount: number;
};
export type PullRequestEnrichment = {
  repositories: Record<string, RepositoryInsights>;
  reviews: Record<string, PullRequestReview | null>;
  notices: string[];
};
export type PullRequestDetails = {
  additions: number;
  deletions: number;
  changedFiles: number;
  mergeable: boolean | null;
};
