"use client";

import { useEffect, useRef, useState, type SubmitEvent } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Building2,
  ChevronLeft,
  ChevronRight,
  GitFork,
  Info,
  Search,
  Star,
} from "lucide-react";
import { DashboardNavigation } from "@/components/dashboard-navigation";
import { ThemeToggle } from "@/components/theme-toggle";
import { AuthControls } from "@/components/auth-controls";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LoadingResults } from "@/features/issues/components/loading-results";
import { AutocompleteInput } from "./autocomplete-input";
import { OrganizationIssueCard } from "./organization-issue-card";
import { fetchOrganizationData, OrganizationClientError } from "../client";
import {
  DEFAULT_ORGANIZATION_FILTERS,
  organizationSearchParams,
  readOrganizationFilters,
  validateOrganizationFilters,
} from "../filters";
import type {
  OrganizationIssueFilters,
  OrganizationIssueSearchResponse,
  OrganizationSuggestion,
  OrgRepositorySuggestion,
  TechnologySuggestion,
} from "../types";

const STATUS_OPTIONS: ReadonlyArray<{
  value: OrganizationIssueFilters["status"];
  label: string;
}> = [
  { value: "open", label: "Open" },
  { value: "closed", label: "Closed" },
  { value: "all", label: "All statuses" },
];

const SORT_OPTIONS: ReadonlyArray<{
  value: OrganizationIssueFilters["sort"];
  label: string;
}> = [
  { value: "updated", label: "Recently updated" },
  { value: "created", label: "Newest" },
  { value: "comments", label: "Most comments" },
];

