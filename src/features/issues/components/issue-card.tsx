import {
  Activity,
  ArrowUpRight,
  Bookmark,
  Clock3,
  GitPullRequest,
  MessageCircle,
  Star,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { compactNumber, relativeDate } from "@/features/issues/lib/format";
import { getResponsivenessBoost } from "@/features/issues/lib/repository-responsiveness";
import type {
  Issue,
  RepositoryHealth,
  RepositoryResponsiveness,
} from "@/features/issues/types/search";

function getQualityBadgeClassName(qualityScore: number) {
  if (qualityScore >= 70) {
    return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20";
  }

  if (qualityScore >= 40) {
    return "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20";
  }

  return "bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20";
}

function getResponsivenessClassName(status: RepositoryResponsiveness["status"]) {
  switch (status) {
    case "responsive":
      return "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400";
    case "variable":
      return "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-400";
    case "slow":
      return "border-rose-500/20 bg-rose-500/10 text-rose-700 dark:text-rose-400";
    default:
      return "";
  }
}

function getRepositoryHealthClassName(label: RepositoryHealth["label"]) {
  switch (label) {
    case "active":
      return "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400";
    case "moderate":
      return "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-400";
    case "stale":
      return "border-rose-500/20 bg-rose-500/10 text-rose-700 dark:text-rose-400";
    default:
      return "";
  }
}

function getRepositoryHealthText(health: RepositoryHealth) {
  if (health.score === null) {
    return "Health unknown";
  }

  return `${health.score} ${health.label}`;
}

function RepositoryHealthTooltip({ issue }: Readonly<{ issue: Issue }>) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant="outline"
          className={getRepositoryHealthClassName(issue.repositoryHealth.label)}
          tabIndex={0}
          title={issue.repositoryHealth.signals.join(" · ")}
        >
          <Activity className="h-3 w-3" />
          {getRepositoryHealthText(issue.repositoryHealth)}
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="block max-w-sm space-y-2">
        <p className="font-medium">Repository health</p>
        <p>70+ active · 40–69 moderate · below 40 stale</p>
        <ul className="list-disc space-y-1 pl-4">
          {issue.repositoryHealth.signals.map((signal) => (
            <li key={signal}>{signal}</li>
          ))}
        </ul>
      </TooltipContent>
    </Tooltip>
  );
}

function ResponsivenessTooltip({ issue }: Readonly<{ issue: Issue }>) {
  const responsiveness = issue.repositoryResponsiveness ?? {
    status: "unknown" as const,
    sampleDays: 90,
    sampleSize: 0,
    signals: ["Responsiveness sample unavailable"],
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant="outline"
          className={getResponsivenessClassName(responsiveness.status)}
          tabIndex={0}
          title={responsiveness.signals.join(" · ")}
        >
          <MessageCircle className="h-3 w-3" />
          {responsiveness.status === "unknown"
            ? "Response unknown"
            : `${responsiveness.status} maintainers`}
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="block max-w-sm space-y-2">
        <p className="font-medium">Maintainer responsiveness</p>
        <p>
          Based on {responsiveness.sampleSize} recent contribution samples from
          the last {responsiveness.sampleDays} days.
        </p>
        <ul className="list-disc space-y-1 pl-4">
          {responsiveness.signals.map((signal) => (
            <li key={signal}>{signal}</li>
          ))}
        </ul>
      </TooltipContent>
    </Tooltip>
  );
}

function QualityTooltip({ issue }: Readonly<{ issue: Issue }>) {
  const healthBoost = Math.round((issue.repositoryHealth.score ?? 0) / 10);
  const responsivenessBoost = getResponsivenessBoost(
    issue.repositoryResponsiveness?.status ?? "unknown",
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          className={getQualityBadgeClassName(issue.qualityScore)}
          tabIndex={0}
        >
          {issue.qualityScore} quality
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="block max-w-sm space-y-2">
        <p className="font-medium">Issue quality ranking points</p>
        <p>70+ strong · 40–69 promising · below 40 lower confidence</p>
        <p>
          Updated {relativeDate(issue.updatedAt)} ·{" "}
          {issue.stars === null
            ? "stars unavailable"
            : `${compactNumber(issue.stars)} stars`} · {issue.labels.length} labels ·{" "}
          {issue.comments} comments ·{" "}
          {issue.assigned ? "assigned" : "unassigned"}
        </p>
        <p>
          Repository health contributes {healthBoost} points. Scores are not
          percentages. Maintainer responsiveness contributes {responsivenessBoost}
          points.
        </p>
        {issue.enrichment?.repositoryMetadata === false ? (
          <p>Repository metadata was unavailable, so its ranking signals were omitted.</p>
        ) : null}
      </TooltipContent>
    </Tooltip>
  );
}

