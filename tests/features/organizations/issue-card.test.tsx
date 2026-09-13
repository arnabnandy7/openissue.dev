// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OrganizationIssueCard } from "@/features/organizations/components/organization-issue-card";
import type { OrganizationIssue } from "@/features/organizations/types";

describe("OrganizationIssueCard", () => {
  it("renders closed issue without labels or author avatar", () => {
    const closedIssue: OrganizationIssue = {
      id: "I_closed",
      number: 99,
      title: "Closed bug report",
      url: "https://github.com/facebook/react/issues/99",
      repository: "facebook/react",
      author: "bob",
      status: "closed",
      labels: [],
      comments: 0,
      createdAt: "2026-08-01T00:00:00Z",
      updatedAt: "2026-08-02T00:00:00Z",
    };

    render(<OrganizationIssueCard issue={closedIssue} />);
    expect(screen.getByText("facebook/react #99")).toBeTruthy();
    expect(screen.getByText("Closed bug report")).toBeTruthy();
    expect(screen.getByText("Closed")).toBeTruthy();
    expect(screen.getByText("bob")).toBeTruthy();
  });

  it("renders open issue with author avatar and labels", () => {
    const openIssue: OrganizationIssue = {
      id: "I_open",
      number: 100,
      title: "Open feature request",
      url: "https://github.com/facebook/react/issues/100",
      repository: "facebook/react",
      author: "alice",
      authorAvatarUrl: "https://example.com/alice.png",
      status: "open",
      labels: [{ name: "enhancement", color: "a2eeef" }],
      comments: 3,
      createdAt: "2026-08-01T00:00:00Z",
      updatedAt: "2026-08-02T00:00:00Z",
    };

    render(<OrganizationIssueCard issue={openIssue} />);
    expect(screen.getByText("facebook/react #100")).toBeTruthy();
    expect(screen.getByText("Open feature request")).toBeTruthy();
    expect(screen.getByText("enhancement")).toBeTruthy();
  });
});
