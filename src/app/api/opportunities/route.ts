import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { opportunity } from "@/lib/auth-schema";
import { getDatabase } from "@/lib/db";
import {
  OPPORTUNITY_WORKFLOW_STATES,
  type OpportunityAction,
  type OpportunityWorkflowState,
} from "@/features/issues/types/opportunity";

const MAX_TITLE_LENGTH = 500;
const MAX_NOTE_LENGTH = 2_000;

function serializeOpportunity(row: typeof opportunity.$inferSelect) {
  return {
    id: row.id,
    repositoryFullName: row.repositoryFullName,
    issueNumber: row.issueNumber,
    issueUrl: row.issueUrl,
    title: row.title,
    savedAt: row.savedAt?.toISOString() ?? null,
    openedAt: row.openedAt?.toISOString() ?? null,
    workflowState: row.workflowState as OpportunityWorkflowState,
    note: row.note,
    followUpAt: row.followUpAt?.toISOString() ?? null,
    workflowUpdatedAt: row.workflowUpdatedAt.toISOString(),
  };
}

function parseFollowUpDate(input: unknown) {
  if (input === "") return null;
  if (typeof input !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    return undefined;
  }

  const date = new Date(`${input}T00:00:00.000Z`);
  return Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== input
    ? undefined
    : date;
}

function parseIssue(input: unknown) {
  const value = input as { title?: unknown; url?: unknown } | null;
  if (
    typeof value?.title !== "string" ||
    !value.title.trim() ||
    value.title.length > MAX_TITLE_LENGTH ||
    typeof value.url !== "string"
  ) {
    return null;
  }

  let url: URL;
  try {
    url = new URL(value.url);
  } catch {
    return null;
  }

  const match = /^\/([^/]+)\/([^/]+)\/issues\/(\d+)\/?$/.exec(url.pathname);
  const issueNumber = Number(match?.[3]);
  if (url.protocol !== "https:" || url.hostname !== "github.com" || !match || !issueNumber) {
    return null;
  }

  const repositoryFullName = `${match[1]}/${match[2]}`;
  return {
    repositoryFullName,
    issueNumber,
    issueUrl: `https://github.com/${repositoryFullName}/issues/${issueNumber}`,
    title: value.title.trim(),
  };
}

async function upsertOpportunity(
  userId: string,
  issue: NonNullable<ReturnType<typeof parseIssue>>,
  action: Exclude<OpportunityAction, "unsave">,
) {
  const now = new Date();
  await getDatabase()
    .insert(opportunity)
    .values({
      id: crypto.randomUUID(),
      userId,
      ...issue,
      savedAt: action === "save" ? now : null,
      openedAt: action === "open" ? now : null,
      workflowUpdatedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        opportunity.userId,
        opportunity.repositoryFullName,
        opportunity.issueNumber,
      ],
      set: {
        issueUrl: issue.issueUrl,
        title: issue.title,
        savedAt: action === "save" ? now : sql`${opportunity.savedAt}`,
        openedAt: action === "open" ? now : sql`${opportunity.openedAt}`,
        workflowUpdatedAt:
          action === "save" ? now : sql`${opportunity.workflowUpdatedAt}`,
        updatedAt: now,
      },
    });
}

export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const rows = await getDatabase()
    .select()
    .from(opportunity)
    .where(eq(opportunity.userId, session.user.id))
    .orderBy(desc(opportunity.updatedAt));

  return Response.json({ opportunities: rows.map(serializeOpportunity) });
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

  const input = body as { action?: unknown; issue?: unknown } | null;
  const action = input?.action as OpportunityAction;
  const issue = parseIssue(input?.issue);
  if (!issue || !["open", "save", "unsave"].includes(action)) {
    return Response.json({ error: "Invalid opportunity." }, { status: 400 });
  }

  const database = getDatabase();
  const identity = and(
    eq(opportunity.userId, session.user.id),
    eq(opportunity.repositoryFullName, issue.repositoryFullName),
    eq(opportunity.issueNumber, issue.issueNumber),
  );

  if (action === "unsave") {
    await database
      .update(opportunity)
      .set({ savedAt: null })
      .where(identity);
    await database
      .delete(opportunity)
      .where(and(identity, isNull(opportunity.openedAt)));
  } else {
    await upsertOpportunity(session.user.id, issue, action);
  }

  const [updated] = await database
    .select()
    .from(opportunity)
    .where(identity)
    .limit(1);

  return Response.json({
    opportunity: updated ? serializeOpportunity(updated) : null,
  });
}

export async function PATCH(request: Request) {
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

  const input = body as {
    id?: unknown;
    workflowState?: unknown;
    note?: unknown;
    followUpDate?: unknown;
  } | null;
  const followUpAt = parseFollowUpDate(input?.followUpDate);
  if (
    typeof input?.id !== "string" ||
    !input.id ||
    !OPPORTUNITY_WORKFLOW_STATES.includes(
      input.workflowState as OpportunityWorkflowState,
    ) ||
    typeof input.note !== "string" ||
    input.note.length > MAX_NOTE_LENGTH ||
    followUpAt === undefined
  ) {
    return Response.json({ error: "Invalid workflow update." }, { status: 400 });
  }

  const database = getDatabase();
  const identity = and(
    eq(opportunity.id, input.id),
    eq(opportunity.userId, session.user.id),
  );
  await database
    .update(opportunity)
    .set({
      workflowState: input.workflowState as OpportunityWorkflowState,
      note: input.note.trim() || null,
      followUpAt,
      workflowUpdatedAt: new Date(),
    })
    .where(identity);

  const [updated] = await database
    .select()
    .from(opportunity)
    .where(identity)
    .limit(1);

  if (!updated) {
    return Response.json({ error: "Opportunity not found." }, { status: 404 });
  }

  return Response.json({ opportunity: serializeOpportunity(updated) });
}
