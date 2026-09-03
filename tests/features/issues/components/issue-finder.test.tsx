// @vitest-environment jsdom

import type { ReactElement } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render as testingLibraryRender,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { Issue, SearchResponse } from "@/features/issues/types/search";

function render(ui: ReactElement) {
  return testingLibraryRender(<TooltipProvider>{ui}</TooltipProvider>);
}

const {
  addSavedSearch,
  deleteSavedSearch,
  getSavedSearches,
  replaceSavedSearches,
  syncSavedSearches,
  deleteCloudSavedSearch,
  getDigestPreference,
  getAlertEmail,
  triggerWeeklyDigest,
  updateDigestPreference,
  updateAlertEmail,
  useSession,
  getOpportunities,
  updateOpportunity,
  updateOpportunityWorkflow,
  getRecommendations,
} = vi.hoisted(() => ({
  addSavedSearch: vi.fn(),
  deleteSavedSearch: vi.fn(),
  getSavedSearches: vi.fn(),
  replaceSavedSearches: vi.fn(),
  syncSavedSearches: vi.fn(),
  deleteCloudSavedSearch: vi.fn(),
  getDigestPreference: vi.fn(),
  getAlertEmail: vi.fn(),
  triggerWeeklyDigest: vi.fn(),
  updateDigestPreference: vi.fn(),
  updateAlertEmail: vi.fn(),
  useSession: vi.fn(),
  getOpportunities: vi.fn(),
  updateOpportunity: vi.fn(),
  updateOpportunityWorkflow: vi.fn(),
  getRecommendations: vi.fn(),
}));

vi.mock("@/features/issues/lib/saved-searches", () => ({
  addSavedSearch,
  deleteSavedSearch,
  getSavedSearches,
  replaceSavedSearches,
}));

vi.mock("@/features/issues/lib/saved-search-cloud", () => ({
  syncSavedSearches,
  deleteCloudSavedSearch,
}));

vi.mock("@/features/issues/lib/digest-preference-cloud", () => ({
  getDigestPreference,
  getAlertEmail,
  triggerWeeklyDigest,
  updateDigestPreference,
  updateAlertEmail,
}));

vi.mock("@/features/issues/lib/opportunity-cloud", () => ({
  getOpportunities,
  updateOpportunity,
  updateOpportunityWorkflow,
}));

vi.mock("@/features/issues/lib/recommendation-cloud", () => ({
  getRecommendations,
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    useSession,
    signIn: { social: vi.fn() },
    signOut: vi.fn(),
  },
}));

vi.mock("@/components/theme-toggle", () => ({
  ThemeToggle: () => <button type="button">Theme</button>,
}));

vi.mock("@/features/issues/components/contribution-history", () => ({
  ContributionHistory: () => <div>Contribution history</div>,
}));

vi.mock("@/components/ui/select", () => ({
  Select: ({ value, onValueChange, children }: any) => (
    <div data-value={value} data-change={onValueChange ? "yes" : "no"}>
      {children}
    </div>
  ),
  SelectTrigger: ({ children, ...props }: any) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
  SelectValue: ({ children }: any) => <span>{children}</span>,
  SelectContent: ({ children }: any) => <div>{children}</div>,
  SelectItem: ({ children, value }: any) => (
    <span data-value={value}>{children}</span>
  ),
}));

import { IssueFinder } from "@/features/issues/components/issue-finder";

function issue(id: number, qualityScore = 50): Issue {
  return {
    id: `issue-${id}`,
    title: `Issue ${id}`,
    url: `https://github.com/acme/repo/issues/${id}`,
    repo: "acme/repo",
    repoUrl: "https://github.com/acme/repo",
    stars: 100,
    comments: 0,
    labels: ["help wanted"],
    updatedAt: `2026-08-${String((id % 20) + 1).padStart(2, "0")}T00:00:00.000Z`,
    createdAt: "2026-08-01T00:00:00.000Z",
    assigned: false,
    linkedPrCount: 0,
    hacktoberfest: false,
    hacktoberfestSource: null,
    qualityScore,
    repositoryHealth: { score: 65, label: "moderate", signals: [] },
    helpStatus: "open",
  };
}

function response(overrides: Partial<SearchResponse> = {}): SearchResponse {
  return {
    query: "is:issue language:Java",
    totalCount: 1000,
    candidateCount: 30,
    rateLimitRemaining: "4999",
    tokenConfigured: true,
    issues: Array.from({ length: 24 }, (_, index) => issue(index + 1, index)),
    page: 1,
    ...overrides,
  };
}

