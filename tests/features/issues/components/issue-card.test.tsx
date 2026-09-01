// @vitest-environment jsdom

import type { ReactElement } from "react";
import {
  cleanup,
  fireEvent,
  render as testingLibraryRender,
  screen,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { IssueCard } from "@/features/issues/components/issue-card";
import { LoadingResults } from "@/features/issues/components/loading-results";
import { Metric } from "@/features/issues/components/metric";
import type { Issue } from "@/features/issues/types/search";

function render(ui: ReactElement) {
  return testingLibraryRender(<TooltipProvider>{ui}</TooltipProvider>);
}

function issue(overrides: Partial<Issue> = {}): Issue {
  return {
    id: "issue-1",
    title: "Improve accessibility",
    url: "https://github.com/acme/repo/issues/1",
    repo: "acme/repo",
    repoUrl: "https://github.com/acme/repo",
    stars: 12500,
    comments: 3,
    labels: ["help wanted", "a", "b", "c", "d", "e", "hidden"],
    updatedAt: "2026-08-18T00:00:00.000Z",
    createdAt: "2026-08-01T00:00:00.000Z",
    assigned: false,
    linkedPrCount: 2,
    hacktoberfest: true,
    hacktoberfestSource: "repo-topic",
    qualityScore: 80,
    repositoryHealth: {
      score: 82,
      label: "active",
      signals: ["Pushed within 30 days", "Issue tracker enabled"],
    },
    helpStatus: "open",
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("issue presentation", () => {
  it("renders a high-quality open Hacktoberfest issue", () => {
    vi.setSystemTime(new Date("2026-08-19T00:00:00.000Z"));
    render(<IssueCard issue={issue()} />);

    expect(screen.getByText("12.5K")).toBeTruthy();
    expect(screen.getByText("82 active")).toHaveProperty(
      "title",
      "Pushed within 30 days · Issue tracker enabled",
    );
    expect(screen.getByText("Hacktoberfest repo")).toBeTruthy();
    expect(screen.getByText("Needs Help")).toBeTruthy();
    expect(screen.queryByText("hidden")).toBeNull();
    vi.useRealTimers();
  });

  it("renders medium, claimed, nullable metadata", () => {
    render(
      <IssueCard
        issue={issue({
          qualityScore: 50,
          helpStatus: "claimed",
          hacktoberfestSource: "issue-label",
          stars: null,
          linkedPrCount: null,
          assigned: true,
          repositoryHealth: {
            score: 50,
            label: "moderate",
            signals: ["Last push 60 days ago"],
          },
        })}
      />,
    );
    expect(screen.getByText("Hacktoberfest label")).toBeTruthy();
    expect(screen.getByText("Possibly Claimed")).toBeTruthy();
    expect(screen.getByText("Assigned")).toBeTruthy();
  });

  it("renders low-quality resolved non-Hacktoberfest issues", () => {
    render(
      <IssueCard
        issue={issue({
          qualityScore: 20,
          helpStatus: "resolved",
          hacktoberfest: false,
          hacktoberfestSource: null,
          repositoryHealth: {
            score: 20,
            label: "stale",
            signals: ["No push within a year"],
          },
        })}
      />,
    );
    expect(screen.getByText("20 quality")).toBeTruthy();
    expect(screen.getByText("20 stale")).toBeTruthy();
    expect(screen.getByText("Likely Resolved")).toBeTruthy();
  });

  it("renders unknown repository health", () => {
    render(
      <IssueCard
        issue={issue({
          repositoryHealth: {
            score: null,
            label: "unknown",
            signals: ["Repository metadata unavailable"],
          },
        })}
      />,
    );

    expect(screen.getByText("Health unknown")).toBeTruthy();
  });

  it("renders classification and responsiveness signals", () => {
    render(
      <IssueCard
        issue={issue({
          repositoryResponsiveness: {
            status: "responsive",
            sampleDays: 90,
            sampleSize: 12,
            signals: ["Median response time: 2 days"],
          },
          classification: {
            experience: ["beginner"],
            contributionTypes: ["bugfix"],
            smallScope: true,
            signals: ["Beginner friendly", "Small scope"],
          },
        })}
      />,
    );

    expect(screen.getByText("responsive maintainers")).toBeTruthy();
    expect(screen.getByText("Beginner friendly")).toBeTruthy();
    expect(screen.getByText("Small scope")).toBeTruthy();
  });

  it("renders contribution readiness signals and documentation links", () => {
    render(
      <IssueCard
        issue={issue({
          contributionReadiness: {
            score: 88,
            status: "ready",
            signals: ["6 of 6 community documents available", "Issue is unassigned"],
            documentation: {
              readme: "https://github.com/acme/repo#readme",
              contributing: "https://github.com/acme/repo/blob/main/CONTRIBUTING.md",
              license: null,
              codeOfConduct: null,
              issueTemplate: null,
              pullRequestTemplate: null,
            },
          },
        })}
      />,
    );

    expect(screen.getByText("Ready to start")).toBeTruthy();
    expect(screen.getByText("Contribution readiness checklist · 88/100")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Contributing guide" })).toHaveProperty(
      "href",
      "https://github.com/acme/repo/blob/main/CONTRIBUTING.md",
    );
  });

  it.each([
    ["ask", "Ask before starting"],
    ["claimed", "Possibly claimed"],
    ["poorlyDocumented", "Poorly documented"],
    ["inactive", "Repository inactive"],
    ["unknown", "Readiness unknown"],
  ] as const)("renders the %s readiness variant", (status, label) => {
    render(
      <IssueCard
        issue={issue({
          contributionReadiness: {
            score: null,
            status,
            signals: ["Community profile unavailable"],
            documentation: {
              readme: null,
              contributing: null,
              license: null,
              codeOfConduct: null,
              issueTemplate: null,
              pullRequestTemplate: null,
            },
          },
        })}
      />,
    );

    expect(screen.getByText(label)).toBeTruthy();
    expect(screen.getByText("Contribution readiness checklist")).toBeTruthy();
  });

  it("renders trending and slow-responsiveness fallback details", async () => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    const user = userEvent.setup();

    render(
      <IssueCard
        issue={issue({
          trendingScore: 72,
          repositoryResponsiveness: {
            status: "slow",
            sampleDays: 90,
            sampleSize: 8,
            signals: ["Maintainer responses are often delayed"],
          },
          enrichment: {
            repositoryMetadata: false,
            discussionAnalysis: true,
            linkedPullRequests: true,
          },
        })}
      />,
    );

    expect(screen.getByText("72 trending")).toBeTruthy();
    expect(screen.getByText("slow maintainers")).toBeTruthy();
    await user.hover(screen.getByText("72 trending"));
    expect(
      await screen.findByText(
        "Repository stars and health were unavailable for this result.",
      ),
    ).toBeTruthy();
  });

  it("does not imply unavailable enrichment was measured", () => {
    render(
      <IssueCard
        issue={issue({
          stars: null,
          linkedPrCount: null,
          enrichment: {
            repositoryMetadata: false,
            discussionAnalysis: false,
            linkedPullRequests: false,
          },
        })}
      />,
    );

    expect(screen.getByText("Unavailable")).toBeTruthy();
    expect(screen.queryByText("Needs Help")).toBeNull();
  });

  it("renders loading placeholders and metrics", () => {
    const { container } = render(<LoadingResults />);
    expect(container.querySelectorAll("[data-slot=card]")).toHaveLength(4);
    cleanup();
    render(<Metric label="Ranked" value="24" />);
    expect(screen.getByText("Ranked")).toBeTruthy();
    expect(screen.getByText("24")).toBeTruthy();
  });

  it("reports authenticated save and open interactions", () => {
    const onOpen = vi.fn();
    const onSaveChange = vi.fn();
    const selectedIssue = issue();
    render(
      <IssueCard
        issue={selectedIssue}
        onOpen={onOpen}
        onSaveChange={onSaveChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    fireEvent.click(screen.getByRole("link", { name: "Open issue" }));
    expect(onSaveChange).toHaveBeenCalledWith(selectedIssue, true);
    expect(onOpen).toHaveBeenCalledWith(selectedIssue);
  });

  it("reports recommendation dismissal feedback", async () => {
    const onDismiss = vi.fn();
    const selectedIssue = issue();
    const user = userEvent.setup();
    render(<IssueCard issue={selectedIssue} onDismiss={onDismiss} />);

    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    await user.click(screen.getByRole("menuitem", { name: "Not interested" }));

    expect(onDismiss).toHaveBeenCalledWith(selectedIssue, "Not interested");
  });
});
