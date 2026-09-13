export class RateLimitError extends Error {
  retryAfterSeconds: number | null;

  constructor(message: string, retryAfterSeconds: number | null = null) {
    super(message);
    this.name = "RateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export function isRateLimitError(error: unknown): error is RateLimitError {
  return error instanceof RateLimitError;
}

function isAllowedGitHubPath(pathname: string) {
  if (
    pathname === "/search/issues" ||
    pathname === "/search/repositories" ||
    pathname === "/search/users"
  ) return true;
  const [, resource, owner = "", name = "", ...remaining] = pathname.split("/");
  if (
    resource !== "repos" ||
    !/^[a-zA-Z0-9-]+$/.test(owner) ||
    !/^[a-zA-Z0-9_.-]+$/.test(name) ||
    name === "." || name === ".."
  ) return false;
  const suffix = remaining.length ? "/" + remaining.join("/") : "";
  if (suffix === "" || suffix === "/community/profile") return true;
  return /^\/issues\/[1-9]\d*\/(?:comments|timeline)$/.test(suffix) ||
    /^\/pulls\/[1-9]\d*$/.test(suffix);
}

export async function githubFetch<T>(
  url: string,
  token?: string,
  revalidate = 60,
) {
  const target = new URL(url);
  if (
    target.protocol !== "https:" ||
    target.hostname !== "api.github.com" ||
    target.port ||
    target.username ||
    target.password
  ) {
    throw new Error("Only the GitHub HTTPS API is allowed.");
  }
  if (!isAllowedGitHubPath(target.pathname)) {
    throw new Error("Unsupported GitHub API endpoint.");
  }
  // Construct the destination from a fixed origin. Encode every input-bearing
  // component instead of forwarding the caller's URL to the network boundary.
  const path = target.pathname.slice(1).split("/").map((segment) => encodeURIComponent(segment)).join("/");
  const query = Array.from(target.searchParams, ([key, value]) =>
    encodeURIComponent(key) + "=" + encodeURIComponent(value),
  ).join("&");
  const requestUrl = "https://api.github.com/" + path + (query ? "?" + query : "");
  const response = await fetch(requestUrl, {
    redirect: "error",
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    next: { revalidate },
  });

  if (!response.ok) {
    const body = await response.text();
    const retryAfterSeconds = computeRetryAfterSeconds(response.headers);

    if (
      (response.status === 403 || response.status === 429) &&
      isRateLimitResponse(body)
    ) {
      throw new RateLimitError(
        "GitHub API rate limit exceeded. Please wait a few minutes and try again.",
        retryAfterSeconds,
      );
    }

    throw new Error(`GitHub API error ${response.status}: ${body}`);
  }

  return {
    data: (await response.json()) as T,
    rateLimitRemaining: response.headers.get("x-ratelimit-remaining"),
  };
}

export function isRateLimitResponse(body: string): boolean {
  const lower = body.toLowerCase();
  return (
    lower.includes("rate limit") ||
    lower.includes("rate_limit") ||
    lower.includes("api rate limit exceeded") ||
    lower.includes("secondary rate limit")
  );
}

// GitHub's primary rate-limit responses commonly omit `retry-after` and
// instead provide `x-ratelimit-reset`, a Unix timestamp (seconds) for when
// the limit resets. Fall back to computing the delay from that header so we
// don't under-report the wait time with a default cooldown.
export function computeRetryAfterSeconds(headers: Headers): number | null {
  const retryAfter = headers.get("retry-after");
  if (retryAfter) {
    const parsed = Number.parseInt(retryAfter, 10);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }

  const resetHeader = headers.get("x-ratelimit-reset");
  if (resetHeader) {
    const resetEpochSeconds = Number.parseInt(resetHeader, 10);
    if (!Number.isNaN(resetEpochSeconds)) {
      const nowEpochSeconds = Math.floor(Date.now() / 1000);
      return Math.max(0, resetEpochSeconds - nowEpochSeconds);
    }
  }

  return null;
}
