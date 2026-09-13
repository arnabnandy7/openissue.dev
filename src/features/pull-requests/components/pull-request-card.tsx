"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  GitPullRequest,
  MessageCircle,
  Star,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { compactNumber, relativeDate } from "@/features/issues/lib/format";
import { fetchPullRequestData } from "../client";
import { scorePullRequest } from "../scoring";
import type {
  PullRequest,
  PullRequestDetails,
  PullRequestReview,
  RepositoryInsights,
} from "../types";

const DOCUMENTS = {
  readme: "README",
  contributing: "Contributing guide",
  license: "License",
  codeOfConduct: "Code of conduct",
  issueTemplate: "Issue template",
  pullRequestTemplate: "PR template",
} as const;
const REVIEW_LABELS: Record<string, string> = {
  APPROVED: "Approved",
  CHANGES_REQUESTED: "Changes requested",
  REVIEW_REQUIRED: "Review required",
};
const CHECK_LABELS: Record<string, string> = {
  SUCCESS: "Passing",
  FAILURE: "Failing",
  ERROR: "Error",
  PENDING: "Pending",
  EXPECTED: "Expected",
};

function RepositorySummary({
  insights,
  loading,
}: Readonly<{ insights?: RepositoryInsights; loading: boolean }>) {
  if (!insights && loading)
    return (
      <p className="text-sm text-muted-foreground">
        Loading repository insights…
      </p>
    );
  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap gap-2">
        <Badge variant="outline">
          <Star className="size-3" />
          {insights?.stars == null
            ? "Stars unknown"
            : compactNumber(insights.stars)}
        </Badge>
        <Badge variant="outline" title={insights?.health.signals.join(" · ")}>
          Repository health:{" "}
          {insights?.health.score == null
            ? "Unknown"
            : `${insights.health.score} · ${insights.health.label}`}
        </Badge>
        <Badge
          variant="outline"
          title={insights?.responsiveness.signals.join(" · ")}
        >
          Repository responsiveness:{" "}
          {insights?.responsiveness.status ?? "Unknown"}
        </Badge>
        {insights?.hacktoberfest && (
          <Badge variant="secondary">Hacktoberfest repository topic</Badge>
        )}
      </div>
      <details>
        <summary className="cursor-pointer text-muted-foreground">
          Repository signals and contribution guides
        </summary>
        <div className="mt-3 space-y-3">
          {insights && (
            <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
              {[
                ...insights.health.signals,
                ...insights.responsiveness.signals,
              ].map((signal, index) => (
                <li key={`${index}-${signal}`}>{signal}</li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {Object.entries(DOCUMENTS).map(([key, label]) => {
              const url =
                insights?.documentation?.[key as keyof typeof DOCUMENTS];
              return url ? (
                <a
                  key={key}
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="underline underline-offset-4"
                >
                  {label}
                </a>
              ) : (
                <span key={key} className="text-muted-foreground">
                  {label}:{" "}
                  {insights?.documentation ? "Not provided" : "Unknown"}
                </span>
              );
            })}
          </div>
        </div>
      </details>
    </div>
  );
}

function mergeabilityLabel(
  status: PullRequest["status"],
  mergeable: boolean | null,
) {
  if (status === "merged" || status === "closed") return "Not applicable";
  if (mergeable === null) return "Unknown";
  return mergeable ? "No conflicts" : "Conflicts";
}

function readinessLabel(score: ReturnType<typeof scorePullRequest>) {
  if (score.minimum === null) return "N/A";
  if (score.minimum === score.maximum) return `${score.minimum}/100`;
  return `${score.minimum}–${score.maximum}/100`;
}

function ScoreSummary({
  score,
}: Readonly<{ score: ReturnType<typeof scorePullRequest> }>) {
  return (
    <div className="space-y-2 rounded-lg border p-3 text-sm" aria-live="polite">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">PR readiness: {readinessLabel(score)}</Badge>
        <span>{score.label}</span>
      </div>
      {score.minimum !== null && score.coverage < 100 && (
        <p className="text-muted-foreground">
          {score.coverage}% signal coverage. Unknown signals create a range;
          they are not failures.
        </p>
      )}
      <details>
        <summary className="cursor-pointer text-muted-foreground">
          How this score works
        </summary>
        <p className="mt-2 text-muted-foreground">{score.explanation}</p>
        <ul className="mt-2 space-y-1">
          {score.signals.map((signal) => (
            <li key={signal.label}>
              {signal.label}:{" "}
              {signal.points === null
                ? `Unknown (up to ${signal.maximum} points)`
                : `${signal.points}/${signal.maximum}`}{" "}
              — {signal.reason}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

function ReviewSummary({
  review,
  enriching,
  assignees,
}: Readonly<{
  review?: PullRequestReview | null;
  enriching: boolean;
  assignees: string[];
}>) {
  return (
    <div className="space-y-2 border-t pt-4 text-sm">
      {enriching && review === undefined ? (
        <p className="text-muted-foreground">Loading reviews and checks…</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">
              Review:{" "}
              {review?.reviewDecision
                ? (REVIEW_LABELS[review.reviewDecision] ??
                  review.reviewDecision)
                : "Unknown"}
            </Badge>
            <Badge variant="outline">
              Checks:{" "}
              {review?.checks
                ? (CHECK_LABELS[review.checks] ?? review.checks)
                : "Unknown"}
            </Badge>
          </div>
          <p className="text-muted-foreground">
            Requested reviewers:{" "}
            {review ? review.reviewers.join(", ") || "None" : "Unknown"}
          </p>
          <p className="text-muted-foreground">
            Linked closing issues (public sample):{" "}
            {review ? review.linkedIssueCount : "Unknown"}
          </p>
          {review?.linkedIssues.map((issue) => (
            <a
              key={issue.url}
              href={issue.url}
              target="_blank"
              rel="noreferrer"
              className="block underline underline-offset-4"
            >
              {issue.title}
            </a>
          ))}
          {review && (
            <p className="text-muted-foreground">
              Showing public issues from the first 10 linked issues. View the PR
              for more.
            </p>
          )}
        </>
      )}
      <p className="text-muted-foreground">
        Assignees: {assignees.join(", ") || "None"}
      </p>
    </div>
  );
}

export function PullRequestCard({
  pullRequest: pr,
  insights,
  review,
  enriching,
}: Readonly<{
  pullRequest: PullRequest;
  insights?: RepositoryInsights;
  review?: PullRequestReview | null;
  enriching: boolean;
}>) {
  const [expanded, setExpanded] = useState(false);
  const [details, setDetails] = useState<PullRequestDetails | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const score = scorePullRequest(pr.status, review, details);
  useEffect(() => () => controller.current?.abort(), []);

  async function openDetails() {
    setExpanded((value) => !value);
    if (expanded || details || loading) return;
    if (review?.details) {
      setDetails(review.details);
      return;
    }
    controller.current = new AbortController();
    setLoading(true);
    setError("");
    try {
      setDetails(
        await fetchPullRequestData<PullRequestDetails>(
          `/api/pull-requests/details?${new URLSearchParams({ repository: pr.repository, number: String(pr.number) })}`,
          { signal: controller.current.signal },
        ),
      );
    } catch (error) {
      if (!controller.current.signal.aborted)
        setError(
          error instanceof Error ? error.message : "Details unavailable.",
        );
    } finally {
      if (!controller.current.signal.aborted) setLoading(false);
    }
  }

  return (
    <Card className="h-fit min-w-0">
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
          <a
            href={`https://github.com/${pr.repository}`}
            target="_blank"
            rel="noreferrer"
            className="break-all hover:underline"
          >
            {pr.repository}
          </a>
          <Badge
            variant={pr.status === "merged" ? "secondary" : "outline"}
            className="capitalize"
          >
            <GitPullRequest className="size-3" />
            {pr.status}
          </Badge>
        </div>
        <CardTitle className="text-lg leading-7">
          <a
            href={pr.url}
            target="_blank"
            rel="noreferrer"
            className="hover:underline"
          >
            {pr.title}{" "}
            <span className="font-normal text-muted-foreground">
              #{pr.number}
            </span>
          </a>
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          By {pr.author} · Updated {relativeDate(pr.updatedAt)} · Created{" "}
          {relativeDate(pr.createdAt)}
        </p>
        <div className="flex flex-wrap gap-2">
          {pr.labels.map((label) => (
            <Badge variant="secondary" key={label}>
              {label}
            </Badge>
          ))}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <ScoreSummary score={score} />
        <RepositorySummary insights={insights} loading={enriching} />
        <ReviewSummary
          review={review}
          enriching={enriching}
          assignees={pr.assignees}
        />
        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4">
          <span className="flex items-center gap-1 text-sm text-muted-foreground">
            <MessageCircle className="size-4" />
            {pr.comments} comments
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void openDetails()}
              aria-expanded={expanded}
              aria-controls={`details-${pr.id}`}
            >
              {expanded ? "Hide details" : "Change details"}
            </Button>
            <Button variant="outline" size="sm" asChild>
              <a href={pr.url} target="_blank" rel="noreferrer">
                GitHub
                <ArrowUpRight className="size-4" />
              </a>
            </Button>
          </div>
        </div>
        {expanded && (
          <div
            id={`details-${pr.id}`}
            className="rounded-md bg-muted/50 p-3 text-sm"
            aria-live="polite"
          >
            {loading && <p>Loading change details…</p>}
            {error && (
              <p role="alert">{error} Close and reopen details to retry.</p>
            )}
            {details && (
              <div className="flex flex-wrap gap-3">
                <span>{details.changedFiles} changed files</span>
                <span className="text-emerald-700 dark:text-emerald-400">
                  +{details.additions}
                </span>
                <span className="text-rose-700 dark:text-rose-400">
                  −{details.deletions}
                </span>
                <span>
                  Mergeability:{" "}
                  {mergeabilityLabel(pr.status, details.mergeable)}
                </span>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
