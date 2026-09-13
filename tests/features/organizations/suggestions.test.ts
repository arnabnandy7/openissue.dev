import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getOrganizationSuggestions,
  getRepositorySuggestions,
  getTechnologySuggestions,
} from "@/features/organizations/server/suggestions";

afterEach(() => vi.unstubAllGlobals());

describe("organization suggestions", () => {
  it("returns popular organizations when query is empty", async () => {
    const suggestions = await getOrganizationSuggestions("");
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions.some((s) => s.login === "vercel")).toBe(true);
  });

  it("queries GitHub search users for organization matches", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          items: [
            {
              login: "tailwindlabs",
              avatar_url: "https://avatars.githubusercontent.com/u/67104417",
              description: "Tailwind CSS",
            },
          ],
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const suggestions = await getOrganizationSuggestions("tailwind");
    expect(suggestions.some((s) => s.login === "tailwindlabs")).toBe(true);
    expect(fetchMock).toHaveBeenCalled();
  });
});

describe("technology suggestions", () => {
  it("returns popular technologies when query is empty", () => {
    const suggestions = getTechnologySuggestions("");
    expect(suggestions.length).toBe(10);
    expect(suggestions.some((s) => s.name === "TypeScript")).toBe(true);
  });

  it("filters technologies by name match", () => {
    const suggestions = getTechnologySuggestions("type");
    expect(suggestions.some((s) => s.name === "TypeScript")).toBe(true);

    const python = getTechnologySuggestions("pyth");
    expect(python[0].name).toBe("Python");
  });
});

describe("repository suggestions", () => {
  it("returns empty array when org is empty", async () => {
    const suggestions = await getRepositorySuggestions("");
    expect(suggestions).toEqual([]);
  });

  it("queries GitHub search repositories scoped to the organization", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          items: [
            {
              name: "next.js",
              full_name: "vercel/next.js",
              stargazers_count: 120000,
              description: "The React Framework",
              private: false,
            },
          ],
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const suggestions = await getRepositorySuggestions("vercel", "next");
    expect(suggestions.length).toBe(1);
    expect(suggestions[0].name).toBe("next.js");
    expect(suggestions[0].fullName).toBe("vercel/next.js");
    expect(suggestions[0].stars).toBe(120000);

    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain("org%3Avercel");
  });

  it("handles rate limits and errors in suggestions", async () => {
    const { RateLimitError } = await import("@/lib/github");
    const rateLimitMock = vi.fn().mockRejectedValue(new RateLimitError("Rate limit", 60));
    vi.stubGlobal("fetch", rateLimitMock);

    await expect(getOrganizationSuggestions("test")).rejects.toThrow("Rate limit");
    await expect(getRepositorySuggestions("test", "query")).rejects.toThrow("Rate limit");

    // General network failure falls back gracefully
    const networkFailMock = vi.fn().mockRejectedValue(new Error("Network fail"));
    vi.stubGlobal("fetch", networkFailMock);

    const fallbackOrgs = await getOrganizationSuggestions("ver");
    expect(fallbackOrgs.some((o) => o.login === "vercel")).toBe(true);

    const fallbackRepos = await getRepositorySuggestions("test", "query");
    expect(fallbackRepos).toEqual([]);
  });

  it("handles empty query in repository suggestions and caps organization and technology suggestions", async () => {
    // 1. empty query in getRepositorySuggestions
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          items: [
            {
              name: "turbo",
              full_name: "vercel/turbo",
              stargazers_count: 25000,
              description: null,
              private: false,
            },
          ],
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const repos = await getRepositorySuggestions("vercel");
    expect(repos.length).toBe(1);
    expect(fetchMock.mock.calls[0][0]).toContain("org%3Avercel%20archived%3Afalse");

    // 2. organization suggestions with 10 items and null description
    const orgFetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          items: Array.from({ length: 10 }, (_, i) => ({
            login: `org-${i}`,
            avatar_url: `https://example.com/${i}.png`,
            description: null,
          })),
        }),
      ),
    );
    vi.stubGlobal("fetch", orgFetchMock);

    const orgs = await getOrganizationSuggestions("org");
    expect(orgs.length).toBe(8);

    // 3. technology suggestions capped at 10 from popular and linguist
    const techMany = getTechnologySuggestions("c");
    expect(techMany.length).toBe(10);
  });
});
