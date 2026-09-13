import { NextResponse } from "next/server";
import { isRateLimitError } from "@/lib/github";
import { getRepositorySuggestions } from "@/features/organizations/server/suggestions";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const org = searchParams.get("org") ?? "";
  const query = searchParams.get("query") ?? "";

  if (!org.trim()) {
    return NextResponse.json(
      { error: "Organization parameter is required." },
      { status: 400 },
    );
  }

  try {
    const repositories = await getRepositorySuggestions(org, query);
    return NextResponse.json({ repositories });
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
    return NextResponse.json(
      { error: "Failed to fetch repository suggestions." },
      { status: 500 },
    );
  }
}
