import {
  githubFetch,
  computeRetryAfterSeconds,
  RateLimitError,
  isRateLimitError,
} from "@/lib/github";
import {
  getCommunityProfile,
  getRepositoryResponsiveness,
} from "@/features/repositories/server/github-repository";
import { scoreRepositoryHealth } from "@/features/issues/lib/repository-health";
import { unknownRepositoryResponsiveness } from "@/features/issues/lib/repository-responsiveness";
import type { GitHubRepo } from "@/features/issues/types/search";
import type {
  PullRequestDetails,
  PullRequestEnrichment,
  PullRequestReview,
  RepositoryInsights,
} from "../types";

export type EnrichmentReference = { id: string; repository: string };
type ReviewNode = {
  id: string;
  additions?: number;
  deletions?: number;
  changedFiles?: number;
  mergeable?: "MERGEABLE" | "CONFLICTING" | "UNKNOWN";
  repository: { isPrivate: boolean };
  reviewDecision: string | null;
  reviewRequests: {
    nodes: Array<{
      requestedReviewer: { login?: string; name?: string } | null;
    }>;
  };
  commits: {
    nodes: Array<{ commit: { statusCheckRollup: { state: string } | null } }>;
  };
  closingIssuesReferences: {
    nodes: Array<{
      title: string;
      url: string;
      repository: { isPrivate: boolean };
    }>;
  };
};

const REVIEW_QUERY = `query PullRequestInsights($ids: [ID!]!) {
  nodes(ids: $ids) { ... on PullRequest {
    id repository { isPrivate }
    reviewDecision additions deletions changedFiles mergeable
    reviewRequests(first: 20) { nodes { requestedReviewer { ... on User { login } ... on Team { name } ... on Mannequin { login } } } }
    commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }
    closingIssuesReferences(first: 10) { nodes { title url repository { isPrivate } } }
  } }
}`;

function reviewDetails(node: ReviewNode): PullRequestDetails | undefined {
  if (
    node.additions == null ||
    node.deletions == null ||
    node.changedFiles == null
  )
    return undefined;
  let mergeable: boolean | null = null;
  if (node.mergeable === "MERGEABLE") mergeable = true;
  if (node.mergeable === "CONFLICTING") mergeable = false;
  return {
    additions: node.additions,
    deletions: node.deletions,
    changedFiles: node.changedFiles,
    mergeable,
  };
}

async function getReviews(
  ids: string[],
): Promise<Record<string, PullRequestReview | null>> {
  const reviews: Record<string, PullRequestReview | null> = Object.fromEntries(
    ids.map((id) => [id, null]),
  );
  const token = process.env.GITHUB_TOKEN;
  if (!token || !ids.length) return reviews;
  const response = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify({ query: REVIEW_QUERY, variables: { ids } }),
    next: { revalidate: 60 },
    signal: AbortSignal.timeout(15000),
  });
  if (response.status === 403 || response.status === 429)
    throw new RateLimitError(
      "GitHub detail requests are temporarily limited.",
      computeRetryAfterSeconds(response.headers),
    );
  if (!response.ok) throw new Error("PR reviews unavailable");
  const payload = (await response.json()) as {
    data?: { nodes?: Array<ReviewNode | null> };
    errors?: Array<{ path?: Array<string | number>; type?: string }>;
  };
  if (payload.errors?.some((error) => error.type === "RATE_LIMITED"))
    throw new RateLimitError("GitHub detail requests are temporarily limited.");
  for (const [index, node] of (payload.data?.nodes ?? []).entries()) {
    if (
      node?.repository?.isPrivate !== false ||
      payload.errors?.some((error) => !error.path || error.path[1] === index)
    )
      continue;
    reviews[node.id] = {
      details: reviewDetails(node),
      reviewDecision: node.reviewDecision,
      reviewers: node.reviewRequests.nodes.flatMap(({ requestedReviewer }) =>
        requestedReviewer?.login || requestedReviewer?.name
          ? [requestedReviewer.login ?? requestedReviewer.name!]
          : [],
      ),
      checks: node.commits.nodes[0]?.commit.statusCheckRollup?.state ?? null,
      linkedIssues: node.closingIssuesReferences.nodes
        .filter((issue) => issue.repository.isPrivate === false)
        .map(({ title, url }) => ({ title, url })),
      linkedIssueCount: node.closingIssuesReferences.nodes.filter(
        (issue) => issue.repository.isPrivate === false,
      ).length,
    };
  }
  return reviews;
}

