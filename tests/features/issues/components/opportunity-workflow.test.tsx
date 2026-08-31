// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Opportunity } from "@/features/issues/types/opportunity";

const { getOpportunities, updateOpportunityWorkflow } = vi.hoisted(() => ({
  getOpportunities: vi.fn(),
  updateOpportunityWorkflow: vi.fn(),
}));

vi.mock("@/features/issues/lib/opportunity-cloud", () => ({
  getOpportunities,
  updateOpportunityWorkflow,
}));

vi.mock("@/components/ui/select", () => ({
  Select: ({
    value,
    onValueChange,
  }: {
    value: string;
    onValueChange: (value: string) => void;
    children: React.ReactNode;
  }) => {
    const isPeriod = /^\d+$/.test(value);
    const isFilter = value === "all";
    const label = isPeriod
      ? "Stale opportunity period"
      : isFilter
        ? "Filter by workflow state"
        : "Workflow state";
    const values = isPeriod
      ? ["7", "14", "30", "60"]
      : ["all", "saved", "asked", "working", "prOpened", "merged", "abandoned"];

    return (
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
      >
        {values.map((item) => <option key={item} value={item}>{item}</option>)}
      </select>
    );
  },
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectContent: () => null,
  SelectItem: () => null,
}));

import { OpportunityWorkflow } from "@/features/issues/components/opportunity-workflow";

const savedOpportunity: Opportunity = {
  id: "opportunity-1",
  repositoryFullName: "acme/widgets",
  issueNumber: 12,
  issueUrl: "https://github.com/acme/widgets/issues/12",
  title: "Improve widget documentation",
  savedAt: "2026-08-01T00:00:00.000Z",
  openedAt: null,
  workflowState: "saved",
  note: "Read the contributing guide",
  followUpAt: "2026-09-10T00:00:00.000Z",
  workflowUpdatedAt: "2026-08-01T00:00:00.000Z",
};

describe("OpportunityWorkflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-09-01T00:00:00.000Z"));
    getOpportunities.mockResolvedValue([savedOpportunity]);
    updateOpportunityWorkflow.mockImplementation(async (_id, draft) => ({
      ...savedOpportunity,
      workflowState: draft.workflowState,
      note: draft.note,
      followUpAt: draft.followUpDate
        ? `${draft.followUpDate}T00:00:00.000Z`
        : null,
      workflowUpdatedAt: "2026-09-01T00:00:00.000Z",
    }));
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("loads saved opportunities and updates their workflow", async () => {
    render(<OpportunityWorkflow />);

    expect(screen.getByText("Loading workflow…")).toBeTruthy();
    expect(await screen.findByRole("link", { name: /Improve widget documentation/ })).toHaveProperty(
      "href",
      savedOpportunity.issueUrl,
    );
    expect(screen.getByText("Needs follow-up")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Workflow state"), {
      target: { value: "working" },
    });
    fireEvent.change(screen.getByLabelText("Private note"), {
      target: { value: "Preparing a pull request" },
    });
    fireEvent.change(screen.getByDisplayValue("2026-09-10"), {
      target: { value: "2026-09-15" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save workflow" }));

    await waitFor(() => expect(updateOpportunityWorkflow).toHaveBeenCalledWith(
      savedOpportunity.id,
      {
        workflowState: "working",
        note: "Preparing a pull request",
        followUpDate: "2026-09-15",
      },
    ));
    expect(await screen.findByRole("heading", { name: "Working" })).toBeTruthy();
  });

  it("filters states and changes the stale period", async () => {
    render(<OpportunityWorkflow />);
    await screen.findByText(savedOpportunity.title);

    fireEvent.change(screen.getByLabelText("Filter by workflow state"), {
      target: { value: "merged" },
    });
    expect(screen.queryByText(savedOpportunity.title)).toBeNull();

    fireEvent.change(screen.getByLabelText("Stale opportunity period"), {
      target: { value: "60" },
    });
  });

  it("shows empty state and ignores opportunities that are not saved", async () => {
    getOpportunities.mockResolvedValueOnce([{ ...savedOpportunity, savedAt: null }]);
    render(<OpportunityWorkflow />);

    expect(await screen.findByText(
      "Save an opportunity to start tracking its contribution workflow.",
    )).toBeTruthy();
  });

  it.each([
    [new Error("Unable to reach the server."), "Unable to reach the server."],
    ["offline", "Unable to load opportunities."],
  ])("shows load failures", async (failure, message) => {
    getOpportunities.mockRejectedValueOnce(failure);
    render(<OpportunityWorkflow />);
    expect(await screen.findByText(message)).toBeTruthy();
  });

  it.each([
    [new Error("Update rejected."), "Update rejected."],
    ["offline", "Unable to update opportunity."],
  ])("shows save failures", async (failure, message) => {
    updateOpportunityWorkflow.mockRejectedValueOnce(failure);
    render(<OpportunityWorkflow />);
    await screen.findByText(savedOpportunity.title);

    fireEvent.click(screen.getByRole("button", { name: "Save workflow" }));
    expect(await screen.findByText(message)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save workflow" })).toBeTruthy();
  });

  it("does not update state after unmounting", async () => {
    let resolveOpportunities: ((items: Opportunity[]) => void) | undefined;
    getOpportunities.mockReturnValueOnce(new Promise((resolve) => {
      resolveOpportunities = resolve;
    }));
    const view = render(<OpportunityWorkflow />);

    view.unmount();
    await act(async () => resolveOpportunities?.([savedOpportunity]));
  });
});
