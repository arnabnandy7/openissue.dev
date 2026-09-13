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
});
