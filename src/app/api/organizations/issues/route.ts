import { NextResponse } from "next/server";
import { isRateLimitError } from "@/lib/github";
import {
  readOrganizationFilters,
  validateOrganizationFilters,
} from "@/features/organizations/filters";
import { searchOrganizationIssues } from "@/features/organizations/server/search";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const filters = readOrganizationFilters(searchParams);
  const validationError = validateOrganizationFilters(filters);

  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  try {
    const result = await searchOrganizationIssues(filters);
    return NextResponse.json(result);
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
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to search organization issues.",
      },
      { status: 502 },
    );
  }
}
