import { headers } from "next/headers";
import { NextResponse } from "next/server";
import {
  isRateLimitError,
  searchGitHubIssues,
} from "@/features/issues/server/github-search";
import { isSearchRateLimited } from "@/features/issues/server/search-rate-limit";

export async function GET(request: Request) {
  const headersList = await headers();
  const ip = headersList.get("x-forwarded-for")?.split(",")[0] || "unknown";

  if (isSearchRateLimited(`ip:${ip}`)) {
    return NextResponse.json(
      {
        error: "Too many search requests. Please slow down and try again in a minute.",
        rateLimit: true,
        retryAfter: 60,
      },
      { status: 429 },
    );
  }

  const { searchParams } = new URL(request.url);
  const tech = searchParams.get("tech")?.trim() ?? "";

  if (!tech) {
    return NextResponse.json(
      { error: "A technology is required." },
      { status: 400 },
    );
  }

  const pageParam = searchParams.get("page");
  const page = pageParam ? Math.max(1, Number.parseInt(pageParam, 10) || 1) : 1;

  try {
    const payload = await searchGitHubIssues({
      tech,
      label: searchParams.get("label"),
      sort: searchParams.get("sort"),
      linkedPr: searchParams.get("linkedPr"),
      hacktoberfest: searchParams.get("hacktoberfest"),
      experience: searchParams.get("experience"),
      contributionType: searchParams.get("contributionType"),
      scope: searchParams.get("scope"),
      responsiveness: searchParams.get("responsiveness"),
      readiness: searchParams.get("readiness"),
      page,
    });

    return NextResponse.json(payload);
  } catch (error) {
    if (isRateLimitError(error)) {
      return NextResponse.json(
        {
          error: error.message,
          rateLimit: true,
          retryAfter: error.retryAfterSeconds,
        },
        { status: 429 },
      );
    }

    const message =
      error instanceof Error ? error.message : "Unable to search GitHub issues.";

    return NextResponse.json({ error: message }, { status: 502 });
  }
}
