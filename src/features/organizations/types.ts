export type OrganizationSuggestion = {
  login: string;
  avatarUrl: string;
  description?: string | null;
};

export type TechnologySuggestion = {
  name: string;
  type: "language" | "framework";
};

export type OrgRepositorySuggestion = {
  name: string;
  fullName: string;
  stars: number;
  description: string | null;
};

export type OrganizationIssueStatus = "open" | "closed" | "all";
export type OrganizationIssueSort = "updated" | "created" | "comments";

export type OrganizationIssueFilters = {
  org: string;
  tech: string;
  repository: string;
  status: OrganizationIssueStatus;
  sort: OrganizationIssueSort;
  page: number;
};

export type OrganizationIssue = {
  id: string;
  number: number;
  title: string;
  url: string;
  repository: string;
  author: string;
  authorAvatarUrl?: string;
  status: "open" | "closed";
  labels: Array<{ name: string; color?: string }>;
  comments: number;
  createdAt: string;
  updatedAt: string;
};

export type OrganizationIssueSearchResponse = {
  issues: OrganizationIssue[];
  totalCount: number;
  page: number;
  hasMore: boolean;
  query: string;
  notices: string[];
  tokenConfigured: boolean;
};