function SearchSession({ query }: Readonly<{ query: string }>) {
  const router = useRouter();
  const [filters, setFilters] = useState(() =>
    query
      ? readOrganizationFilters(new URLSearchParams(query))
      : DEFAULT_ORGANIZATION_FILTERS,
  );
  const [data, setData] = useState<OrganizationIssueSearchResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(!!query);
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

    async function run() {
      const parsedFilters = readOrganizationFilters(new URLSearchParams(query));
      const validation = validateOrganizationFilters(parsedFilters);
      setError(validation ?? "");
      if (validation) {
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const result =
          await fetchOrganizationData<OrganizationIssueSearchResponse>(
            `/api/organizations/issues?${query}`,
            { signal: abort.signal },
          );
        if (abort.signal.aborted) return;
        setData(result);
        setLoading(false);
      } catch (err) {
        if (abort.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Search failed.");
        if (err instanceof OrganizationClientError) {
          setCooldown(err.retryAfter);
        }
        setLoading(false);
      }
    }

    void run();
    return () => abort.abort();
  }, [query, attempt]);

  function updateFilter<K extends keyof OrganizationIssueFilters>(
    key: K,
    value: OrganizationIssueFilters[K],
  ) {
    controller.current?.abort();
    setLoading(false);
    setFilters((current) => {
      const next = { ...current, [key]: value, page: 1 };
      // If organization changed, clear repository if it doesn't belong to the new org
      if (key === "org" && current.repository) {
        next.repository = "";
      }
      return next;
    });
  }

  function navigate(next: OrganizationIssueFilters) {
    const validation = validateOrganizationFilters(next);
    if (validation) {
      setError(validation);
      return;
    }
    const params = organizationSearchParams(next).toString();
    if (params === query) setAttempt((value) => value + 1);
    else router.push(`/organizations?${params}`, { scroll: false });
  }

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    navigate({ ...filters, page: 1 });
  }

  async function fetchOrgSuggestions(q: string) {
    const res = await fetchOrganizationData<{
      organizations: OrganizationSuggestion[];
    }>(`/api/suggestions/organizations?query=${encodeURIComponent(q)}`);
    return res.organizations;
  }

  async function fetchTechSuggestions(q: string) {
    const res = await fetchOrganizationData<{
      technologies: TechnologySuggestion[];
    }>(`/api/suggestions/technologies?query=${encodeURIComponent(q)}`);
    return res.technologies;
  }

  async function fetchRepoSuggestions(q: string) {
    if (!filters.org.trim()) return [];
    const res = await fetchOrganizationData<{
      repositories: OrgRepositorySuggestion[];
    }>(
      `/api/suggestions/repositories?org=${encodeURIComponent(filters.org)}&query=${encodeURIComponent(q)}`,
    );
    return res.repositories;
  }

  return (
    <>
      <form
        onSubmit={submit}
        className="grid min-w-0 gap-3 rounded-lg border bg-card p-3 shadow-sm sm:grid-cols-2 lg:grid-cols-3"
      >
        <div className="relative min-w-0">
          <label htmlFor="org-input" className="sr-only">
            Organization
          </label>
          <AutocompleteInput<OrganizationSuggestion>
            id="org-input"
            ariaLabel="Organization"
            icon={<Building2 className="size-4" />}
            value={filters.org}
            onChange={(val) => updateFilter("org", val)}
            fetchSuggestions={fetchOrgSuggestions}
            getSuggestionValue={(item) => item.login}
            getSuggestionKey={(item) => item.login}
            placeholder="Organization (e.g. vercel)"
            required
            maxLength={39}
            emptyMessage="No organizations found"
            renderSuggestion={(item) => (
              <div className="flex items-center gap-2.5">
                {item.avatarUrl ? (
                  <Image
                    src={item.avatarUrl}
                    alt={item.login}
                    width={20}
                    height={20}
                    className="rounded-full shrink-0"
                  />
                ) : (
                  <Building2 className="size-5 shrink-0 text-muted-foreground" />
                )}
                <div className="flex flex-col overflow-hidden">
                  <span className="font-medium leading-tight">{item.login}</span>
                  {item.description && (
                    <span className="truncate text-xs text-muted-foreground">
                      {item.description}
                    </span>
                  )}
                </div>
              </div>
            )}
          />
        </div>

        <div className="relative min-w-0">
          <label htmlFor="tech-input" className="sr-only">
            Technology
          </label>
          <AutocompleteInput<TechnologySuggestion>
            id="tech-input"
            ariaLabel="Technology"
            icon={<Search className="size-4" />}
            value={filters.tech}
            onChange={(val) => updateFilter("tech", val)}
            fetchSuggestions={fetchTechSuggestions}
            getSuggestionValue={(item) => item.name}
            getSuggestionKey={(item) => item.name}
            placeholder="Technology (e.g. TypeScript)"
            required
            maxLength={80}
            emptyMessage="No technologies found"
            renderSuggestion={(item) => (
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{item.name}</span>
                <Badge variant="outline" className="text-[10px] capitalize">
                  {item.type}
                </Badge>
              </div>
            )}
          />
        </div>

        <div className="relative min-w-0">
          <label htmlFor="repo-input" className="sr-only">
            Repository (optional)
          </label>
          <AutocompleteInput<OrgRepositorySuggestion>
            id="repo-input"
            ariaLabel="Repository (optional)"
            icon={<GitFork className="size-4" />}
            value={filters.repository}
            onChange={(val) => updateFilter("repository", val)}
            fetchSuggestions={fetchRepoSuggestions}
            getSuggestionValue={(item) => item.name}
            getSuggestionKey={(item) => item.fullName}
            disabled={!filters.org.trim()}
            placeholder={
              filters.org.trim()
                ? `Repository in ${filters.org} (optional)`
                : "Select an organization first"
            }
            maxLength={140}
            emptyMessage="No repositories found in this organization"
            renderSuggestion={(item) => (
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-col overflow-hidden">
                  <span className="font-medium leading-tight">{item.name}</span>
                  {item.description && (
                    <span className="truncate text-xs text-muted-foreground">
                      {item.description}
                    </span>
                  )}
                </div>
                <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                  <Star className="size-3 text-amber-500 fill-amber-500" />
                  {item.stars}
                </span>
              </div>
            )}
          />
        </div>

        <div className="relative min-w-0">
          <label htmlFor="status-select" className="sr-only">
            Status
          </label>
          <Select
            value={filters.status}
            onValueChange={(val) =>
              updateFilter("status", val as OrganizationIssueFilters["status"])
            }
          >
            <SelectTrigger
              id="status-select"
              className="h-11 w-full"
              size="lg"
              aria-label="Status"
            >
              <SelectValue>
                {STATUS_OPTIONS.find((o) => o.value === filters.status)?.label}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="relative min-w-0">
          <label htmlFor="sort-select" className="sr-only">
            Sort by
          </label>
          <Select
            value={filters.sort}
            onValueChange={(val) =>
              updateFilter("sort", val as OrganizationIssueFilters["sort"])
            }
          >
            <SelectTrigger
              id="sort-select"
              className="h-11 w-full"
              size="lg"
              aria-label="Sort by"
            >
              <SelectValue>
                {SORT_OPTIONS.find((o) => o.value === filters.sort)?.label}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button
          className="h-11 w-full gap-2 sm:col-span-2 lg:col-span-1"
          type="submit"
          aria-label="Search issues"
          disabled={loading || cooldown !== null}
        >
          <Search className="size-4" />
          {loading ? "Searching…" : cooldown !== null ? "Cooldown…" : "Search"}
        </Button>
      </form>

      <p className="text-sm text-muted-foreground">
        Search open-source issues across an organization&apos;s repositories by technology.
        Auto-suggestions are enabled for organization, technology, and repositories.
      </p>

      {error && (
        <Card className="border-destructive/30 bg-destructive/10 text-destructive dark:border-destructive/40">
          <CardContent className="p-4 text-sm font-medium">
            {error}
            {cooldown !== null && (
              <span className="block text-xs font-normal opacity-90 mt-1">
                Rate limited by GitHub. Retry enabled in {cooldown}s.
              </span>
            )}
          </CardContent>
        </Card>
      )}

      {data?.notices && data.notices.length > 0 && (
        <div className="space-y-1">
          {data.notices.map((notice) => (
            <div
              key={notice}
              className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/40 px-3 py-2 text-xs text-muted-foreground"
            >
              <Info className="size-3.5 shrink-0" />
              <span>{notice}</span>
            </div>
          ))}
        </div>
      )}

      {loading && <LoadingResults />}

      {!loading && data && (
        <section className="space-y-4" aria-label="Search results">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
            <span>
              Found <strong className="text-foreground">{data.totalCount}</strong>{" "}
              issues in <strong className="text-foreground">{filters.org}</strong>
            </span>
            <span>Page {data.page}</span>
          </div>

          {data.issues.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <p className="text-base font-medium">No issues found.</p>
                <p className="text-xs mt-1">
                  Try broadening your search or choosing a different technology or repository.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3">
              {data.issues.map((issue) => (
                <OrganizationIssueCard key={issue.id} issue={issue} />
              ))}
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            <Button
              variant="outline"
              size="sm"
              disabled={data.page <= 1 || loading}
              onClick={() => navigate({ ...filters, page: data.page - 1 })}
            >
              <ChevronLeft className="size-4 mr-1" /> Previous
            </Button>
            <span className="text-xs text-muted-foreground">
              Page {data.page}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={!data.hasMore || loading}
              onClick={() => navigate({ ...filters, page: data.page + 1 })}
            >
              Next <ChevronRight className="size-4 ml-1" />
            </Button>
          </div>
        </section>
      )}

      {!query && (
        <Card className="border-dashed bg-muted/20">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
            <Building2 className="size-10 mb-3 text-muted-foreground/60" />
            <h3 className="text-base font-medium text-foreground">
              Explore open-source issues by organization
            </h3>
            <p className="text-xs max-w-sm mt-1">
              Select or type an organization and technology to discover issues ready for contribution.
              You can also narrow the search to a specific repository.
            </p>
          </CardContent>
        </Card>
      )}
    </>
  );
}

export function OrganizationDashboard() {
  const searchParams = useSearchParams();
  const query = searchParams.toString();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="mb-8 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <DashboardNavigation current="organizations" />
            </div>
            <div className="flex items-center gap-3">
              <AuthControls />
              <ThemeToggle />
            </div>
          </div>
          <div className="max-w-3xl space-y-2">
            <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              Find issues by organization.
            </h1>
            <p className="text-sm text-muted-foreground">
              Discover issues across top open-source organizations filtered by your preferred technology.
            </p>
          </div>
        </header>

        <main className="space-y-6">
          <SearchSession key={query} query={query} />
        </main>
      </div>
    </div>
  );
}
