import { NextResponse } from "next/server";
import { REPOSITORY_PATTERN } from "@/features/pull-requests/filters";
import { getPullRequestDetails } from "@/features/pull-requests/server/enrichment";
import {
  limitPullRequestRequest,
  pullRequestApiError,
} from "@/features/pull-requests/server/api";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const repository = params.get("repository") ?? "";
  const number = Number(params.get("number"));
  if (
    !REPOSITORY_PATTERN.test(repository) ||
    !Number.isSafeInteger(number) ||
    number < 1
  )
    return NextResponse.json(
      { error: "Provide a valid repository and PR number." },
      { status: 400 },
    );
  const limited = limitPullRequestRequest(request, "details");
  if (limited) return limited;
  try {
    return NextResponse.json(await getPullRequestDetails(repository, number));
  } catch (error) {
    return pullRequestApiError(error);
  }
}
