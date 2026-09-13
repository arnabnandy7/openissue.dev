import {
  githubFetch,
  RateLimitError,
  computeRetryAfterSeconds,
  isRateLimitResponse,
} from "@/lib/github";
import {
  scoreRepositoryResponsiveness,
  unknownRepositoryResponsiveness,
  type ResponsivenessIssue,
  type ResponsivenessPullRequest,
} from "@/features/issues/lib/repository-responsiveness";

type GitHubCommunityProfileResponse = {
  health_percentage: number;
  files: Partial<
    Record<
      | "readme"
      | "contributing"
      | "license"
      | "code_of_conduct"
      | "issue_template"
      | "pull_request_template",
      { html_url?: string | null } | null
    >
  >;
};

type GitHubResponsivenessResponse = {
  data?: {
    repository?: {
      issues: { nodes: ResponsivenessIssue[] };
      pullRequests: { nodes: ResponsivenessPullRequest[] };
    } | null;
  };
  errors?: Array<{ message: string }>;
};

const RESPONSIVENESS_QUERY = `
  query RepositoryResponsiveness($owner: String!, $name: String!, $since: DateTime!) {
    repository(owner: $owner, name: $name) {
      issues(first: 20, orderBy: { field: CREATED_AT, direction: DESC }, filterBy: { since: $since }) {
        nodes {
          author { login }
          closedAt
          createdAt
          labels(first: 10) { nodes { name } }
          comments(first: 20) {
            nodes { author { login } authorAssociation createdAt }
          }
        }
      }
      pullRequests(first: 20, orderBy: { field: CREATED_AT, direction: DESC }) {
        nodes { authorAssociation createdAt mergedAt }
      }
    }
  }
`;

export async function getRepositoryResponsiveness(
  fullName: string,
  token = process.env.GITHUB_TOKEN,
) {
  if (!token) {
    return unknownRepositoryResponsiveness(
      "Maintainer responsiveness data is unavailable",
    );
  }

  const [owner, name] = fullName.split("/");
  if (!owner || !name) return unknownRepositoryResponsiveness();

  const sinceDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  sinceDate.setUTCHours(Math.floor(sinceDate.getUTCHours() / 6) * 6, 0, 0, 0);
  const since = sinceDate.toISOString();
  const response = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify({
      query: RESPONSIVENESS_QUERY,
      variables: { owner, name, since },
    }),
    next: { revalidate: 21600 },
  });

  if (!response.ok) {
    const body = await response.text();
    const retryAfterSeconds = computeRetryAfterSeconds(response.headers);

    if (
      (response.status === 403 || response.status === 429) &&
      isRateLimitResponse(body)
    ) {
      throw new RateLimitError(
        "GitHub API rate limit exceeded. Please wait a few minutes and try again.",
        retryAfterSeconds,
      );
    }

    throw new Error(`GitHub GraphQL error ${response.status}`);
  }
  const payload = (await response.json()) as GitHubResponsivenessResponse;
  const repository = payload.data?.repository;

  if (!repository || payload.errors?.length) {
    throw new Error(
      payload.errors?.[0]?.message ?? "Repository analytics unavailable",
    );
  }

  return scoreRepositoryResponsiveness(
    repository.issues.nodes,
    repository.pullRequests.nodes,
  );
}

export async function getCommunityProfile(fullName: string, token?: string) {
  const result = await githubFetch<GitHubCommunityProfileResponse>(
    `https://api.github.com/repos/${fullName}/community/profile`,
    token,
    21600,
  );
  const files = result.data.files ?? {};

  return {
    healthPercentage: result.data.health_percentage,
    documentation: {
      readme: files.readme?.html_url ?? null,
      contributing: files.contributing?.html_url ?? null,
      license: files.license?.html_url ?? null,
      codeOfConduct: files.code_of_conduct?.html_url ?? null,
      issueTemplate: files.issue_template?.html_url ?? null,
      pullRequestTemplate: files.pull_request_template?.html_url ?? null,
    },
  };
}
