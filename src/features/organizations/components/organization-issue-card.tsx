"use client";

import Image from "next/image";
import { CircleDot, MessageCircle, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { compactNumber, relativeDate } from "@/features/issues/lib/format";
import type { OrganizationIssue } from "../types";

export function OrganizationIssueCard({
  issue,
}: Readonly<{ issue: OrganizationIssue }>) {
  const isOpen = issue.status === "open";

  return (
    <Card className="flex flex-col justify-between transition-shadow hover:shadow-md">
      <CardHeader className="space-y-2 pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="font-mono font-medium text-foreground">
            {issue.repository} #{issue.number}
          </span>
          <div className="flex items-center gap-1.5">
            <Badge
              variant={isOpen ? "default" : "secondary"}
              className={
                isOpen
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                  : "bg-muted text-muted-foreground"
              }
            >
              <CircleDot className="mr-1 size-3" />
              {isOpen ? "Open" : "Closed"}
            </Badge>
          </div>
        </div>
        <CardTitle className="text-base font-semibold leading-snug">
          <a
            href={issue.url}
            target="_blank"
            rel="noreferrer"
            className="group inline-flex items-start gap-1 hover:text-primary hover:underline"
          >
            <span>{issue.title}</span>
            <ExternalLink className="mt-0.5 size-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
          </a>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        {issue.labels.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {issue.labels.map((label) => (
              <Badge
                key={label.name}
                variant="outline"
                className="text-xs font-normal"
              >
                {label.name}
              </Badge>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-2.5 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            {issue.authorAvatarUrl ? (
              <Image
                src={issue.authorAvatarUrl}
                alt={issue.author}
                width={16}
                height={16}
                className="rounded-full"
              />
            ) : null}
            <span>{issue.author}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1">
              <MessageCircle className="size-3" />
              {compactNumber(issue.comments)}
            </span>
            <span>Updated {relativeDate(issue.updatedAt)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
