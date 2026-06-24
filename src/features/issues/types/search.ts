export type LabelOption = {
  value: string;
  label: string;
};

export type Issue = {
  id: string;
  title: string;
  url: string;
  repo: string;
  repoUrl: string;
  stars: number | null;
  comments: number;
  labels: string[];
  updatedAt: string;
  assigned: boolean;
  qualityScore: number;
};

export type SearchResponse = {
  query: string;
  totalCount: number;
  rateLimitRemaining: string | null;
  tokenConfigured: boolean;
  issues: Issue[];
  error?: string;
};

export type GitHubLabel = {
  name: string;
  color?: string;
};

export type GitHubIssue = {
  html_url: string;
  title: string;
  comments: number;
  updated_at: string;
  created_at: string;
  repository_url: string;
  labels: GitHubLabel[];
  assignee: unknown | null;
  assignees?: unknown[];
};

export type GitHubSearchResponse = {
  total_count: number;
  items: GitHubIssue[];
};

export type GitHubRepo = {
  full_name: string;
  html_url: string;
  stargazers_count: number;
  archived: boolean;
};