async function getInsights(
  repository: string,
): Promise<{ insights: RepositoryInsights; rateLimited: boolean }> {
  const token = process.env.GITHUB_TOKEN;
  const { data } = await githubFetch<GitHubRepo & { private: boolean }>(
    `https://api.github.com/repos/${repository}`,
    token,
    7200,
  );
  if (data.private !== false) throw new Error("Public repository unavailable");
  const [profile, responsiveness] = await Promise.allSettled([
    getCommunityProfile(repository, token),
    getRepositoryResponsiveness(repository, token),
  ]);
  return {
    rateLimited: [profile, responsiveness].some(
      (result) =>
        result.status === "rejected" && isRateLimitError(result.reason),
    ),
    insights: {
      stars: data.stargazers_count,
      health: scoreRepositoryHealth(data),
      responsiveness:
        responsiveness.status === "fulfilled"
          ? responsiveness.value
          : unknownRepositoryResponsiveness(),
      documentation:
        profile.status === "fulfilled" ? profile.value.documentation : null,
      hacktoberfest: (data.topics ?? []).includes("hacktoberfest"),
    },
  };
}

export async function enrichPullRequests(
  references: EnrichmentReference[],
): Promise<PullRequestEnrichment> {
  if (!process.env.GITHUB_TOKEN) {
    return {
      repositories: {},
      reviews: Object.fromEntries(references.map(({ id }) => [id, null])),
      notices: [
        "Additional repository and review insights are unavailable. You can still search and explore pull requests.",
      ],
    };
  }
  const names = [
    ...new Set(references.map((reference) => reference.repository)),
  ].slice(0, 12);
  const ids = [...new Set(references.map((reference) => reference.id))];
  const repositories: Record<string, RepositoryInsights> = {};
  const notices: string[] = [];
  const reviewsPromise = getReviews(ids).catch((error: unknown) => {
    notices.push(
      isRateLimitError(error)
        ? error.message
        : "PR review details are unavailable. Basic results are still usable.",
    );
    return Object.fromEntries(ids.map((id) => [id, null]));
  });
  // Three repositories at once; each runs at most two optional requests concurrently.
  for (let start = 0; start < names.length; start += 3) {
    const batch = names.slice(start, start + 3);
    const results = await Promise.allSettled(batch.map(getInsights));
    results.forEach((result, index) => {
      if (result.status === "fulfilled")
        repositories[batch[index]] = result.value.insights;
    });
    if (
      results.some((result) =>
        result.status === "fulfilled"
          ? result.value.rateLimited
          : isRateLimitError(result.reason),
      )
    ) {
      notices.push(
        "GitHub rate limited repository insights. Remaining insights are unknown.",
      );
      break;
    }
  }
  const reviews = await reviewsPromise;
  if (
    names.length <
    new Set(references.map((reference) => reference.repository)).size
  )
    notices.push(
      "Repository insights are limited to 12 unique repositories per page.",
    );
  if (
    Object.keys(repositories).length < names.length ||
    Object.values(repositories).some(
      (repo) => !repo.documentation || repo.responsiveness.status === "unknown",
    ) ||
    Object.values(reviews).some((review) => !review)
  )
    notices.push(
      "Some insights are unavailable or have insufficient evidence; these are shown as Unknown.",
    );
  return { repositories, reviews, notices };
}

export async function getPullRequestDetails(
  repository: string,
  number: number,
): Promise<PullRequestDetails> {
  const { data } = await githubFetch<{
    base: { repo: { private: boolean } };
    additions: number;
    deletions: number;
    changed_files: number;
    mergeable: boolean | null;
  }>(
    `https://api.github.com/repos/${repository}/pulls/${number}`,
    process.env.GITHUB_TOKEN,
  );
  if (data.base.repo.private !== false)
    throw new Error("Public pull request unavailable");
  return {
    additions: data.additions,
    deletions: data.deletions,
    changedFiles: data.changed_files,
    mergeable: data.mergeable,
  };
}
