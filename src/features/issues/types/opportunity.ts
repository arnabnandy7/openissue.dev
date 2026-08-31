export const OPPORTUNITY_WORKFLOW_STATES = [
  "saved",
  "asked",
  "working",
  "prOpened",
  "merged",
  "abandoned",
] as const;

export type OpportunityWorkflowState =
  (typeof OPPORTUNITY_WORKFLOW_STATES)[number];

export type Opportunity = {
  id: string;
  repositoryFullName: string;
  issueNumber: number;
  issueUrl: string;
  title: string;
  savedAt: string | null;
  openedAt: string | null;
  workflowState: OpportunityWorkflowState;
  note: string | null;
  followUpAt: string | null;
  workflowUpdatedAt: string;
};

export type OpportunityAction = "open" | "save" | "unsave";

export type OpportunityWorkflowUpdate = {
  workflowState: OpportunityWorkflowState;
  note: string;
  followUpDate: string;
};
