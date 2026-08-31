import type { Issue } from "@/features/issues/types/search";
import type {
  Opportunity,
  OpportunityAction,
  OpportunityWorkflowUpdate,
} from "@/features/issues/types/opportunity";

async function jsonResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error ?? "Request failed.");
  return payload;
}

export async function getOpportunities() {
  const payload = await jsonResponse<{ opportunities: Opportunity[] }>(
    await fetch("/api/opportunities"),
  );
  return payload.opportunities;
}

export async function updateOpportunity(issue: Issue, action: OpportunityAction) {
  const payload = await jsonResponse<{ opportunity: Opportunity | null }>(
    await fetch("/api/opportunities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        issue: { title: issue.title, url: issue.url },
      }),
    }),
  );
  return payload.opportunity;
}

export async function updateOpportunityWorkflow(
  id: string,
  update: OpportunityWorkflowUpdate,
) {
  const payload = await jsonResponse<{ opportunity: Opportunity }>(
    await fetch("/api/opportunities", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...update }),
    }),
  );
  return payload.opportunity;
}
