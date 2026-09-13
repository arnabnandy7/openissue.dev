import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildOrganizationIssueQueries,
  searchOrganizationIssues,
} from "@/features/organizations/server/search";
import type { OrganizationIssueFilters } from "@/features/organizations/types";

afterEach(() => vi.unstubAllGlobals());

describe("buildOrganizationIssueQueries", () => {
  it("builds language query scoped to organization", async () => {
    const filters: OrganizationIssueFilters = {
      org: "facebook",
      tech: "JavaScript",
      repository: "",
      status: "open",
      sort: "updated",
      page: 1,
    };
    const { queries } = await buildOrganizationIssueQueries(filters);
    expect(queries).toEqual([
      'is:issue is:public archived:false is:open org:facebook language:"JavaScript"',
    ]);
  });

  it("builds query scoped to specific repository if provided", async () => {
    const filters: OrganizationIssueFilters = {
      org: "vercel",
      tech: "TypeScript",
      repository: "next.js",
      status: "open",
      sort: "updated",
      page: 1,
    };
    const { queries } = await buildOrganizationIssueQueries(filters);
    expect(queries).toEqual([
      'is:issue is:public archived:false is:open repo:vercel/next.js language:"TypeScript"',
    ]);
  });

  it("supports closed and all status queries", async () => {
    const closedFilters: OrganizationIssueFilters = {
      org: "vercel",
      tech: "TypeScript",
      repository: "",
      status: "closed",
      sort: "updated",
      page: 1,
    };
    const { queries: closedQueries } =
      await buildOrganizationIssueQueries(closedFilters);
    expect(closedQueries[0]).toContain("is:closed");

    const allFilters: OrganizationIssueFilters = {
      org: "vercel",
      tech: "TypeScript",
      repository: "",
      status: "all",
      sort: "updated",
      page: 1,
    };
    const { queries: allQueries } =
      await buildOrganizationIssueQueries(allFilters);
    expect(allQueries[0]).not.toContain("is:open");
    expect(allQueries[0]).not.toContain("is:closed");
  });

  it("discovers repositories by topic for framework technologies", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          items: [
            { full_name: "facebook/react", private: false },
            { full_name: "facebook/react-native", private: false },
          ],
          total_count: 2,
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const filters: OrganizationIssueFilters = {
      org: "facebook",
      tech: "React",
      repository: "",
      status: "open",
      sort: "updated",
      page: 1,
    };
    const { queries, notices } =
      await buildOrganizationIssueQueries(filters);
    expect(queries[0]).toContain("repo:facebook/react");
    expect(queries[0]).toContain("repo:facebook/react-native");
    expect(notices.some((n) => n.includes("topic"))).toBe(true);
  });
});

describe("searchOrganizationIssues", () => {
  it("searches and maps GitHub issues with pagination", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          total_count: 1,
          items: [
            {
              node_id: "I_kwDOA123",
              number: 42,
              title: "Bug in server rendering",
              html_url: "https://github.com/vercel/next.js/issues/42",
              repository_url: "https://api.github.com/repos/vercel/next.js",
              user: {
                login: "alice",
                avatar_url: "https://avatars.githubusercontent.com/u/1",
              },
              state: "open",
              labels: [{ name: "bug", color: "d73a4a" }],
              comments: 5,
              created_at: "2026-09-01T00:00:00Z",
              updated_at: "2026-09-02T00:00:00Z",
            },
          ],
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const filters: OrganizationIssueFilters = {
      org: "vercel",
      tech: "TypeScript",
      repository: "next.js",
      status: "open",
      sort: "updated",
      page: 1,
    };

    const response = await searchOrganizationIssues(filters);
    expect(response.totalCount).toBe(1);
    expect(response.issues.length).toBe(1);
    expect(response.issues[0]).toEqual({
      id: "I_kwDOA123",
      number: 42,
      title: "Bug in server rendering",
      url: "https://github.com/vercel/next.js/issues/42",
      repository: "vercel/next.js",
      author: "alice",
      authorAvatarUrl: "https://avatars.githubusercontent.com/u/1",
      status: "open",
      labels: [{ name: "bug", color: "d73a4a" }],
      comments: 5,
      createdAt: "2026-09-01T00:00:00Z",
      updatedAt: "2026-09-02T00:00:00Z",
    });
  });
});
