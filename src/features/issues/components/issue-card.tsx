import { ArrowUpRight, Clock3, MessageCircle, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { compactNumber, relativeDate } from "@/features/issues/lib/format";
import type { Issue } from "@/features/issues/types/search";

export function IssueCard({ issue }: { issue: Issue }) {
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
          <Badge variant={issue.qualityScore >= 70 ? "default" : "secondary"}>
            {issue.qualityScore} quality
          </Badge>
        </div>
        <CardTitle className="text-lg leading-7">
          <a href={issue.url} target="_blank" rel="noreferrer" className="hover:underline">
            {issue.title}
          </a>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
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
              <Clock3 className="h-4 w-4" />
              {relativeDate(issue.updatedAt)}
            </span>
            <span>{issue.assigned ? "Assigned" : "Unassigned"}</span>
          </div>

          <Button asChild size="sm" className="gap-2">
            <a href={issue.url} target="_blank" rel="noreferrer">
              Open issue
              <ArrowUpRight className="h-4 w-4" />
            </a>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
