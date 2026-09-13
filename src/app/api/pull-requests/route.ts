import { NextResponse } from "next/server";
import {
  readPullRequestFilters,
  validatePullRequestFilters,
} from "@/features/pull-requests/filters";
import { searchPullRequests } from "@/features/pull-requests/server/search";
import {
  limitPullRequestRequest,
  pullRequestApiError,
} from "@/features/pull-requests/server/api";

export async function GET(request: Request) {
  const filters = readPullRequestFilters(new URL(request.url).searchParams);
  const error = validatePullRequestFilters(filters);
  if (error) return NextResponse.json({ error }, { status: 400 });
  const limited = limitPullRequestRequest(request, "search");
  if (limited) return limited;
  try {
    return NextResponse.json(await searchPullRequests(filters));
  } catch (error) {
    return pullRequestApiError(error);
  }
}
