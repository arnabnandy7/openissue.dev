import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getOpportunities,
  updateOpportunity,
  updateOpportunityWorkflow,
} from "@/features/issues/lib/opportunity-cloud";
import type { Issue } from "@/features/issues/types/search";

afterEach(() => vi.restoreAllMocks());

const issue = {
  title: "Improve widgets",
  url: "https://github.com/acme/widgets/issues/12",
} as Issue;

describe("opportunity cloud client", () => {
  it("loads and updates opportunities", async () => {
    const opportunity = { id: "opportunity-1", savedAt: null };
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ opportunities: [opportunity] }))
      .mockResolvedValueOnce(Response.json({ opportunity }))
      .mockResolvedValueOnce(Response.json({ opportunity }));

    await expect(getOpportunities()).resolves.toEqual([opportunity]);
    await expect(updateOpportunity(issue, "open")).resolves.toEqual(opportunity);
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/opportunities",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          action: "open",
          issue: { title: issue.title, url: issue.url },
        }),
      }),
    );

    await expect(
      updateOpportunityWorkflow("opportunity-1", {
        workflowState: "working",
        note: "Add tests",
        followUpDate: "2026-09-15",
      }),
    ).resolves.toEqual(opportunity);
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/opportunities",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({
          id: "opportunity-1",
          workflowState: "working",
          note: "Add tests",
          followUpDate: "2026-09-15",
        }),
      }),
    );
  });

  it("surfaces API and fallback errors", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        Response.json({ error: "Unable to save." }, { status: 400 }),
      )
      .mockResolvedValueOnce(Response.json({}, { status: 500 }));

    await expect(updateOpportunity(issue, "save")).rejects.toThrow(
      "Unable to save.",
    );
    await expect(getOpportunities()).rejects.toThrow("Request failed.");
  });
});