function TrendingTooltip({ issue }: Readonly<{ issue: Issue }>) {
  if (issue.trendingScore === undefined) return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge className="border-violet-500/20 bg-violet-500/10 text-violet-700 dark:text-violet-400" tabIndex={0}>
          {issue.trendingScore} trending
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="block max-w-sm space-y-2">
        <p className="font-medium">Trending activity score</p>
        <p>
          Based on updates in the last 30 days, discussion, repository stars,
          and repository health. Scores are not percentages.
        </p>
        {issue.enrichment?.repositoryMetadata === false ? (
          <p>Repository stars and health were unavailable for this result.</p>
        ) : null}
      </TooltipContent>
    </Tooltip>
  );
}

function IssueBadges({ issue }: Readonly<{ issue: Issue }>) {
  const discussionAvailable = issue.enrichment?.discussionAnalysis !== false;
  const needsHelp = issue.helpStatus === "open" && discussionAvailable;
  const possiblyClaimed =
    issue.helpStatus === "claimed" && (issue.assigned || discussionAvailable);
  const likelyResolved = issue.helpStatus === "resolved" && discussionAvailable;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <RepositoryHealthTooltip issue={issue} />
      <ResponsivenessTooltip issue={issue} />
      {issue.hacktoberfest ? (
        <Badge className="border-sky-500/20 bg-sky-500/10 text-sky-700 dark:text-sky-400">
          {issue.hacktoberfestSource === "repo-topic"
            ? "Hacktoberfest repo"
            : "Hacktoberfest label"}
        </Badge>
      ) : null}
      <TrendingTooltip issue={issue} />
      <QualityTooltip issue={issue} />
      {needsHelp ? (
        <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20">
          Needs Help
        </Badge>
      ) : null}
      {possiblyClaimed ? (
        <Badge className="bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20">
          Possibly Claimed
        </Badge>
      ) : null}
      {likelyResolved ? (
        <Badge className="bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20">
          Likely Resolved
        </Badge>
      ) : null}
    </div>
  );
}

function getLinkedPullRequestText(issue: Issue) {
  if (issue.enrichment?.linkedPullRequests === false) return "Unavailable";
  return issue.linkedPrCount ?? "-";
}

export function IssueCard({
  issue,
  isSaved = false,
  matchSignals = [],
  onOpen,
  onSaveChange,
  onDismiss,
}: Readonly<{
  issue: Issue;
  isSaved?: boolean;
  matchSignals?: string[];
  onOpen?: (issue: Issue) => void;
  onSaveChange?: (issue: Issue, saved: boolean) => void;
  onDismiss?: (issue: Issue, reason: string) => void;
}>) {
  return (
    <Card>
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <a
            href={issue.repoUrl}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            {issue.repo}
          </a>
          <IssueBadges issue={issue} />
        </div>
        <CardTitle className="text-lg leading-7">
          <a href={issue.url} target="_blank" rel="noreferrer" className="hover:underline">
            {issue.title}
          </a>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {issue.classification?.signals.length ? (
          <div className="flex flex-wrap gap-2" aria-label="Classification signals">
            {issue.classification.signals.map((signal) => (
              <Badge key={signal} variant="secondary">
                {signal}
              </Badge>
            ))}
          </div>
        ) : null}
        {matchSignals.length > 0 ? (
          <div className="flex flex-wrap gap-2" aria-label="Recommendation matches">
            {matchSignals.map((signal) => (
              <Badge key={signal} variant="secondary">
                {signal}
              </Badge>
            ))}
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {issue.labels.slice(0, 6).map((label) => (
            <Badge key={label} variant="outline">
              {label}
            </Badge>
          ))}
        </div>

        <Separator />

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Star className="h-4 w-4" />
              {issue.stars === null ? "-" : compactNumber(issue.stars)}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <MessageCircle className="h-4 w-4" />
              {issue.comments}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <GitPullRequest className="h-4 w-4" />
              {getLinkedPullRequestText(issue)}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Clock3 className="h-4 w-4" />
              {relativeDate(issue.updatedAt)}
            </span>
            <span>{issue.assigned ? "Assigned" : "Unassigned"}</span>
          </div>

          <div className="flex gap-2">
            {onSaveChange ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => onSaveChange(issue, !isSaved)}
              >
                <Bookmark className={isSaved ? "h-4 w-4 fill-current" : "h-4 w-4"} />
                {isSaved ? "Saved" : "Save"}
              </Button>
            ) : null}
            {onDismiss ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    Dismiss
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onDismiss(issue, "Not interested")}>
                    Not interested
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onDismiss(issue, "Wrong technology")}>
                    Wrong technology
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onDismiss(issue, "Too difficult")}>
                    Too difficult
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onDismiss(issue, "Already claimed")}>
                    Already claimed
                  </DropdownMenuItem>
                  <Separator className="my-1" />
                  <DropdownMenuItem onClick={() => onDismiss(issue, "Hide this repository")} className="text-red-600 focus:text-red-600">
                    Hide this repository
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
            <Button asChild size="sm" className="gap-2">
              <a
                href={issue.url}
                target="_blank"
                rel="noreferrer"
                onClick={() => onOpen?.(issue)}
              >
                Open issue
                <ArrowUpRight className="h-4 w-4" />
              </a>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
