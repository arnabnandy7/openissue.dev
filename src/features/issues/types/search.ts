export type LabelOption = {
  value: string;
  label: string;
};

export type IssueStatus = "open" | "claimed" | "resolved";

export type RepositoryHealth = {
  score: number | null;
  label: "active" | "moderate" | "stale" | "unknown";
  signals: string[];
};

export type RepositoryResponsiveness = {
  status: "responsive" | "variable" | "slow" | "unknown";
  sampleDays: number;
  sampleSize: number;
  signals: string[];
};

export type ContributionReadinessStatus =
  | "ready"
  | "ask"
  | "claimed"
  | "poorlyDocumented"
  | "inactive"
  | "unknown";

export type ContributionDocumentation = {
  readme: string | null;
  contributing: string | null;
  license: string | null;
  codeOfConduct: string | null;
  issueTemplate: string | null;
  pullRequestTemplate: string | null;
};

export type ContributionReadiness = {
  score: number | null;
  status: ContributionReadinessStatus;
  signals: string[];
  documentation: ContributionDocumentation;
};

export type EnrichmentAvailability = "complete" | "partial" | "unavailable";

export type IssueEnrichment = {
  repositoryMetadata: boolean;
  discussionAnalysis: boolean;
  linkedPullRequests: boolean;
  communityProfile?: boolean;
};

export type IssueClassification = {
  experience: Array<"first" | "beginner" | "intermediate">;
  contributionTypes: Array<"documentation" | "tests" | "bugfix" | "feature">;
  smallScope: boolean;
  signals: string[];
};

export type SearchEnrichment = {
  repositoryMetadata: EnrichmentAvailability;
  discussionAnalysis: EnrichmentAvailability;
  linkedPullRequests: EnrichmentAvailability;
  communityProfile?: EnrichmentAvailability;
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
  createdAt: string;
  assigned: boolean;
  linkedPrCount: number | null;
  hacktoberfest: boolean;
  hacktoberfestSource: "repo-topic" | "issue-label" | null;
  qualityScore: number;
  trendingScore?: number;
  repositoryHealth: RepositoryHealth;
  repositoryResponsiveness?: RepositoryResponsiveness;
  contributionReadiness?: ContributionReadiness;
  enrichment?: IssueEnrichment;
  helpStatus?: IssueStatus;
  classification?: IssueClassification;
};

export type SearchResponse = {
  query: string;
  totalCount: number;
  candidateCount: number;
  rateLimitRemaining: string | null;
  tokenConfigured: boolean;
  issues: Issue[];
  page: number;
  enrichment?: SearchEnrichment;
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
  body?: string | null;
  comments: number;
  updated_at: string;
  created_at: string;
  repository_url: string;
  labels: GitHubLabel[];
  assignee: unknown;
  assignees?: unknown[];
};

export type GitHubSearchResponse = {
  total_count: number;
  items: GitHubIssue[];
};

export type GitHubRepoSearchResponse = {
  total_count: number;
  items: GitHubRepo[];
};

export type GitHubRepo = {
  full_name: string;
  html_url: string;
  stargazers_count: number;
  archived: boolean;
  pushed_at?: string | null;
  open_issues_count?: number;
  forks_count?: number;
  has_issues?: boolean;
  topics?: string[];
  description?: string | null;
};

export type RepositorySuggestion = {
  fullName: string;
  url: string;
  description: string | null;
  stars: number;
};

export type RepositoryDigestIssue = {
  id: string;
  title: string;
  url: string;
  summary: string;
  labels: string[];
  createdAt: string;
  comments: number;
  assigned: boolean;
  qualityScore: number;
  repositoryHealth: RepositoryHealth;
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
