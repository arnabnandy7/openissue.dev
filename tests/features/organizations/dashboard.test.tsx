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
});
