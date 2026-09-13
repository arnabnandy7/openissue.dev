import { afterEach, describe, expect, it, vi } from "vitest";
import { githubFetch } from "@/lib/github";

afterEach(() => vi.unstubAllGlobals());

describe("GitHub request boundary", () => {
  it.each([
    "/search/issues", "/search/repositories", "/repos/acme/widgets",
    "/repos/acme/.github/community/profile", "/repos/acme/widgets/issues/42/comments",
    "/repos/acme/widgets/issues/42/timeline", "/repos/acme/widgets/pulls/42",
  ])("allows supported endpoint %s", async (path) => {
    const fetch = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", fetch);
    await githubFetch("https://api.github.com" + path);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it.each([
    "/repos/acme/widgets/pulls/0", "/repos/acme/widgets/pulls/-1",
    "/repos/acme/widgets/issues/42/comments/extra", "/repos/acme/widgets/",
    "/repos/acme/", "/repos/acme/widgets/issues/0/timeline",
    "/repos/acme/widgets!/community/profile", "/repos/acme!/widgets",
    "/repos//widgets", "/repos/acme/widgets//community/profile",
  ])("rejects invalid repository endpoint %s", async (path) => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(githubFetch("https://api.github.com" + path)).rejects.toThrow("Unsupported GitHub API endpoint.");
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([
    "https://api.github.com/user/emails",
    "https://api.github.com/repos/acme/widgets/contents/.env",
    "https://api.github.com//attacker.example/path",
    "https://api.github.com/repos/acme/widgets/issues/1/../../../../user",
    "https://api.github.com/repos/acme/widgets%2F..%2Fprivate",
  ])("rejects unintended GitHub paths %s", async (url) => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(githubFetch(url, "test-token")).rejects.toThrow("Unsupported GitHub API endpoint.");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("keeps malicious-looking filter text within encoded query values", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", fetch);
    const query = 'is:pr https://attacker.example/a?x=1&y=2 #fragment';
    const url = new URL("https://api.github.com/search/issues");
    url.searchParams.set("q", query);
    await githubFetch(url.toString());
    const destination = new URL(fetch.mock.calls[0][0]);
    expect(destination.origin).toBe("https://api.github.com");
    expect(destination.pathname).toBe("/search/issues");
    expect([...destination.searchParams]).toEqual([["q", query]]);
    expect(destination.hash).toBe("");
  });
  it.each([
    "http://api.github.com/repos/acme/widgets",
    "https://api.github.com.attacker.example/repos/acme/widgets",
    "https://api.github.com@attacker.example/repos/acme/widgets",
    "https://127.0.0.1/admin",
    "https://api.github.com:8443/repos/acme/widgets",
    "https://user:password@api.github.com/repos/acme/widgets",
    "file:///etc/passwd",
  ])(
    "rejects unsafe destination %s before sending credentials",
    async (url) => {
      const fetch = vi.fn();
      vi.stubGlobal("fetch", fetch);
      await expect(githubFetch(url, "test-token")).rejects.toThrow(
        "Only the GitHub HTTPS API is allowed.",
      );
      expect(fetch).not.toHaveBeenCalled();
    },
  );
  it("uses the validated GitHub origin and refuses redirects", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ ok: true })));
    vi.stubGlobal("fetch", fetch);
    expect(
      (
        await githubFetch(
          "https://api.github.com/search/issues?q=is%3Apr",
          "test-token",
        )
      ).data,
    ).toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledWith(
      "https://api.github.com/search/issues?q=is%3Apr",
      expect.objectContaining({
        redirect: "error",
        headers: expect.objectContaining({
          Authorization: "Bearer test-token",
        }),
      }),
    );
  });
});
