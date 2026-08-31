import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  buildPersonalizedRecommendations,
  desc,
  eq,
  getDatabase,
  getSession,
  isSearchRateLimited,
  opportunity,
  savedSearch,
  issueFeedback,
  hiddenRepository,
} = vi.hoisted(() => ({
  buildPersonalizedRecommendations: vi.fn(),
  desc: vi.fn(),
  eq: vi.fn(),
  getDatabase: vi.fn(),
  getSession: vi.fn(),
  isSearchRateLimited: vi.fn(),
  opportunity: {
    issueUrl: "opportunity.issueUrl",
    repositoryFullName: "opportunity.repositoryFullName",
    userId: "opportunity.userId",
  },
  savedSearch: {
    createdAt: "savedSearch.createdAt",
    userId: "savedSearch.userId",
  },
  issueFeedback: {
    issueUrl: "issueFeedback.issueUrl",
    userId: "issueFeedback.userId",
  },
  hiddenRepository: {
    repositoryFullName: "hiddenRepository.repositoryFullName",
    userId: "hiddenRepository.userId",
  }
}));

vi.mock("server-only", () => ({}));
vi.mock("drizzle-orm", () => ({ desc, eq }));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession } } }));
vi.mock("@/lib/auth-schema", () => ({ opportunity, savedSearch, issueFeedback, hiddenRepository }));
vi.mock("@/lib/db", () => ({ getDatabase }));
vi.mock("@/features/issues/server/personalized-recommendations", () => ({
  buildPersonalizedRecommendations,
}));
vi.mock("@/features/issues/server/search-rate-limit", () => ({
  isSearchRateLimited,
}));

import { GET } from "@/app/api/recommendations/route";

const searches = [
  {
    id: "search-2",
    userId: "user-1",
    name: "Rust bugs",
    tech: "Rust",
    label: "bug",
    sort: "updated",
    linkedPr: "any",
    hacktoberfest: "any",
    createdAt: new Date("2026-08-29T00:00:00.000Z"),
  },
  {
    id: "search-1",
    userId: "user-1",
    name: "React help",
    tech: "React",
    label: "help-wanted",
    sort: "updated",
    linkedPr: "any",
    hacktoberfest: "any",
    createdAt: new Date("2026-08-28T00:00:00.000Z"),
  },
];
const opportunities = [
  {
    issueUrl: "https://github.com/acme/widgets/issues/1",
    repositoryFullName: "acme/widgets",
  },
];

function mockDatabase(savedRows = searches) {
  let selection = 0;
  getDatabase.mockReturnValue({
    select: vi.fn(() => {
      selection += 1;
      if (selection === 1) {
        return {
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              orderBy: vi.fn().mockResolvedValue(savedRows),
            })),
          })),
        };
      }

      return {
        from: vi.fn(() => ({
          where: vi.fn().mockResolvedValue(opportunities),
        })),
      };
    }),
  });
}

describe("recommendations API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSession.mockResolvedValue({ user: { id: "user-1" } });
    isSearchRateLimited.mockReturnValue(false);
    buildPersonalizedRecommendations.mockResolvedValue({
      recommendations: [],
      preferenceCount: 1,
    });
    mockDatabase();
  });

  it("requires authentication", async () => {
    getSession.mockResolvedValue(null);

    expect((await GET(new Request("http://localhost/api/recommendations"))).status).toBe(401);
    expect(getDatabase).not.toHaveBeenCalled();
  });

  it("rejects multiple saved-search selections", async () => {
    const response = await GET(
      new Request("http://localhost/api/recommendations?searchId=one&searchId=two"),
    );

    expect(response.status).toBe(400);
    expect(getDatabase).not.toHaveBeenCalled();
  });

  it("rate limits repeated recommendation requests per user", async () => {
    isSearchRateLimited.mockReturnValue(true);
    const response = await GET(new Request("http://localhost/api/recommendations"));

    expect(response.status).toBe(429);
    expect(isSearchRateLimited).toHaveBeenCalledWith("user:user-1");
    expect(buildPersonalizedRecommendations).not.toHaveBeenCalled();
  });

  it("uses the most recent saved search by default", async () => {
    const response = await GET(new Request("http://localhost/api/recommendations"));

    expect(response.status).toBe(200);
    expect(buildPersonalizedRecommendations).toHaveBeenCalledWith(
      [expect.objectContaining({ id: "search-2", createdAt: "2026-08-29T00:00:00.000Z" })],
      opportunities,
      expect.any(Object),
    );
  });

  it("uses a selected saved search owned by the user", async () => {
    await GET(
      new Request("http://localhost/api/recommendations?searchId=search-1"),
    );

    expect(buildPersonalizedRecommendations).toHaveBeenCalledWith(
      [expect.objectContaining({ id: "search-1" })],
      opportunities,
      expect.any(Object),
    );
  });

  it("rejects an unavailable saved search", async () => {
    const response = await GET(
      new Request("http://localhost/api/recommendations?searchId=other-user-search"),
    );

    expect(response.status).toBe(404);
    expect(buildPersonalizedRecommendations).not.toHaveBeenCalled();
  });

  it("supports users without saved searches", async () => {
    mockDatabase([]);
    const response = await GET(new Request("http://localhost/api/recommendations"));

    expect(response.status).toBe(200);
    expect(buildPersonalizedRecommendations).toHaveBeenCalledWith([], opportunities, expect.any(Object));
  });

  it("converts GitHub failures to a gateway error", async () => {
    buildPersonalizedRecommendations.mockRejectedValue(new Error("GitHub unavailable"));
    const response = await GET(new Request("http://localhost/api/recommendations"));

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error: "Unable to load recommendations from GitHub.",
    });
  });
});
