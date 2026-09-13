import { NextResponse } from "next/server";
import { isSearchRateLimited } from "@/features/issues/server/search-rate-limit";
import { isRateLimitError } from "@/lib/github";

export function limitPullRequestRequest(
  request: Request,
  category: "search" | "enrichment" | "details",
) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!isSearchRateLimited(`pr:${category}:${ip}`)) return null;
  return NextResponse.json(
    { error: "Too many requests. Try again in a minute.", retryAfter: 60 },
    { status: 429, headers: { "Retry-After": "60" } },
  );
}

export function pullRequestApiError(error: unknown) {
  if (isRateLimitError(error)) {
    const retryAfter = error.retryAfterSeconds ?? 60;
    return NextResponse.json(
      { error: error.message, retryAfter },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }
  return NextResponse.json(
    {
      error:
        "GitHub data is unavailable. Check the organization and repository, or try again later.",
    },
    { status: 502 },
  );
}
