import { NextResponse } from "next/server";
import { getTechnologySuggestions } from "@/features/organizations/server/suggestions";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("query") ?? "";

  const technologies = getTechnologySuggestions(query);
  return NextResponse.json({ technologies });
}
