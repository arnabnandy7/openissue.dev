import { asc, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { savedSearch } from "@/lib/auth-schema";
import { getDatabase } from "@/lib/db";
import {
  isValidSavedSearch,
  type SavedSearch,
} from "@/features/issues/lib/saved-searches";

const MAX_SAVED_SEARCHES_PER_SYNC = 100;
const MAX_TEXT_LENGTH = 200;

function isSafeSavedSearch(value: unknown): value is SavedSearch {
  if (!isValidSavedSearch(value)) return false;

  return (
    value.id.length > 0 &&
    value.id.length <= MAX_TEXT_LENGTH &&
    value.name.length > 0 &&
    value.name.length <= MAX_TEXT_LENGTH &&
    value.tech.length > 0 &&
    value.tech.length <= MAX_TEXT_LENGTH &&
    !Number.isNaN(Date.parse(value.createdAt))
  );
}

async function listSavedSearches(userId: string): Promise<SavedSearch[]> {
  const rows = await getDatabase()
    .select()
    .from(savedSearch)
    .where(eq(savedSearch.userId, userId))
    .orderBy(asc(savedSearch.createdAt));

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    tech: row.tech,
    label: row.label,
    sort: row.sort,
    linkedPr: row.linkedPr,
    hacktoberfest: row.hacktoberfest,
    experience: row.experience,
    contributionType: row.contributionType,
    scope: row.scope,
    responsiveness: row.responsiveness,
    readiness: row.readiness,
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const searches = (body as { searches?: unknown } | null)?.searches;

  if (
    !Array.isArray(searches) ||
    searches.length > MAX_SAVED_SEARCHES_PER_SYNC ||
    !searches.every(isSafeSavedSearch)
  ) {
    return Response.json({ error: "Invalid saved searches." }, { status: 400 });
  }

  const database = getDatabase();

  for (const search of searches) {
    await database
      .insert(savedSearch)
      .values({
        ...search,
        userId: session.user.id,
        createdAt: new Date(search.createdAt),
      })
      .onConflictDoNothing();
  }

  return Response.json({
    searches: await listSavedSearches(session.user.id),
  });
}
