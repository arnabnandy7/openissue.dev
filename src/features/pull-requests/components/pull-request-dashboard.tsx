"use client";

import { useEffect, useRef, useState, type SubmitEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { GitPullRequest, Search } from "lucide-react";
import { DashboardNavigation } from "@/components/dashboard-navigation";
import { ThemeToggle } from "@/components/theme-toggle";
import { AuthControls } from "@/components/auth-controls";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoadingResults } from "@/features/issues/components/loading-results";
import { PullRequestCard } from "./pull-request-card";
import { fetchPullRequestData, PullRequestClientError } from "../client";
import {
  DEFAULT_PR_FILTERS,
  readPullRequestFilters,
  validatePullRequestFilters,
  pullRequestSearchParams,
} from "../filters";
import type {
  PullRequestEnrichment,
  PullRequestFilters,
  PullRequestSearchResponse,
} from "../types";

const SELECT_CLASS =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring";

function SearchSession({ query }: Readonly<{ query: string }>) {
  const router = useRouter();
  const [filters, setFilters] = useState(() =>
    query
      ? readPullRequestFilters(new URLSearchParams(query))
      : DEFAULT_PR_FILTERS,
  );
  const [data, setData] = useState<PullRequestSearchResponse | null>(null);
  const [enrichment, setEnrichment] = useState<PullRequestEnrichment | null>(
    null,
  );
  const [error, setError] = useState("");
  const [enrichmentError, setEnrichmentError] = useState("");
  const [loading, setLoading] = useState(!!query);
  const [enriching, setEnriching] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [cooldown, setCooldown] = useState<number | null>(null);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => {
    if (cooldown === null) return;
    const timer = setTimeout(() => setCooldown(null), cooldown * 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  useEffect(() => {
    if (!query) return;
    const abort = new AbortController();
    controller.current = abort;
    async function loadInsights(result: PullRequestSearchResponse) {
      setEnriching(true);
      try {
        const insights = await fetchPullRequestData<PullRequestEnrichment>(
          "/api/pull-requests/enrichment",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(
              result.pullRequests.map(({ id, repository }) => ({
                id,
                repository,
              })),
            ),
            signal: abort.signal,
          },
        );
        if (!abort.signal.aborted) setEnrichment(insights);
      } catch (error) {
        if (!abort.signal.aborted)
          setEnrichmentError(
            error instanceof Error ? error.message : "Insights unavailable.",
          );
      } finally {
        if (!abort.signal.aborted) setEnriching(false);
      }
    }
    async function run() {
      const validation = validatePullRequestFilters(
        readPullRequestFilters(new URLSearchParams(query)),
      );
      setError(validation ?? "");
      if (validation) {
        setLoading(false);
        return;
      }
      setLoading(true);
      setEnrichment(null);
      setEnrichmentError("");
      try {
        const result = await fetchPullRequestData<PullRequestSearchResponse>(
          `/api/pull-requests?${query}`,
          { signal: abort.signal },
        );
        if (abort.signal.aborted) return;
        setData(result);
        setLoading(false);
        if (!result.pullRequests.length) return;
        await loadInsights(result);
      } catch (error) {
        if (abort.signal.aborted) return;
        setError(error instanceof Error ? error.message : "Search failed.");
        if (error instanceof PullRequestClientError)
          setCooldown(error.retryAfter);
        setLoading(false);
      }
    }
    void run();
    return () => abort.abort();
  }, [query, attempt]);

  function updateFilter<K extends keyof PullRequestFilters>(
    key: K,
    value: PullRequestFilters[K],
  ) {
    controller.current?.abort();
    setLoading(false);
    setEnriching(false);
    setFilters((current) => ({ ...current, [key]: value, page: 1 }));
  }

  function navigate(next: PullRequestFilters) {
    const validation = validatePullRequestFilters(next);
    if (validation) {
      setError(validation);
      return;
    }
    const params = pullRequestSearchParams(next).toString();
    if (params === query) setAttempt((value) => value + 1);
    else router.push(`/pull-requests?${params}`, { scroll: false });
  }

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    navigate({ ...filters, page: 1 });
  }

  return (
    <>
      <form
        onSubmit={submit}
        className="grid gap-4 rounded-xl border bg-card p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-6"
      >
        <label className="space-y-2 text-sm font-medium lg:col-span-2">
          Organization
          <Input
            value={filters.org}
            onChange={(event) => updateFilter("org", event.target.value)}
            placeholder="e.g. vercel"
            required
            maxLength={39}
          />
        </label>
        <label className="space-y-2 text-sm font-medium lg:col-span-2">
          Technology
          <Input
            value={filters.tech}
            onChange={(event) => updateFilter("tech", event.target.value)}
            placeholder="e.g. TypeScript, React, Spring Boot"
            required
            maxLength={80}
          />
        </label>
        <label className="space-y-2 text-sm font-medium lg:col-span-2">
          Repository (optional)
          <Input
            value={filters.repository}
            onChange={(event) => updateFilter("repository", event.target.value)}
            placeholder="e.g. vercel/next.js"
            maxLength={140}
          />
        </label>
        <label className="space-y-2 text-sm font-medium lg:col-span-2">
          <span className="block">Status</span>
          <select
            className={SELECT_CLASS}
            value={filters.status}
            onChange={(event) =>
              updateFilter(
                "status",
                event.target.value as PullRequestFilters["status"],
              )
            }
          >
            <option value="open">Open (excluding drafts)</option>
            <option value="draft">Draft</option>
            <option value="merged">Merged</option>
            <option value="closed">Closed without merge</option>
            <option value="all">All statuses</option>
          </select>
        </label>
        <label className="space-y-2 text-sm font-medium lg:col-span-2">
          <span className="block">Sort by</span>
          <select
            className={SELECT_CLASS}
            value={filters.sort}
            onChange={(event) =>
              updateFilter(
                "sort",
                event.target.value as PullRequestFilters["sort"],
              )
            }
          >
            <option value="updated">Recently updated</option>
            <option value="created">Newest</option>
            <option value="comments">Most comments</option>
          </select>
        </label>
        <div className="flex items-end lg:col-span-2">
          <Button
            className="w-full"
            type="submit"
            disabled={loading || cooldown !== null}
          >
            <Search className="size-4" />
            {loading ? "Searching…" : "Search pull requests"}
          </Button>
        </div>
      </form>
      <p className="text-sm text-muted-foreground">
        Technology matches the repository’s language or topic. Public
        repositories only.
      </p>
      {error && (
        <div
          role="alert"
          className="space-y-2 rounded-lg border border-destructive/30 p-4"
        >
          <p>{error}</p>
          {cooldown !== null ? (
            <p className="text-sm">Search is paused for {cooldown} seconds.</p>
          ) : (
            <Button
              variant="outline"
              onClick={() => navigate({ ...filters, page: 1 })}
            >
              Retry search
            </Button>
          )}
        </div>
      )}
      {loading && (
        <div>
          <output className="sr-only">Searching pull requests</output>
          <LoadingResults />
        </div>
      )}
      {!loading && !data && !error && (
        <div className="rounded-xl border border-dashed py-16 text-center">
          <GitPullRequest className="mx-auto mb-4 size-8 text-muted-foreground" />
          <h2 className="text-lg font-medium">
            Explore pull requests across an organization
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Choose an organization and technology to start searching.
          </p>
        </div>
      )}
      {data && !loading && (
        <section className="space-y-5" aria-label="Pull request results">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-semibold">
              {data.totalCount.toLocaleString()} matching pull requests
            </h2>
            <output className="text-sm text-muted-foreground">
              Page {data.page}
              {enriching ? " · Loading insights…" : ""}
            </output>
          </div>
          <div
            className="space-y-1 text-sm text-muted-foreground"
            aria-live="polite"
          >
            {[
              ...data.notices,
              ...(enrichment?.notices ?? []),
              ...(enrichmentError ? [enrichmentError] : []),
            ].map((notice) => (
              <p key={notice}>{notice}</p>
            ))}
          </div>
          {!data.pullRequests.length && (
            <p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
              No matching pull requests. Try another technology, repository, or
              status.
            </p>
          )}
          <div className="grid items-start gap-4 lg:grid-cols-2">
            {data.pullRequests.map((pr) => (
              <PullRequestCard
                key={pr.id}
                pullRequest={pr}
                insights={enrichment?.repositories[pr.repository]}
                review={enrichment?.reviews[pr.id]}
                enriching={enriching}
              />
            ))}
          </div>
          <div className="flex justify-center gap-3">
            <Button
              variant="outline"
              disabled={data.page <= 1 || cooldown !== null}
              onClick={() =>
                navigate({
                  ...readPullRequestFilters(new URLSearchParams(query)),
                  page: data.page - 1,
                })
              }
            >
              Previous page
            </Button>
            <Button
              variant="outline"
              disabled={!data.hasMore || cooldown !== null}
              onClick={() =>
                navigate({
                  ...readPullRequestFilters(new URLSearchParams(query)),
                  page: data.page + 1,
                })
              }
            >
              Next page
            </Button>
          </div>
        </section>
      )}
    </>
  );
}

export function PullRequestDashboard() {
  const params = useSearchParams();
  return (
    <main className="min-h-screen bg-background">
      <header className="border-b bg-muted/30">
        <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Badge variant="secondary">
              <GitPullRequest className="size-4" />
              OSS Pull Request Finder
            </Badge>
            <div className="flex items-center gap-2">
              <AuthControls />
              <ThemeToggle />
            </div>
          </div>
          <DashboardNavigation current="pull-requests" />
          <div className="max-w-3xl space-y-3">
            <h1 className="text-4xl font-semibold sm:text-5xl">
              Find pull requests by org and tech.
            </h1>
            <p className="text-base leading-7 text-muted-foreground sm:text-lg">
              Explore open-source changes with repository health, maintainer
              responsiveness, reviews, and contribution guides.
            </p>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
        <SearchSession key={params.toString()} query={params.toString()} />
      </div>
    </main>
  );
}
