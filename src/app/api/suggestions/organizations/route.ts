import { NextResponse } from "next/server";
import { isRateLimitError } from "@/lib/github";
import { getOrganizationSuggestions } from "@/features/organizations/server/suggestions";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("query") ?? "";

  try {
    const organizations = await getOrganizationSuggestions(query);
    return NextResponse.json({ organizations });
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
      { error: "Failed to fetch organization suggestions." },
      { status: 500 },
    );
  }
}
