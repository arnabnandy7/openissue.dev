import { beforeEach, describe, expect, it, vi } from "vitest";
import { RateLimitError } from "@/lib/github";
const mocks = vi.hoisted(() => ({
  search: vi.fn(),
  enrich: vi.fn(),
  details: vi.fn(),
  limited: vi.fn(),
}));
vi.mock("@/features/pull-requests/server/search", () => ({
  searchPullRequests: mocks.search,
}));
vi.mock("@/features/pull-requests/server/enrichment", () => ({
  enrichPullRequests: mocks.enrich,
  getPullRequestDetails: mocks.details,
}));
vi.mock("@/features/issues/server/search-rate-limit", () => ({
  isSearchRateLimited: mocks.limited,
}));
import { GET } from "@/app/api/pull-requests/route";
import { POST } from "@/app/api/pull-requests/enrichment/route";
import { GET as details } from "@/app/api/pull-requests/details/route";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.search.mockResolvedValue({ pullRequests: [] });
  mocks.enrich.mockResolvedValue({ repositories: {}, reviews: {} });
  mocks.details.mockResolvedValue({ additions: 1 });
});
const searchRequest = () =>
  new Request("http://localhost/api/pull-requests?org=acme&tech=React", {
    headers: { "x-forwarded-for": "203.0.113.9, 1.1.1.1" },
  });
const post = (body: unknown) =>
  new Request("http://localhost/api/pull-requests/enrichment", {
    method: "POST",
    body: JSON.stringify(body),
  });
const detailRequest = () =>
  new Request(
    "http://localhost/api/pull-requests/details?repository=acme/widgets&number=42",
  );

describe("PR routes", () => {
  it("validates filters before doing work", async () => {
    expect(
      (
        await GET(
          new Request(
            "http://localhost/api/pull-requests?org=acme&tech=x&repository=other/private",
          ),
        )
      ).status,
    ).toBe(400);
    expect(mocks.search).not.toHaveBeenCalled();
  });
  it("passes validated search filters and shares IP-based limits", async () => {
    expect((await GET(searchRequest())).status).toBe(200);
    expect(mocks.search).toHaveBeenCalledWith({
      org: "acme",
      tech: "React",
      repository: "",
      status: "open",
      sort: "updated",
      page: 1,
    });
    expect(mocks.limited).toHaveBeenCalledWith("pr:search:203.0.113.9");
  });
  it("enriches valid references and loads individual changes", async () => {
    const references = [{ id: "PR_1", repository: "acme/widgets" }];
    expect((await POST(post(references))).status).toBe(200);
    expect(mocks.enrich).toHaveBeenCalledWith(references);
    expect((await details(detailRequest())).status).toBe(200);
    expect(mocks.details).toHaveBeenCalledWith("acme/widgets", 42);
  });
  it.each([
    [],
    {},
    [null],
    [{ id: "!", repository: "acme/widgets" }],
    [{ id: "PR_1", repository: "../secret" }],
    Array(25).fill({ id: "PR_1", repository: "acme/widgets" }),
  ])("rejects invalid enrichment %j", async (body) => {
    expect((await POST(post(body))).status).toBe(400);
    expect(mocks.enrich).not.toHaveBeenCalled();
  });
  it("rejects malformed and oversized JSON", async () => {
    expect(
      (
        await POST(
          new Request("http://localhost", { method: "POST", body: "{" }),
        )
      ).status,
    ).toBe(400);
    expect((await POST(post("x".repeat(12001)))).status).toBe(400);
  });
  it.each([
    "repository=bad&number=1",
    "repository=acme/widgets&number=-1",
    "repository=acme/widgets&number=1.5",
  ])("rejects invalid details %s", async (params) => {
    expect(
      (
        await details(
          new Request(`http://localhost/api/pull-requests/details?${params}`),
        )
      ).status,
    ).toBe(400);
  });
  it.each(["search", "enrich", "details"] as const)(
    "handles %s limits and upstream failures",
    async (service) => {
      const run = () =>
        service === "search"
          ? GET(searchRequest())
          : service === "enrich"
            ? POST(post([{ id: "PR_1", repository: "acme/widgets" }]))
            : details(detailRequest());
      mocks.limited.mockReturnValueOnce(true);
      const limited = await run();
      expect(limited.status).toBe(429);
      expect(limited.headers.get("retry-after")).toBe("60");
      mocks[service].mockRejectedValueOnce(
        new RateLimitError("Rate limited", 120),
      );
      const upstream = await run();
      expect(upstream.status).toBe(429);
      expect(upstream.headers.get("retry-after")).toBe("120");
      mocks[service].mockRejectedValueOnce(new Error("private error details"));
      const failure = await run();
      expect(failure.status).toBe(502);
      expect(JSON.stringify(await failure.json())).not.toContain(
        "private error",
      );
    },
  );
});