function jsonResponse(payload: SearchResponse, ok = true) {
  return { ok, json: vi.fn().mockResolvedValue(payload) };
}

beforeEach(() => {
  window.history.replaceState(null, "", "/");
  getSavedSearches.mockReset().mockReturnValue([]);
  addSavedSearch.mockReset();
  deleteSavedSearch.mockReset();
  replaceSavedSearches.mockReset();
  syncSavedSearches.mockReset().mockResolvedValue([]);
  deleteCloudSavedSearch.mockReset().mockResolvedValue(undefined);
  getDigestPreference.mockReset().mockResolvedValue(false);
  getAlertEmail.mockReset().mockResolvedValue("");
  triggerWeeklyDigest.mockReset().mockResolvedValue(undefined);
  updateDigestPreference.mockReset().mockResolvedValue(true);
  updateAlertEmail.mockReset().mockResolvedValue("");
  useSession.mockReset().mockReturnValue({ data: null, isPending: false });
  getOpportunities.mockReset().mockResolvedValue([]);
  updateOpportunity.mockReset().mockResolvedValue(null);
  updateOpportunityWorkflow.mockReset();
  getRecommendations.mockReset().mockResolvedValue({
    recommendations: [],
    preferenceCount: 0,
  });
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// The main "Search" submit button and the ErrorCard's retry action can both
// read "Cooldown..." while a rate-limit cooldown is active. Disambiguate by
// button type: the retry action is type="button", the submit control isn't.
function getRetryActionButton(name: string) {
  return screen
    .getAllByRole("button", { name })
    .find(
      (button) => (button as HTMLButtonElement).type === "button",
    ) as HTMLButtonElement;
}

describe("IssueFinder", () => {
  it("defaults to results and mounts contribution history only after tab selection", () => {
    useSession.mockReturnValue({
      data: { user: { id: "user-1", name: "Octo Cat" } },
      isPending: false,
    });

    render(<IssueFinder />);

    expect(
      screen
        .getByRole("tab", { name: "Opportunities" })
        .getAttribute("aria-selected"),
    ).toBe("true");
    expect(
      screen.queryByText("Contribution history", { selector: "div" }),
    ).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: "Workflow" }));
    expect(screen.getByText("Contribution workflow")).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "Contribution history" }));
    expect(
      screen.getByText("Contribution history", { selector: "div" }),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("tab", { name: "Contribution history" })
        .getAttribute("aria-selected"),
    ).toBe("true");
  });

  it("loads explainable recommendations for an authenticated user", async () => {
    const searches = [
      {
        id: "search-1",
        name: "React help",
        tech: "React",
        label: "help-wanted",
        sort: "updated",
        linkedPr: "any",
        hacktoberfest: "any",
        createdAt: "2026-08-28T00:00:00.000Z",
      },
      {
        id: "search-2",
        name: "Rust bugs",
        tech: "Rust",
        label: "bug",
        sort: "updated",
        linkedPr: "any",
        hacktoberfest: "any",
        createdAt: "2026-08-29T00:00:00.000Z",
      },
    ];
    useSession.mockReturnValue({
      data: { user: { id: "user-1", name: "Octo Cat" } },
      isPending: false,
    });
    getSavedSearches.mockReturnValue([]);
    syncSavedSearches.mockResolvedValue(searches);
    getRecommendations.mockResolvedValue({
      preferenceCount: 1,
      recommendations: [
        {
          issue: issue(1),
          recommendationScore: 74,
          matchSignals: ["Technology: React", "Label: help-wanted"],
        },
      ],
    });

    render(<IssueFinder />);
    fireEvent.click(screen.getByRole("tab", { name: "Recommended for you" }));

    expect(await screen.findByText("Issue 1")).toBeTruthy();
    expect(screen.getByText("Technology: React")).toBeTruthy();
    expect(screen.getByText("Label: help-wanted")).toBeTruthy();
    expect(screen.getByText("React help · React · help-wanted")).toBeTruthy();
    expect(screen.getByText("Rust bugs · Rust · bug")).toBeTruthy();
    expect(getRecommendations).toHaveBeenCalledWith("search-2");
  });

  it("restores and caches account searches after sign-in", async () => {
    const saved = {
      id: "saved-cloud",
      name: "Cloud search",
      tech: "Go",
      label: "bug",
      sort: "created",
      linkedPr: "any",
      hacktoberfest: "any",
      createdAt: "2026-08-19T00:00:00.000Z",
    };
    useSession.mockReturnValue({
      data: { user: { id: "user-1", name: "Octo Cat" } },
      isPending: false,
    });
    syncSavedSearches.mockResolvedValue([saved]);

    render(<IssueFinder />);

    expect(await screen.findByText("Cloud search")).toBeTruthy();
    expect(syncSavedSearches).toHaveBeenCalledWith([]);
    expect(replaceSavedSearches).toHaveBeenCalledWith([saved]);
  });

  it("loads and updates the weekly digest preference", async () => {
    useSession.mockReturnValue({
      data: { user: { id: "user-1", name: "Octo Cat" } },
      isPending: false,
    });
    getDigestPreference.mockResolvedValue(false);

    render(<IssueFinder />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Enable weekly digest" }),
    );

    await waitFor(() =>
      expect(updateDigestPreference).toHaveBeenCalledWith(true),
    );
    expect(
      screen.getByRole("button", { name: "Disable weekly digest" }),
    ).toBeTruthy();
  });

  it("loads, saves, and clears the alternate alert email", async () => {
    useSession.mockReturnValue({
      data: {
        user: {
          id: "user-1",
          name: "Octo Cat",
          email: "github@example.com",
        },
      },
      isPending: false,
    });
    getAlertEmail.mockResolvedValue("alerts@example.com");
    updateAlertEmail
      .mockResolvedValueOnce("next@example.com")
      .mockResolvedValueOnce("");

    render(<IssueFinder />);
    const input = await screen.findByLabelText("Alternate alert email");
    expect((input as HTMLInputElement).value).toBe("alerts@example.com");

    fireEvent.change(input, { target: { value: "next@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Save alert email" }));
    expect(
      await screen.findByText("Alerts will be sent to next@example.com."),
    ).toBeTruthy();

    fireEvent.change(input, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save alert email" }));
    expect(
      await screen.findByText("Alerts will use your GitHub-linked email."),
    ).toBeTruthy();
  });

  it("manually sends a digest for an authenticated saved search", async () => {
    const saved = {
      id: "saved-1",
      name: "React docs",
      tech: "React",
      label: "documentation",
      sort: "updated",
      linkedPr: "any",
      hacktoberfest: "any",
      createdAt: "2026-08-19T00:00:00.000Z",
    };
    useSession.mockReturnValue({
      data: { user: { id: "user-1", name: "Octo Cat" } },
      isPending: false,
    });
    getSavedSearches.mockReturnValue([saved]);
    syncSavedSearches.mockResolvedValue([saved]);

    render(<IssueFinder />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Send digest now" }),
    );

    await waitFor(() => expect(triggerWeeklyDigest).toHaveBeenCalledOnce());
    expect(
      await screen.findByText("Weekly digest sent. Check your inbox."),
    ).toBeTruthy();
  });

  it("validates and manages saved searches", async () => {
    const saved = {
      id: "saved-1",
      name: "React bugs",
      tech: "React",
      label: "bug",
      sort: "created",
      linkedPr: "no",
      hacktoberfest: "only",
      createdAt: "2026-08-19T00:00:00.000Z",
    };
    getSavedSearches.mockReturnValueOnce([]).mockReturnValueOnce([]);
    addSavedSearch.mockReturnValue(saved);

    render(<IssueFinder />);
    fireEvent.click(
      screen.getByRole("button", { name: /save current search/i }),
    );
    expect(screen.getByText("Enter a name for the saved search.")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Saved search name"), {
      target: { value: "React bugs" },
    });
    fireEvent.change(screen.getByLabelText("Technology"), {
      target: { value: "   " },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /save current search/i }),
    );
    expect(
      screen.getByText("Enter a technology before saving the search."),
    ).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Technology"), {
      target: { value: "React" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /save current search/i }),
    );
    expect(addSavedSearch).toHaveBeenCalled();
    expect(screen.getByText("React bugs")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Delete React bugs" }));
    expect(deleteSavedSearch).toHaveBeenCalledWith("saved-1");
  });

  it("shows save failures", () => {
    addSavedSearch.mockImplementation(() => {
      throw new Error("Storage unavailable");
    });
    render(<IssueFinder />);
    fireEvent.change(screen.getByLabelText("Saved search name"), {
      target: { value: "Java" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /save current search/i }),
    );
    expect(screen.getByText("Storage unavailable")).toBeTruthy();
  });

  it("keeps an authenticated save locally when account sync fails", async () => {
    useSession.mockReturnValue({
      data: { user: { id: "user-1", name: "Octo Cat" } },
      isPending: false,
    });
    const saved = {
      id: "saved-1",
      name: "Java",
      tech: "Java",
      label: "help-wanted",
      sort: "updated",
      linkedPr: "any",
      hacktoberfest: "any",
      createdAt: "2026-08-19T00:00:00.000Z",
    };
    addSavedSearch.mockReturnValue(saved);
    syncSavedSearches
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error("offline"));

    render(<IssueFinder />);
    fireEvent.change(screen.getByLabelText("Saved search name"), {
      target: { value: "Java" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /save current search/i }),
    );

    expect(
      await screen.findByText("Search saved locally, but account sync failed."),
    ).toBeTruthy();
  });

  it("syncs the complete local collection after an authenticated save", async () => {
    useSession.mockReturnValue({
      data: { user: { id: "user-1", name: "Octo Cat" } },
      isPending: false,
    });
    const olderSearch = {
      id: "saved-older",
      name: "Older local search",
      tech: "Rust",
      label: "bug",
      sort: "updated",
      linkedPr: "any",
      hacktoberfest: "any",
      createdAt: "2026-08-18T00:00:00.000Z",
    };
    const saved = {
      ...olderSearch,
      id: "saved-new",
      name: "Java",
      tech: "Java",
      createdAt: "2026-08-19T00:00:00.000Z",
    };
    addSavedSearch.mockReturnValue(saved);
    getSavedSearches
      .mockReturnValueOnce([olderSearch])
      .mockReturnValueOnce([olderSearch])
      .mockReturnValue([olderSearch, saved]);
    syncSavedSearches
      .mockResolvedValueOnce([olderSearch])
      .mockResolvedValueOnce([olderSearch, saved]);

    render(<IssueFinder />);
    await waitFor(() => expect(syncSavedSearches).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByLabelText("Saved search name"), {
      target: { value: "Java" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /save current search/i }),
    );

    await waitFor(() =>
      expect(syncSavedSearches).toHaveBeenLastCalledWith([olderSearch, saved]),
    );
    expect(replaceSavedSearches).toHaveBeenLastCalledWith([olderSearch, saved]);
  });

  it("removes an authenticated search from cloud and local storage", async () => {
    const saved = {
      id: "saved-1",
      name: "React bugs",
      tech: "React",
      label: "bug",
      sort: "created",
      linkedPr: "no",
      hacktoberfest: "only",
      createdAt: "2026-08-19T00:00:00.000Z",
    };
    useSession.mockReturnValue({
      data: { user: { id: "user-1", name: "Octo Cat" } },
      isPending: false,
    });
    getSavedSearches.mockReturnValue([saved]);
    syncSavedSearches.mockResolvedValue([saved]);

    render(<IssueFinder />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Delete React bugs" }),
    );

    await waitFor(() =>
      expect(deleteCloudSavedSearch).toHaveBeenCalledWith("saved-1"),
    );
    expect(deleteSavedSearch).toHaveBeenCalledWith("saved-1");
  });

  it("keeps a saved search locally when account deletion fails", async () => {
    const saved = {
      id: "saved-1",
      name: "React bugs",
      tech: "React",
      label: "bug",
      sort: "created",
      linkedPr: "no",
      hacktoberfest: "only",
      createdAt: "2026-08-19T00:00:00.000Z",
    };
    useSession.mockReturnValue({
      data: { user: { id: "user-1", name: "Octo Cat" } },
      isPending: false,
    });
    getSavedSearches.mockReturnValue([saved]);
    syncSavedSearches.mockResolvedValue([saved]);
    deleteCloudSavedSearch.mockRejectedValue(new Error("Cloud unavailable"));

    render(<IssueFinder />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Delete React bugs" }),
    );

    expect(await screen.findByText("Cloud unavailable")).toBeTruthy();
    expect(deleteSavedSearch).not.toHaveBeenCalled();
  });

  it("searches, ranks, and loads another page", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(jsonResponse(response()) as any)
      .mockResolvedValueOnce(
        jsonResponse(
          response({ issues: [issue(25, 99)], page: 2, candidateCount: 25 }),
        ) as any,
      );

    render(<IssueFinder />);
    fireEvent.submit(
      screen.getByRole("button", { name: "Search" }).closest("form")!,
    );

    expect(
      await screen.findByRole("heading", { name: "Opportunities" }),
    ).toBeTruthy();
    expect(screen.getByText("Issue 24")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Load More" }));
    expect(await screen.findByText("Issue 25")).toBeTruthy();
    expect(fetchMock.mock.calls[1][0]).toContain("page=2");
  });

  it("restores and updates saved opportunities for authenticated users", async () => {
    useSession.mockReturnValue({
      data: { user: { id: "user-1", name: "Octo Cat" } },
      isPending: false,
    });
    getOpportunities.mockResolvedValue([
      {
        id: "opportunity-1",
        repositoryFullName: "acme/repo",
        issueNumber: 1,
        issueUrl: "https://github.com/acme/repo/issues/1",
        title: "Issue 1",
        savedAt: "2026-08-20T00:00:00.000Z",
        openedAt: null,
      },
    ]);
    vi.mocked(fetch).mockImplementation(async (input) => {
      if (String(input).startsWith("/api/search?")) {
        return jsonResponse(response()) as any;
      }

      return {
        ok: true,
        json: vi.fn().mockResolvedValue({
          isAdmin: false,
          template: null,
        }),
      } as any;
    });

    render(<IssueFinder />);
    fireEvent.submit(
      screen.getByRole("button", { name: "Search" }).closest("form")!,
    );
    expect(await screen.findByRole("button", { name: "Saved" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Saved" }));
    await waitFor(() =>
      expect(updateOpportunity).toHaveBeenCalledWith(issue(1, 0), "unsave"),
    );
    const issueLink = screen
      .getAllByRole("link", { name: "Open issue" })
      .find((link) => link.getAttribute("href") === issue(1).url);
    expect(issueLink).toBeTruthy();
    fireEvent.click(issueLink!);
    await waitFor(() =>
      expect(updateOpportunity).toHaveBeenCalledWith(issue(1, 0), "open"),
    );
  });

  it("handles empty searches and API failures", async () => {
    const fetchMock = vi.mocked(fetch);
    render(<IssueFinder />);
    fireEvent.change(screen.getByLabelText("Technology"), {
      target: { value: " " },
    });
    fireEvent.submit(
      screen.getByRole("button", { name: "Search" }).closest("form")!,
    );
    expect(screen.getByText("Enter a technology to search.")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Technology"), {
      target: { value: "Rust" },
    });
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        response({ issues: [], candidateCount: 0, error: "No access" }),
        false,
      ) as any,
    );
    fireEvent.submit(
      screen.getByRole("button", { name: "Search" }).closest("form")!,
    );
    expect(await screen.findByText("No access")).toBeTruthy();

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Cooldown..." })).toBeTruthy(),
    );
  });

  it("updates every quick technology and supported label", () => {
    render(<IssueFinder />);
    for (const technology of [
      "Spring Boot",
      "React",
      "Python",
      "Kubernetes",
      "Java",
    ]) {
      fireEvent.click(screen.getByRole("button", { name: technology }));
      expect(
        (screen.getByLabelText("Technology") as HTMLInputElement).value,
      ).toBe(technology);
    }
    for (const label of [
      "help wanted",
      "good first issue",
      "up-for-grabs",
      "first-timers-only",
      "hacktoberfest",
      "bug",
      "documentation",
    ]) {
      fireEvent.click(screen.getByRole("button", { name: label }));
    }
  });

  it("runs a saved search and reports pagination failures", async () => {
    const saved = {
      id: "saved-2",
      name: "Saved Rust",
      tech: "Rust",
      label: "bug",
      sort: "comments",
      linkedPr: "yes",
      hacktoberfest: "any",
      createdAt: "2026-08-19T00:00:00.000Z",
    };
    getSavedSearches.mockReturnValue([saved]);
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(jsonResponse(response()) as any)
      .mockResolvedValueOnce(
        jsonResponse(response({ error: "Pagination failed" }), false) as any,
      );

    render(<IssueFinder />);
    fireEvent.click(screen.getByRole("button", { name: "Run" }));
    expect(await screen.findByText("Opportunities")).toBeTruthy();
    expect(fetchMock.mock.calls[0][0]).toContain("tech=Rust");
    fireEvent.click(screen.getByRole("button", { name: "Load More" }));
    expect(await screen.findByText("Pagination failed")).toBeTruthy();
  });

  it("uses the fallback message for non-Error pagination failures", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(jsonResponse(response()) as any)
      .mockRejectedValueOnce("offline");
    render(<IssueFinder />);
    fireEvent.submit(
      screen.getByRole("button", { name: "Search" }).closest("form")!,
    );
    await screen.findByText("Opportunities");
    fireEvent.click(screen.getByRole("button", { name: "Load More" }));
    expect(await screen.findByText("Failed to load more issues.")).toBeTruthy();
  });

  it("shows an unknown token status until a successful search reports it", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(response({ tokenConfigured: true })) as any,
      )
      .mockResolvedValueOnce(
        jsonResponse(response({ error: "Search failed" }), false) as any,
      );

    render(<IssueFinder />);
    expect(screen.getByText("unknown")).toBeTruthy();

    const form = screen
      .getByRole("button", { name: "Search" })
      .closest("form")!;
    fireEvent.submit(form);
    expect(await screen.findByText("configured")).toBeTruthy();

    fireEvent.submit(form);
    expect(
      (await screen.findAllByText("Search failed")).length,
    ).toBeGreaterThan(0);
    expect(screen.getByText("configured")).toBeTruthy();
  });

  it("writes successful searches to the URL without adding pagination entries", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(jsonResponse(response()) as any)
      .mockResolvedValueOnce(
        jsonResponse(
          response({ issues: [issue(25)], page: 2, candidateCount: 25 }),
        ) as any,
      );
    const pushState = vi.spyOn(window.history, "pushState");

    render(<IssueFinder />);
    fireEvent.change(screen.getByLabelText("Technology"), {
      target: { value: "Rust" },
    });
    fireEvent.submit(
      screen.getByRole("button", { name: "Search" }).closest("form")!,
    );

    await screen.findByRole("heading", { name: "Opportunities" });
    expect(window.location.search).toContain("tech=Rust");
    expect(pushState).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Load More" }));
    await screen.findByText("Issue 25");
    expect(pushState).toHaveBeenCalledTimes(1);
  });

  it("restores validated filters during browser navigation", async () => {
    const fetchMock = vi
      .mocked(fetch)
      .mockResolvedValue(jsonResponse(response()) as any);
    window.history.replaceState(
      null,
      "",
      "/?tech=Rust&label=unknown&sort=unknown&linkedPr=unknown&hacktoberfest=unknown",
    );

    render(<IssueFinder />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(String(fetchMock.mock.calls[0][0])).toContain("tech=Rust");
    expect(String(fetchMock.mock.calls[0][0])).toContain("label=help-wanted");
    expect(String(fetchMock.mock.calls[0][0])).toContain("sort=updated");

    window.history.pushState(null, "", "/");
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(await screen.findByText("Ready when you are")).toBeTruthy();
    expect(
      (screen.getByLabelText("Technology") as HTMLInputElement).value,
    ).toBe("Java");
  });

  it("ignores a stale search after navigation clears the URL", async () => {
    let resolveSearch!: (value: ReturnType<typeof jsonResponse>) => void;
    vi.mocked(fetch).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSearch = resolve;
      }) as any,
    );
    window.history.replaceState(null, "", "/?tech=Rust");

    render(<IssueFinder />);
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());

    window.history.pushState(null, "", "/");
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(await screen.findByText("Ready when you are")).toBeTruthy();

    resolveSearch(jsonResponse(response()));
    await waitFor(() => expect(screen.queryByText("Issue 1")).toBeNull());
    expect(screen.getByText("Ready when you are")).toBeTruthy();
  });

  it("ignores a stale search failure after a newer history search succeeds", async () => {
    let rejectFirstSearch!: (reason: Error) => void;
    vi.mocked(fetch)
      .mockReturnValueOnce(
        new Promise((_, reject) => {
          rejectFirstSearch = reject;
        }) as any,
      )
      .mockResolvedValueOnce(
        jsonResponse(
          response({
            query: "is:issue language:Go",
            issues: [issue(50)],
          }),
        ) as any,
      );
    window.history.replaceState(null, "", "/?tech=Rust");

    render(<IssueFinder />);
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());

    window.history.pushState(null, "", "/?tech=Go");
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(await screen.findByText("Issue 50")).toBeTruthy();

    rejectFirstSearch(new Error("Stale failure"));
    await waitFor(() => expect(screen.queryByText("Stale failure")).toBeNull());
    expect(screen.getByText("Issue 50")).toBeTruthy();
  });

  it("warns when optional GitHub enrichment is incomplete", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse(
        response({
          enrichment: {
            repositoryMetadata: "partial",
            discussionAnalysis: "unavailable",
            linkedPullRequests: "complete",
          },
        }),
      ) as any,
    );

    render(<IssueFinder />);
    fireEvent.submit(
      screen.getByRole("button", { name: "Search" }).closest("form")!,
    );

    expect(
      await screen.findByText("Some ranking details are unavailable"),
    ).toBeTruthy();
    expect(screen.getByText(/repository metadata is partial/)).toBeTruthy();
    expect(screen.getByText(/discussion analysis is unavailable/)).toBeTruthy();
  });

  it("retains incomplete enrichment warnings across loaded pages", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        jsonResponse(
          response({
            enrichment: {
              repositoryMetadata: "partial",
              discussionAnalysis: "complete",
              linkedPullRequests: "complete",
            },
          }),
        ) as any,
      )
      .mockResolvedValueOnce(
        jsonResponse(
          response({
            issues: [issue(25)],
            page: 2,
            enrichment: {
              repositoryMetadata: "complete",
              discussionAnalysis: "complete",
              linkedPullRequests: "complete",
            },
          }),
        ) as any,
      );

    render(<IssueFinder />);
    fireEvent.submit(
      screen.getByRole("button", { name: "Search" }).closest("form")!,
    );
    expect(
      await screen.findByText(/repository metadata is partial/),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Load More" }));
    await screen.findByText("Issue 25");
    expect(screen.getByText(/repository metadata is partial/)).toBeTruthy();
  });

  it("keeps the least available enrichment status from a later page", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        jsonResponse(
          response({
            enrichment: {
              repositoryMetadata: "complete",
              discussionAnalysis: "complete",
              linkedPullRequests: "complete",
            },
          }),
        ) as any,
      )
      .mockResolvedValueOnce(
        jsonResponse(
          response({
            issues: [issue(25)],
            page: 2,
            enrichment: {
              repositoryMetadata: "unavailable",
              discussionAnalysis: "partial",
              linkedPullRequests: "complete",
            },
          }),
        ) as any,
      );

    render(<IssueFinder />);
    fireEvent.submit(
      screen.getByRole("button", { name: "Search" }).closest("form")!,
    );
    await screen.findByRole("heading", { name: "Opportunities" });
    expect(
      screen.queryByText("Some ranking details are unavailable"),
    ).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Load More" }));
    expect(
      await screen.findByText(/repository metadata is unavailable/),
    ).toBeTruthy();
    expect(screen.getByText(/discussion analysis is partial/)).toBeTruthy();
  });

  it("preserves enrichment when only one loaded page reports it", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(response()) as any)
      .mockResolvedValueOnce(
        jsonResponse(
          response({
            issues: Array.from({ length: 24 }, (_, index) => issue(index + 25)),
            page: 2,
            candidateCount: 50,
            enrichment: {
              repositoryMetadata: "partial",
              discussionAnalysis: "complete",
              linkedPullRequests: "complete",
            },
          }),
        ) as any,
      )
      .mockResolvedValueOnce(
        jsonResponse(
          response({
            issues: [issue(49)],
            page: 3,
            candidateCount: 50,
            enrichment: undefined,
          }),
        ) as any,
      );

    render(<IssueFinder />);
    fireEvent.submit(
      screen.getByRole("button", { name: "Search" }).closest("form")!,
    );
    await screen.findByRole("heading", { name: "Opportunities" });

    fireEvent.click(screen.getByRole("button", { name: "Load More" }));
    expect(
      await screen.findByText(/repository metadata is partial/),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Load More" }));
    await screen.findByText("Issue 49");
    expect(screen.getByText(/repository metadata is partial/)).toBeTruthy();
  });

  it("shows a friendly rate limit card with the retry duration and a disabled retry action", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse(
        response({
          error: "GitHub API rate limit exceeded.",
          rateLimit: true,
          retryAfter: 120,
        }),
        false,
      ) as any,
    );

    render(<IssueFinder />);
    fireEvent.submit(
      screen.getByRole("button", { name: "Search" }).closest("form")!,
    );

    expect(
      await screen.findByText("Too many requests: please wait"),
    ).toBeTruthy();
    expect(
      screen.getByText(/GitHub is temporarily limiting how many searches/),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Please wait approximately 120 seconds before retrying.",
      ),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    expect(getRetryActionButton("Cooldown...").disabled).toBe(true);
    expect(
      screen.queryByRole("button", { name: "Sign in for higher limits" }),
    ).toBeNull();
  });

  it("uses a one-minute fallback cooldown when no retry duration is available", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse(
        response({
          error: "GitHub API rate limit exceeded.",
          rateLimit: true,
          retryAfter: null,
        }),
        false,
      ) as any,
    );

    vi.useFakeTimers();
    try {
      render(<IssueFinder />);
      fireEvent.submit(
        screen.getByRole("button", { name: "Search" }).closest("form")!,
      );

      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      expect(
        screen.getByText("Please wait a few minutes before trying again."),
      ).toBeTruthy();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(59_000);
      });
      expect(getRetryActionButton("Cooldown...").disabled).toBe(true);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1_000);
      });
      expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps retry disabled until the API-provided cooldown expires, then retries", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(
          response({
            error: "GitHub API rate limit exceeded.",
            rateLimit: true,
            retryAfter: 120,
          }),
          false,
        ) as any,
      )
      .mockResolvedValueOnce(jsonResponse(response()) as any);

    vi.useFakeTimers();
    try {
      render(<IssueFinder />);
      fireEvent.submit(
        screen.getByRole("button", { name: "Search" }).closest("form")!,
      );

      // Flush the pending fetch promise and the resulting state update.
      // Using vi.advanceTimersByTimeAsync (instead of findBy/waitFor, which
      // poll with real timers) keeps everything on the fake-timer clock so
      // the test can't hang and leak fake timers into later tests.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      expect(screen.getByText("Too many requests: please wait")).toBeTruthy();
      const retryButton = getRetryActionButton("Cooldown...");
      expect(retryButton.disabled).toBe(true);

      // Not enough time has passed yet: still disabled.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(60_000);
      });
      expect(getRetryActionButton("Cooldown...").disabled).toBe(true);

      // The full retry-after window has elapsed: the button becomes usable.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(60_000);
      });
      const enabledRetryButton = screen.getByRole("button", {
        name: "Try again",
      }) as HTMLButtonElement;
      expect(enabledRetryButton.disabled).toBe(false);

      fireEvent.click(enabledRetryButton);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      expect(
        screen.getByRole("heading", { name: "Opportunities" }),
      ).toBeTruthy();
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("retries the failed page instead of restarting the search after a rate-limited pagination failure", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(jsonResponse(response()) as any)
      .mockResolvedValueOnce(
        jsonResponse(
          response({
            error: "GitHub API rate limit exceeded.",
            rateLimit: true,
            retryAfter: 0,
          }),
          false,
        ) as any,
      )
      .mockResolvedValueOnce(
        jsonResponse(
          response({ issues: [issue(25)], page: 2, candidateCount: 25 }),
        ) as any,
      );

    render(<IssueFinder />);
    fireEvent.submit(
      screen.getByRole("button", { name: "Search" }).closest("form")!,
    );
    await screen.findByText("Opportunities");

    fireEvent.click(await screen.findByRole("button", { name: "Load More" }));
    expect(
      await screen.findByText("Too many requests: please wait"),
    ).toBeTruthy();

    // retryAfter: 0 means the cooldown clears almost immediately.
    await waitFor(() => {
      const retryButton = screen.getByRole(
        "button",
        { name: "Try again" },
      ) as HTMLButtonElement;
      expect(retryButton.disabled).toBe(false);
    });

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByText("Issue 25")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    // The retry continues the failed page rather than restarting at page 1.
    expect(String(fetchMock.mock.calls[2][0])).toContain("page=2");
  });

  it("does not let an earlier search cooldown shorten a pagination rate-limit cooldown", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(response()) as any)
      .mockResolvedValueOnce(
        jsonResponse(
          response({
            error: "GitHub API rate limit exceeded.",
            rateLimit: true,
            retryAfter: 120,
          }),
          false,
        ) as any,
      );

    vi.useFakeTimers();
    try {
      render(<IssueFinder />);
      fireEvent.submit(
        screen.getByRole("button", { name: "Search" }).closest("form")!,
      );
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      fireEvent.click(screen.getByRole("button", { name: "Load More" }));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(getRetryActionButton("Cooldown...").disabled).toBe(true);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(3_000);
      });
      expect(getRetryActionButton("Cooldown...").disabled).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("falls back to the default cooldown when a rate-limited pagination failure has no retry-after", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(jsonResponse(response()) as any)
      .mockResolvedValueOnce(
        jsonResponse(
          response({
            error: "GitHub API rate limit exceeded.",
            rateLimit: true,
            retryAfter: null,
          }),
          false,
        ) as any,
      );

    render(<IssueFinder />);
    fireEvent.submit(
      screen.getByRole("button", { name: "Search" }).closest("form")!,
    );
    await screen.findByText("Opportunities");

    fireEvent.click(await screen.findByRole("button", { name: "Load More" }));

    expect(
      await screen.findByText("Please wait a few minutes before trying again."),
    ).toBeTruthy();
    expect(getRetryActionButton("Cooldown...").disabled).toBe(true);
  });
});
