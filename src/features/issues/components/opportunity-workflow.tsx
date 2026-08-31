"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, CalendarClock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getOpportunities,
  updateOpportunityWorkflow,
} from "@/features/issues/lib/opportunity-cloud";
import {
  OPPORTUNITY_WORKFLOW_STATES,
  type Opportunity,
  type OpportunityWorkflowState,
} from "@/features/issues/types/opportunity";

const WORKFLOW_LABELS: Record<OpportunityWorkflowState, string> = {
  saved: "Saved",
  asked: "Asked maintainer",
  working: "Working",
  prOpened: "PR opened",
  merged: "Merged",
  abandoned: "Abandoned",
};

type WorkflowDraft = {
  workflowState: OpportunityWorkflowState;
  note: string;
  followUpDate: string;
};

function draftFromOpportunity(opportunity: Opportunity): WorkflowDraft {
  return {
    workflowState: opportunity.workflowState,
    note: opportunity.note ?? "",
    followUpDate: opportunity.followUpAt?.slice(0, 10) ?? "",
  };
}

function WorkflowCard({
  opportunity,
  staleAfterDays,
  onSaved,
}: Readonly<{
  opportunity: Opportunity;
  staleAfterDays: number;
  onSaved: (opportunity: Opportunity) => void;
}>) {
  const [draft, setDraft] = useState(() => draftFromOpportunity(opportunity));
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [renderedAt] = useState(() => Date.now());
  const staleBefore = renderedAt - staleAfterDays * 24 * 60 * 60 * 1_000;
  const isStale = Date.parse(opportunity.workflowUpdatedAt) < staleBefore;

  async function save() {
    setIsSaving(true);
    setError(null);
    try {
      const updated = await updateOpportunityWorkflow(opportunity.id, draft);
      onSaved(updated);
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : "Unable to update opportunity.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Card className={isStale ? "border-amber-500/50" : undefined}>
      <CardHeader className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Badge variant="secondary">{opportunity.repositoryFullName}</Badge>
          {isStale ? <Badge variant="outline">Needs follow-up</Badge> : null}
        </div>
        <CardTitle className="text-base">
          <a
            href={opportunity.issueUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-start justify-between gap-2 hover:underline"
          >
            <span>{opportunity.title}</span>
            <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0" />
          </a>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-3">
        <div className="min-w-0 space-y-3">
          <Select
            value={draft.workflowState}
            onValueChange={(workflowState) =>
              setDraft((current) => ({
                ...current,
                workflowState: workflowState as OpportunityWorkflowState,
              }))
            }
          >
            <SelectTrigger className="w-full" aria-label="Workflow state">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {OPPORTUNITY_WORKFLOW_STATES.map((state) => (
                <SelectItem key={state} value={state}>
                  {WORKFLOW_LABELS[state]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <label className="space-y-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <CalendarClock className="h-3.5 w-3.5" />
              Follow-up date
            </span>
            <Input
              type="date"
              value={draft.followUpDate}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  followUpDate: event.target.value,
                }))
              }
            />
          </label>
        </div>

        <div className="min-w-0 space-y-3">
          <textarea
            aria-label="Private note"
            value={draft.note}
            maxLength={2_000}
            rows={3}
            placeholder="Private note"
            className="w-full resize-none rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            onChange={(event) =>
              setDraft((current) => ({ ...current, note: event.target.value }))
            }
          />

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Button
            type="button"
            size="sm"
            disabled={isSaving}
            onClick={() => void save()}
          >
            {isSaving ? "Saving…" : "Save workflow"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function OpportunityWorkflow() {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [stateFilter, setStateFilter] = useState<OpportunityWorkflowState | "all">(
    "all",
  );
  const [staleAfterDays, setStaleAfterDays] = useState(14);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void getOpportunities()
      .then((items) => {
        if (!cancelled) {
          setOpportunities(items.filter((item) => item.savedAt));
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load opportunities.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const visibleStates =
    stateFilter === "all" ? OPPORTUNITY_WORKFLOW_STATES : [stateFilter];

  function replaceOpportunity(updated: Opportunity) {
    setOpportunities((current) =>
      current.map((item) => (item.id === updated.id ? updated : item)),
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Contribution workflow</CardTitle>
          <CardDescription>
            Track saved opportunities, private notes, and follow-up dates.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Select
            value={stateFilter}
            onValueChange={(value) =>
              setStateFilter(value as OpportunityWorkflowState | "all")
            }
          >
            <SelectTrigger aria-label="Filter by workflow state">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All states</SelectItem>
              {OPPORTUNITY_WORKFLOW_STATES.map((state) => (
                <SelectItem key={state} value={state}>
                  {WORKFLOW_LABELS[state]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={String(staleAfterDays)}
            onValueChange={(value) => setStaleAfterDays(Number(value))}
          >
            <SelectTrigger aria-label="Stale opportunity period">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="w-64">
              {[7, 14, 30, 60].map((days) => (
                <SelectItem key={days} value={String(days)}>
                  Follow up after {days} days
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading workflow…</p>
      ) : null}
      {!isLoading && !error && opportunities.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Save an opportunity to start tracking its contribution workflow.
        </p>
      ) : null}

      {visibleStates.map((state) => {
        const items = opportunities.filter((item) => item.workflowState === state);
        if (items.length === 0) return null;

        return (
          <section key={state} className="space-y-3" aria-labelledby={`${state}-heading`}>
            <div className="flex items-center gap-2">
              <h2 id={`${state}-heading`} className="font-semibold">
                {WORKFLOW_LABELS[state]}
              </h2>
              <Badge variant="secondary">{items.length}</Badge>
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              {items.map((opportunity) => (
                <WorkflowCard
                  key={opportunity.id}
                  opportunity={opportunity}
                  staleAfterDays={staleAfterDays}
                  onSaved={replaceOpportunity}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
