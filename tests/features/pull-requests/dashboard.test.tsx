// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const navigation = vi.hoisted(() => ({ query: "", push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(navigation.query),
  useRouter: () => ({ push: navigation.push }),
}));
vi.mock("@/components/auth-controls", () => ({ AuthControls: () => null }));
vi.mock("@/components/theme-toggle", () => ({ ThemeToggle: () => null }));
import { PullRequestDashboard } from "@/features/pull-requests/components/pull-request-dashboard";
import { PullRequestCard } from "@/features/pull-requests/components/pull-request-card";
import type { PullRequest } from "@/features/pull-requests/types";

const pr: PullRequest = {
  id: "PR_1",
  number: 1,
  title: "Improve widget rendering",
  url: "https://github.com/acme/widgets/pull/1",
  repository: "acme/widgets",
  author: "alice",
  assignees: ["bob"],
  status: "open",
  labels: ["bug"],
  comments: 3,
  createdAt: "2026-09-01T00:00:00Z",
  updatedAt: "2026-09-02T00:00:00Z",
};
const result = {
  pullRequests: [pr],
  totalCount: 50,
  page: 1,
  hasMore: true,
  query: "is:pr",
  notices: [],
  tokenConfigured: true,
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });
beforeEach(() => {
  navigation.query = "";
  navigation.push.mockReset();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("PR dashboard", () => {
  it("shows an empty state and submits bookmarkable organization and technology filters", () => {
    render(<PullRequestDashboard />);
    expect(
      screen.getByText("Explore pull requests across an organization"),
    ).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Organization"), {
      target: { value: "acme" },
    });
    fireEvent.change(screen.getByLabelText("Technology"), {
      target: { value: "React" },
    });
    fireEvent.change(screen.getByLabelText("Repository (optional)"), {
      target: { value: "acme/widgets" },
    });
    fireEvent.change(screen.getByLabelText("Status"), {
      target: { value: "merged" },
    });
    fireEvent.change(screen.getByLabelText("Sort by"), {
      target: { value: "created" },
    });
    fireEvent.submit(
      screen
        .getByRole("button", { name: "Search pull requests" })
        .closest("form")!,
    );
    expect(navigation.push).toHaveBeenCalledWith(
      "/pull-requests?org=acme&tech=React&repository=acme%2Fwidgets&status=merged&sort=created&page=1",
      { scroll: false },
    );
  });
  it("restores URL filters and displays basic results while enrichment is pending", async () => {
    navigation.query = "org=acme&tech=React&status=open&sort=updated&page=1";
    let finish!: (value: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(json(result))
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              finish = resolve;
            }),
        ),
    );
    render(<PullRequestDashboard />);
    expect(
      await screen.findByRole("link", { name: /Improve widget rendering/ }),
    ).toBeTruthy();
    expect(screen.getByText("Loading repository insights…")).toBeTruthy();
    expect(screen.getByLabelText("Organization")).toHaveProperty(
      "value",
      "acme",
    );
    await act(async () =>
      finish(
        json({
          repositories: {},
          reviews: { PR_1: null },
          notices: ["Partial insights"],
        }),
      ),
    );
    expect(screen.getByText("Review: Unknown")).toBeTruthy();
    expect(screen.getByText("Partial insights")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(navigation.push.mock.calls[0][0]).toContain("page=2");
  });
  it("aborts stale requests when the URL changes and ignores late results", async () => {
    navigation.query = "org=acme&tech=React";
    let finish!: (value: Response) => void;
    const fetch = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      )
      .mockResolvedValue(
        json({ ...result, pullRequests: [], totalCount: 0, hasMore: false }),
      );
    vi.stubGlobal("fetch", fetch);
    const view = render(<PullRequestDashboard />);
    const signal = fetch.mock.calls[0][1].signal as AbortSignal;
    navigation.query = "org=acme&tech=Python";
    view.rerender(<PullRequestDashboard />);
    expect(signal.aborted).toBe(true);
    expect(await screen.findByText(/No matching pull requests/)).toBeTruthy();
    await act(async () => finish(json(result)));
    expect(
      screen.queryByRole("link", { name: /Improve widget rendering/ }),
    ).toBeNull();
    expect(screen.getByLabelText("Technology")).toHaveProperty(
      "value",
      "Python",
    );
  });
  it("aborts an ongoing search when editing filters", async () => {
    navigation.query = "org=acme&tech=React";
    const fetch = vi.fn().mockImplementation(() => new Promise(() => {}));
    vi.stubGlobal("fetch", fetch);
    render(<PullRequestDashboard />);
    fireEvent.change(screen.getByLabelText("Technology"), {
      target: { value: "Python" },
    });
    expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
    expect(
      screen.getByRole("button", { name: "Search pull requests" }),
    ).toHaveProperty("disabled", false);
  });
  it("shows invalid URL errors without fetching", async () => {
    navigation.query = "org=acme&tech=React&page=99";
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    render(<PullRequestDashboard />);
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      expect.stringContaining("Page must"),
    );
    expect(fetch).not.toHaveBeenCalled();
  });
  it("keeps results usable when enrichment fails", async () => {
    navigation.query = "org=acme&tech=React";
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(json(result))
        .mockResolvedValueOnce(
          json({ error: "Details temporarily unavailable" }, 502),
        ),
    );
    render(<PullRequestDashboard />);
    expect(
      await screen.findByText("Details temporarily unavailable"),
    ).toBeTruthy();
    expect(
      screen.getByRole("link", { name: /Improve widget rendering/ }),
    ).toBeTruthy();
  });
  it("pauses retries after a rate-limit response", async () => {
    navigation.query = "org=acme&tech=React";
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(json({ error: "Rate limited", retryAfter: 1 }, 429)),
    );
    render(<PullRequestDashboard />);
    expect(
      await screen.findByText("Search is paused for 1 seconds."),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Search pull requests" }),
    ).toHaveProperty("disabled", true);
    await waitFor(
      () =>
        expect(
          screen.getByRole("button", { name: "Search pull requests" }),
        ).toHaveProperty("disabled", false),
      { timeout: 2000 },
    );
  });
  it("retries a failed search without changing its URL", async () => {
    navigation.query = "org=acme&tech=React&status=open&sort=updated&page=1";
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json({ error: "Unavailable" }, 502))
      .mockResolvedValueOnce(json({ ...result, pullRequests: [] }));
    vi.stubGlobal("fetch", fetch);
    render(<PullRequestDashboard />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Retry search" }),
    );
    expect(await screen.findByText(/No matching pull requests/)).toBeTruthy();
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

describe("PR card", () => {
  it("updates its score after enrichment and reuses batched change details", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const view = render(<PullRequestCard pullRequest={pr} enriching={true} />);
    expect(screen.getByText("PR readiness: 20–100/100")).toBeTruthy();
    view.rerender(
      <PullRequestCard
        pullRequest={pr}
        enriching={false}
        review={{
          reviewDecision: "APPROVED",
          checks: "SUCCESS",
          reviewers: [],
          linkedIssues: [],
          linkedIssueCount: 0,
          details: {
            additions: 10,
            deletions: 2,
            changedFiles: 1,
            mergeable: true,
          },
        }}
      />,
    );
    expect(screen.getByText("PR readiness: 100/100")).toBeTruthy();
    fireEvent.click(screen.getByText("How this score works"));
    expect(screen.getByText(/Review: 30\/30/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Change details" }));
    expect(screen.getByText("1 changed files")).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("marks completed PR readiness as not applicable", () => {
    render(
      <PullRequestCard
        pullRequest={{ ...pr, status: "merged" }}
        enriching={false}
      />,
    );
    expect(screen.getByText("PR readiness: N/A")).toBeTruthy();
    expect(screen.getByText("Not applicable")).toBeTruthy();
  });
  it("loads changes only when expanded and reuses them", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        json({ additions: 12, deletions: 2, changedFiles: 3, mergeable: null }),
      );
    vi.stubGlobal("fetch", fetch);
    render(<PullRequestCard pullRequest={pr} enriching={false} />);
    expect(fetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Change details" }));
    expect(await screen.findByText("3 changed files")).toBeTruthy();
    expect(screen.getByText("Mergeability: Unknown")).toBeTruthy();
    expect(screen.getByText("PR readiness: 30–100/100")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Hide details" }));
    fireEvent.click(screen.getByRole("button", { name: "Change details" }));
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("shows shared repository insights, document links, and PR reviews", () => {
    render(
      <PullRequestCard
        pullRequest={pr}
        enriching={false}
        insights={{
          stars: 100,
          health: { score: 80, label: "active", signals: ["Recently pushed"] },
          responsiveness: {
            status: "responsive",
            sampleDays: 90,
            sampleSize: 10,
            signals: ["Fast response"],
          },
          documentation: {
            readme: "https://github.com/acme/widgets#readme",
            contributing: null,
            license: null,
            codeOfConduct: null,
            issueTemplate: null,
            pullRequestTemplate: null,
          },
          hacktoberfest: true,
        }}
        review={{
          reviewDecision: "APPROVED",
          checks: "SUCCESS",
          reviewers: ["alice"],
          linkedIssueCount: 2,
          linkedIssues: [
            {
              title: "Fix widget",
              url: "https://github.com/acme/widgets/issues/2",
            },
          ],
        }}
      />,
    );
    expect(screen.getByText("Review: Approved")).toBeTruthy();
    expect(screen.getByText("Checks: Passing")).toBeTruthy();
    expect(screen.getByText("Repository health: 80 · active")).toBeTruthy();
    expect(screen.getByText("Hacktoberfest repository topic")).toBeTruthy();
    fireEvent.click(
      screen.getByText("Repository signals and contribution guides"),
    );
    expect(screen.getByRole("link", { name: "README" })).toBeTruthy();
    expect(screen.getByText("Contributing guide: Not provided")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Fix widget" })).toBeTruthy();
  });
  it("shows errors for unavailable change details", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Offline")));
    render(<PullRequestCard pullRequest={pr} enriching={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Change details" }));
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      expect.stringContaining("Offline"),
    );
  });
});
