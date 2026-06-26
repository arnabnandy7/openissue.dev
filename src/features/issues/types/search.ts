export type LabelOption = {
  value: string;
  label: string;
};

export type IssueStatus = "open" | "claimed" | "resolved";

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
  linkedPrCount: number | null;
  qualityScore: number;
  helpStatus?: IssueStatus;
};

export type SearchResponse = {
  query: string;
  totalCount: number;
  rateLimitRemaining: string | null;
  tokenConfigured: boolean;
  issues: Issue[];
  page: number;
  error?: string;
};

export type GitHubLabel = {
  name: string;
  color?: string;
};

export type GitHubIssue = {
  number: number;
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

export type GitHubTimelineEvent = {
  event: string;
  source?: {
    issue?: {
      html_url?: string;
      pull_request?: unknown;
    };
  };
};
