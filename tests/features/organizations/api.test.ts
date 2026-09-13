import { describe, expect, it, vi } from "vitest";

vi.mock("@/features/organizations/server/search", () => ({
  searchOrganizationIssues: vi.fn().mockResolvedValue({
    issues: [],
    totalCount: 0,
    page: 1,
    hasMore: false,
    query: "is:issue",
    notices: [],
    tokenConfigured: true,
  }),
}));

vi.mock("@/features/organizations/server/suggestions", () => ({
  getOrganizationSuggestions: vi.fn().mockResolvedValue([
    { login: "vercel", avatarUrl: "https://example.com/avatar.png" },
  ]),
  getTechnologySuggestions: vi.fn().mockReturnValue([
    { name: "TypeScript", type: "language" },
  ]),
  getRepositorySuggestions: vi.fn().mockResolvedValue([
    { name: "next.js", fullName: "vercel/next.js", stars: 1000, description: "Framework" },
  ]),
}));

import { GET as getIssues } from "@/app/api/organizations/issues/route";
import { GET as getOrgSuggestions } from "@/app/api/suggestions/organizations/route";
import { GET as getTechSuggestions } from "@/app/api/suggestions/technologies/route";
import { GET as getRepoSuggestions } from "@/app/api/suggestions/repositories/route";

describe("organization issues API", () => {
  it("rejects request missing organization or technology", async () => {
    const res = await getIssues(
      new Request("http://localhost/api/organizations/issues?org=&tech="),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Organization is required.");
  });

  it("accepts valid search request and returns payload", async () => {
    const res = await getIssues(
      new Request("http://localhost/api/organizations/issues?org=vercel&tech=TypeScript"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.query).toBe("is:issue");
  });
});

describe("suggestions APIs", () => {
  it("returns organization suggestions", async () => {
    const res = await getOrgSuggestions(
      new Request("http://localhost/api/suggestions/organizations?query=ver"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.organizations[0].login).toBe("vercel");
  });

  it("returns technology suggestions", async () => {
    const res = await getTechSuggestions(
      new Request("http://localhost/api/suggestions/technologies?query=type"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.technologies[0].name).toBe("TypeScript");
  });

  it("requires org parameter for repository suggestions", async () => {
    const res = await getRepoSuggestions(
      new Request("http://localhost/api/suggestions/repositories"),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Organization parameter is required.");
  });

  it("returns repository suggestions when org is provided", async () => {
    const res = await getRepoSuggestions(
      new Request("http://localhost/api/suggestions/repositories?org=vercel&query=next"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.repositories[0].name).toBe("next.js");
  });
});
