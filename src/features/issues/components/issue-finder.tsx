"use client";

import { FormEvent, useMemo, useState } from "react";
import { GitPullRequest, Search } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { IssueCard } from "@/features/issues/components/issue-card";
import { LoadingResults } from "@/features/issues/components/loading-results";
import { Metric } from "@/features/issues/components/metric";
import {
  LABEL_OPTIONS,
  SORT_OPTIONS,
  TECH_EXAMPLES,
} from "@/features/issues/data/search-options";
import { compactNumber } from "@/features/issues/lib/format";
import type { SearchResponse } from "@/features/issues/types/search";

export function IssueFinder() {
  const [tech, setTech] = useState("Java");
  const [label, setLabel] = useState("help-wanted");
  const [sort, setSort] = useState("updated");
  const [data, setData] = useState<SearchResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(false);

  const selectedLabel = useMemo(
    () => LABEL_OPTIONS.find((item) => item.value === label) ?? LABEL_OPTIONS[0],
    [label],
  );

  async function searchIssues(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();

    if (!tech.trim()) {
      setError("Enter a technology to search.");
      return;
    }

    setIsLoading(true);
    setCooldown(true);
    setError(null);

    const params = new URLSearchParams({
      tech: tech.trim(),
      label,
      sort,
    });

    try {
      const response = await fetch(`/api/search?${params.toString()}`);
      const payload = (await response.json()) as SearchResponse;

      if (!response.ok) {
        throw new Error(payload.error ?? "Search failed.");
      }

      setData(payload);
    } catch (searchError) {
      setError(
        searchError instanceof Error
          ? searchError.message
          : "Search failed. Try another technology or label.",
      );
    } finally {
      setIsLoading(false);
      setTimeout(() => {
        setCooldown(false);
      }, 3000);
    }
  }

  return (
    <main className="min-h-screen bg-background">
      <section className="border-b bg-muted/30">
        <div className="mx-auto grid w-full max-w-7xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:px-8">
          <div className="flex min-w-0 flex-col justify-between gap-8">
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary" className="gap-1.5">
                    <GitPullRequest className="h-3.5 w-3.5" />
                    OSS Issue Finder
                  </Badge>
                  <Badge variant="outline">GitHub Search API</Badge>
                </div>
                <ThemeToggle />
              </div>
              <div className="max-w-3xl space-y-4">
                <h1 className="text-4xl font-semibold tracking-normal text-foreground sm:text-5xl">
                  Find active open-source issues by tech.
                </h1>
                <p className="max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
                  Search contributor-friendly GitHub issues with labels like help wanted,
                  good first issue, up-for-grabs, and documentation.
                </p>
              </div>
            </div>

            <form
              onSubmit={searchIssues}
              className="grid gap-3 rounded-lg border bg-card p-3 shadow-sm sm:grid-cols-[minmax(180px,1fr)_190px_170px_auto]"
            >
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={tech}
                  onChange={(event) => setTech(event.target.value)}
                  placeholder="Java, React, Kubernetes..."
                  className="h-11 pl-9"
                  aria-label="Technology"
                />
              </div>

              <Select value={label} onValueChange={setLabel}>
                <SelectTrigger className="h-11 w-full" size="lg" aria-label="Issue label">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LABEL_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={sort} onValueChange={setSort}>
                <SelectTrigger className="h-11 w-full" size="lg" aria-label="Sort results">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SORT_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button type="submit" className="h-11 gap-2" disabled={isLoading || cooldown}>
                <Search className="h-4 w-4" />
                {cooldown && !isLoading ? "Cooldown..." : "Search"}
              </Button>
            </form>
          </div>

          <Card className="self-end">
            <CardHeader>
              <CardTitle className="text-base">Quality score</CardTitle>
              <CardDescription>
                Results are boosted for recency, stars, clear labels, low comment count,
                and unassigned issues.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 text-sm">
              <Metric label="Label" value={selectedLabel.label} />
              <Metric label="Sort" value={sort === "created" ? "newest" : sort} />
              <Metric label="Results" value={data ? compactNumber(data.totalCount) : "-"} />
              <Metric
                label="GitHub token"
                value={data?.tokenConfigured ? "configured" : "not set"}
              />
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[260px_minmax(0,1fr)] lg:px-8">
        <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Quick searches</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {TECH_EXAMPLES.map((example) => (
                <Button
                  key={example}
                  type="button"
                  variant={tech === example ? "default" : "outline"}
                  size="sm"
                  onClick={() => setTech(example)}
                >
                  {example}
                </Button>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Supported labels</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {LABEL_OPTIONS.map((option) => {
                const Icon = option.icon;

                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setLabel(option.value)}
                    className="flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors hover:bg-accent"
                  >
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{option.label}</span>
                  </button>
                );
              })}
            </CardContent>
          </Card>
        </aside>

        <div className="space-y-4">
          {error ? (
            <Card className="border-destructive/40">
              <CardHeader>
                <CardTitle className="text-base text-destructive">Search failed</CardTitle>
                <CardDescription>{error}</CardDescription>
              </CardHeader>
            </Card>
          ) : null}

          {data ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold">Ranked issues</h2>
                <p className="text-sm text-muted-foreground">{data.query}</p>
              </div>
              <Badge variant="secondary">{compactNumber(data.totalCount)} GitHub matches</Badge>
            </div>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Ready when you are</CardTitle>
                <CardDescription>
                  Run a search to pull live issue data from GitHub.
                </CardDescription>
              </CardHeader>
            </Card>
          )}

          {isLoading ? <LoadingResults /> : null}

          {!isLoading && data?.issues.length === 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">No matching issues</CardTitle>
                <CardDescription>
                  Try a broader technology, another label, or recently updated sorting.
                </CardDescription>
              </CardHeader>
            </Card>
          ) : null}

          {!isLoading && data?.issues.map((issue) => <IssueCard key={issue.id} issue={issue} />)}
        </div>
      </section>
    </main>
  );
}
