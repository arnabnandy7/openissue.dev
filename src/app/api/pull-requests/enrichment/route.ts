import { NextResponse } from "next/server";
import { REPOSITORY_PATTERN } from "@/features/pull-requests/filters";
import {
  enrichPullRequests,
  type EnrichmentReference,
} from "@/features/pull-requests/server/enrichment";
import {
  limitPullRequestRequest,
  pullRequestApiError,
} from "@/features/pull-requests/server/api";

export async function POST(request: Request) {
  const limited = limitPullRequestRequest(request, "enrichment");
  if (limited) return limited;
  let body: unknown;
  try {
    const text = await request.text();
    if (text.length > 12000)
      return NextResponse.json(
        { error: "Request is too large." },
        { status: 400 },
      );
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  if (
    !Array.isArray(body) ||
    body.length < 1 ||
    body.length > 24 ||
    !body.every(
      (reference) =>
        reference &&
        typeof reference.id === "string" &&
        /^[a-zA-Z0-9_=-]{1,200}$/.test(reference.id) &&
        typeof reference.repository === "string" &&
        REPOSITORY_PATTERN.test(reference.repository),
    )
  ) {
    return NextResponse.json(
      { error: "Provide 1–24 valid pull request references." },
      { status: 400 },
    );
  }
  try {
    return NextResponse.json(
      await enrichPullRequests(body as EnrichmentReference[]),
    );
  } catch (error) {
    return pullRequestApiError(error);
  }
}
