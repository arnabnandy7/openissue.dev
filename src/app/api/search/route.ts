import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { searchGitHubIssues } from "@/features/issues/server/github-search";

const ipRequestMap = new Map<string, number[]>();
const LIMIT = 6; // Max 6 requests
const WINDOW = 60000; // per 1 minute (60,000 ms)

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const timestamps = ipRequestMap.get(ip) || [];
  
  // Filter out timestamps outside the window
  const recentTimestamps = timestamps.filter(t => now - t < WINDOW);
  
  if (recentTimestamps.length >= LIMIT) {
    return true;
  }
  
  recentTimestamps.push(now);
  ipRequestMap.set(ip, recentTimestamps);
  return false;
}

export async function GET(request: Request) {
  const headersList = await headers();
  const ip = headersList.get("x-forwarded-for")?.split(",")[0] || "unknown";

  if (isRateLimited(ip)) {
    return NextResponse.json(
      { error: "Too many search requests. Please slow down and try again in a minute." },
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

  try {
    const payload = await searchGitHubIssues({
      tech,
      label: searchParams.get("label"),
      sort: searchParams.get("sort"),
    });

    return NextResponse.json(payload);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to search GitHub issues.";

    return NextResponse.json({ error: message }, { status: 502 });
  }
}
