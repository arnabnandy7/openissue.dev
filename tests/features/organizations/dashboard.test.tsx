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

import { OrganizationDashboard } from "@/features/organizations/components/organization-dashboard";
import type { OrganizationIssue } from "@/features/organizations/types";

const sampleIssue: OrganizationIssue = {
  id: "I_1",
  number: 101,
  title: "Hydration mismatch in client component",
  url: "https://github.com/vercel/next.js/issues/101",
  repository: "vercel/next.js",
  author: "alice",
  status: "open",
  labels: [{ name: "bug", color: "d73a4a" }],
  comments: 4,
  createdAt: "2026-09-01T00:00:00Z",
  updatedAt: "2026-09-02T00:00:00Z",
};

const searchResult = {
  issues: [sampleIssue],
  totalCount: 1,
  page: 1,
  hasMore: false,
  query: "is:issue",
  notices: [],
  tokenConfigured: true,
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

beforeEach(() => {
  navigation.query = "";
  navigation.push.mockReset();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("OrganizationDashboard", () => {
  it("renders the empty state when no query is present", () => {
    render(<OrganizationDashboard />);
    expect(
      screen.getByText("Explore open-source issues by organization"),
    ).toBeTruthy();
  });

  it("disables the repository input until organization is filled", () => {
    render(<OrganizationDashboard />);
    const repoInput = screen.getByPlaceholderText("Select an organization first");
    expect((repoInput as HTMLInputElement).disabled).toBe(true);

    const orgInput = screen.getByLabelText("Organization");
    fireEvent.change(orgInput, { target: { value: "vercel" } });

    expect((repoInput as HTMLInputElement).disabled).toBe(false);
  });

  it("clears repository when organization changes", () => {
    render(<OrganizationDashboard />);
    const orgInput = screen.getByLabelText("Organization");
    const repoInput = screen.getByLabelText("Repository (optional)");

    fireEvent.change(orgInput, { target: { value: "vercel" } });
    fireEvent.change(repoInput, { target: { value: "next.js" } });
    expect((repoInput as HTMLInputElement).value).toBe("next.js");

    // Change org
    fireEvent.change(orgInput, { target: { value: "facebook" } });
    expect((repoInput as HTMLInputElement).value).toBe("");
  });

  it("fetches and displays suggestions on input focus and typing", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url.includes("/api/suggestions/organizations")) {
        return Promise.resolve(
          jsonResponse({
            organizations: [
              { login: "vercel", avatarUrl: "https://example.com/v.png", description: "Vercel Inc." },
            ],
          }),
        );
      }
      return Promise.resolve(jsonResponse({}));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<OrganizationDashboard />);
    const orgInput = screen.getByLabelText("Organization");

    fireEvent.focus(orgInput);
    fireEvent.change(orgInput, { target: { value: "ver" } });

    await waitFor(() => {
      expect(screen.getByText("Vercel Inc.")).toBeTruthy();
    });

    // Click suggestion
    fireEvent.mouseDown(screen.getByText("Vercel Inc."));
    expect((orgInput as HTMLInputElement).value).toBe("vercel");
  });

  it("submits the form with bookmarkable URL parameters", () => {
    render(<OrganizationDashboard />);
    const orgInput = screen.getByLabelText("Organization");
    const techInput = screen.getByLabelText("Technology");

    fireEvent.change(orgInput, { target: { value: "vercel" } });
    fireEvent.change(techInput, { target: { value: "TypeScript" } });

    fireEvent.click(screen.getByRole("button", { name: /search issues/i }));

    expect(navigation.push).toHaveBeenCalledWith(
      expect.stringContaining("org=vercel"),
      expect.anything(),
    );
    expect(navigation.push).toHaveBeenCalledWith(
      expect.stringContaining("tech=TypeScript"),
      expect.anything(),
    );
  });

  it("executes search when query parameters are present and displays results", async () => {
    navigation.query = "org=vercel&tech=TypeScript";

    const fetchMock = vi.fn((url: string) => {
      if (url.includes("/api/organizations/issues")) {
        return Promise.resolve(jsonResponse(searchResult));
      }
      return Promise.resolve(jsonResponse({}));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<OrganizationDashboard />);

    await waitFor(() => {
      expect(
        screen.getByText("Hydration mismatch in client component"),
      ).toBeTruthy();
    });
    expect(screen.getByText("vercel/next.js #101")).toBeTruthy();
    expect(screen.getAllByText("Open").length).toBeGreaterThanOrEqual(2);
  });

  it("navigates suggestions via keyboard and handles clearing", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        organizations: [
          { login: "alpha", avatarUrl: "", description: "Alpha Org" },
          { login: "beta", avatarUrl: "", description: "Beta Org" },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<OrganizationDashboard />);
    const orgInput = screen.getByLabelText("Organization");

    fireEvent.focus(orgInput);
    fireEvent.change(orgInput, { target: { value: "a" } });

    await waitFor(() => {
      expect(screen.getByText("Alpha Org")).toBeTruthy();
    });

    // ArrowDown, ArrowDown, ArrowUp
    fireEvent.keyDown(orgInput, { key: "ArrowDown" });
    fireEvent.keyDown(orgInput, { key: "ArrowDown" });
    fireEvent.keyDown(orgInput, { key: "ArrowUp" });
    // Press Enter to select
    fireEvent.keyDown(orgInput, { key: "Enter" });
    expect((orgInput as HTMLInputElement).value).toBe("alpha");

    // Clear button
    const clearButton = screen.getByLabelText("Clear input");
    fireEvent.click(clearButton);
    expect((orgInput as HTMLInputElement).value).toBe("");
  });

  it("handles empty results and pagination controls", async () => {
    navigation.query = "org=empty&tech=TypeScript&page=2";

    const fetchMock = vi.fn((url: string) => {
      if (url.includes("/api/organizations/issues")) {
        return Promise.resolve(
          jsonResponse({
            issues: [],
            totalCount: 0,
            page: 2,
            hasMore: false,
            query: "is:issue",
            notices: ["Notice test"],
            tokenConfigured: true,
          }),
        );
      }
      return Promise.resolve(jsonResponse({}));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<OrganizationDashboard />);

    await waitFor(() => {
      expect(screen.getByText("No issues found.")).toBeTruthy();
    });
    expect(screen.getByText("Notice test")).toBeTruthy();

    // Previous page button
    const prevBtn = screen.getByRole("button", { name: /previous/i });
    expect((prevBtn as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(prevBtn);
    expect(navigation.push).toHaveBeenCalledWith(
      "/organizations?org=empty&tech=TypeScript",
      expect.anything(),
    );
  });

  it("displays search failure and cooldown message", async () => {
    navigation.query = "org=fail&tech=TypeScript";

    const fetchMock = vi.fn((url: string) => {
      if (url.includes("/api/organizations/issues")) {
        return Promise.resolve(
          new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
            status: 429,
            headers: { "Retry-After": "30" },
          }),
        );
      }
      return Promise.resolve(jsonResponse({}));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<OrganizationDashboard />);

    await waitFor(() => {
      expect(screen.getByText("Rate limit exceeded")).toBeTruthy();
    });
    expect(screen.getByText(/Retry enabled in 30s/)).toBeTruthy();
  });

  it("handles tech and repo auto-suggestions, dropdown changes, and next page", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url.includes("/api/suggestions/technologies")) {
        return Promise.resolve(
          jsonResponse({
            technologies: [{ name: "React", type: "framework" }],
          }),
        );
      }
      if (url.includes("/api/suggestions/repositories")) {
        return Promise.resolve(
          jsonResponse({
            repositories: [
              {
                name: "next.js",
                fullName: "vercel/next.js",
                stars: 120000,
                description: "The React Framework",
              },
            ],
          }),
        );
      }
      if (url.includes("/api/organizations/issues")) {
        return Promise.resolve(
          jsonResponse({
            issues: [sampleIssue],
            totalCount: 50,
            page: 1,
            hasMore: true,
            query: "is:issue",
            notices: [],
            tokenConfigured: true,
          }),
        );
      }
      return Promise.resolve(jsonResponse({}));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<OrganizationDashboard />);
    const orgInput = screen.getByLabelText("Organization");
    const techInput = screen.getByLabelText("Technology");
    const repoInput = screen.getByLabelText("Repository (optional)");

    // Fill org
    fireEvent.change(orgInput, { target: { value: "vercel" } });

    // Focus and select tech
    fireEvent.focus(techInput);
    fireEvent.change(techInput, { target: { value: "reac" } });
    await waitFor(() => {
      expect(screen.getByText("React")).toBeTruthy();
    });
    expect(screen.getByText("framework")).toBeTruthy();
    fireEvent.mouseDown(screen.getByText("React"));
    expect((techInput as HTMLInputElement).value).toBe("React");

    // Focus and select repo
    fireEvent.focus(repoInput);
    fireEvent.change(repoInput, { target: { value: "next" } });
    await waitFor(() => {
      expect(screen.getByText("The React Framework")).toBeTruthy();
    });
    fireEvent.mouseDown(screen.getByText("The React Framework"));
    expect((repoInput as HTMLInputElement).value).toBe("next.js");

    // Change status and sort
    const statusSelect = screen.getByLabelText("Status");
    fireEvent.change(statusSelect, { target: { value: "closed" } });
    const sortSelect = screen.getByLabelText("Sort by");
    fireEvent.change(sortSelect, { target: { value: "comments" } });

    // Submit form
    fireEvent.click(screen.getByRole("button", { name: /search issues/i }));
    expect(navigation.push).toHaveBeenCalledWith(
      expect.stringContaining("status=closed"),
      expect.anything(),
    );
  });

  it("handles pagination next and repeated search submission", async () => {
    navigation.query = "org=vercel&tech=React";

    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        issues: [sampleIssue],
        totalCount: 50,
        page: 1,
        hasMore: true,
        query: "is:issue",
        notices: [],
        tokenConfigured: true,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<OrganizationDashboard />);

    await waitFor(() => {
      expect(screen.getByText("Next")).toBeTruthy();
    });

    // Next page button
    const nextBtn = screen.getByRole("button", { name: /next/i });
    expect((nextBtn as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(nextBtn);
    expect(navigation.push).toHaveBeenCalledWith(
      expect.stringContaining("page=2"),
      expect.anything(),
    );

    // Repeated submit when query params are identical triggers re-attempt
    fireEvent.click(screen.getByRole("button", { name: /search issues/i }));
  });

  it("handles validation error from URL parameters", async () => {
    navigation.query = "org=invalid+org!&tech=TypeScript";
    render(<OrganizationDashboard />);
    await waitFor(() => {
      expect(
        screen.getByText(/Organization name may contain up to 39 alphanumeric characters/),
      ).toBeTruthy();
    });
  });

  it("handles validation error on form submission", () => {
    render(<OrganizationDashboard />);
    const orgInput = screen.getByLabelText("Organization");
    const techInput = screen.getByLabelText("Technology");
    fireEvent.change(orgInput, { target: { value: "invalid org name!" } });
    fireEvent.change(techInput, { target: { value: "TypeScript" } });

    fireEvent.click(screen.getByRole("button", { name: /search issues/i }));
    expect(
      screen.getByText(/Organization name may contain up to 39 alphanumeric characters/),
    ).toBeTruthy();
    expect(navigation.push).not.toHaveBeenCalled();
  });
});
