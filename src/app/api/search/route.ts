import { NextResponse } from "next/server";
import { searchGitHubIssues } from "@/features/issues/server/github-search";

export async function GET(request: Request) {
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
