// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/admin/components/user-management-table", () => ({
  UserManagementTable: ({ currentUserId }: { currentUserId?: string }) => (
    <div data-testid="user-management-table">User Table: {currentUserId}</div>
  ),
}));

vi.mock("@/features/issues/components/admin-email-card", () => ({
  AdminEmailCard: ({ defaultEmail }: { defaultEmail: string }) => (
    <div data-testid="admin-email-card">Email Card: {defaultEmail}</div>
  ),
}));

import { AdminDashboard } from "@/features/admin/components/admin-dashboard";

describe("AdminDashboard", () => {
  afterEach(cleanup);

  it("renders with user management tab active by default", () => {
    render(
      <AdminDashboard
        currentUserId="admin-1"
        currentUserEmail="admin@example.com"
      />,
    );

    expect(screen.getByText("Admin Console")).toBeTruthy();
    expect(screen.getByTestId("user-management-table")).toBeTruthy();
    expect(screen.queryByTestId("admin-email-card")).toBeNull();
  });

  it("switches to email delivery tools tab", () => {
    render(
      <AdminDashboard
        currentUserId="admin-1"
        currentUserEmail="admin@example.com"
      />,
    );

    const emailTab = screen.getByRole("button", { name: "Email Delivery Tools" });
    fireEvent.click(emailTab);

    expect(screen.getByTestId("admin-email-card")).toBeTruthy();
    expect(screen.queryByTestId("user-management-table")).toBeNull();

    const usersTab = screen.getByRole("button", { name: "User Management" });
    fireEvent.click(usersTab);

    expect(screen.getByTestId("user-management-table")).toBeTruthy();
  });
});
