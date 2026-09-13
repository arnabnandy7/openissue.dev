// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { listAdminUsers, setUserRole, revokeUserSessions, banUser, unbanUser } =
  vi.hoisted(() => ({
    listAdminUsers: vi.fn(),
    setUserRole: vi.fn(),
    revokeUserSessions: vi.fn(),
    banUser: vi.fn(),
    unbanUser: vi.fn(),
  }));

vi.mock("@/features/admin/lib/admin-users-client", () => ({
  listAdminUsers,
  setUserRole,
  revokeUserSessions,
  banUser,
  unbanUser,
}));

vi.mock("next/image", () => ({
  default: ({ alt, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} {...props} />
  ),
}));

vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: any) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: any) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: any) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onClick, disabled, className }: any) => (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={className}
    >
      {children}
    </button>
  ),
  DropdownMenuLabel: ({ children }: any) => <div>{children}</div>,
  DropdownMenuSeparator: () => <hr />,
}));

vi.mock("@/components/ui/select", () => ({
  Select: ({ value, onValueChange, children }: any) => (
    <div data-testid={`select-wrapper-${value}`}>
      <select
        data-testid="mock-select"
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
      >
        {children}
      </select>
    </div>
  ),
  SelectTrigger: ({ children }: any) => <>{children}</>,
  SelectValue: () => null,
  SelectContent: ({ children }: any) => <>{children}</>,
  SelectItem: ({ children, value }: any) => (
    <option value={value}>{children}</option>
  ),
}));

vi.mock("@/features/admin/components/block-user-dialog", () => ({
  BlockUserDialog: ({ user, mode, open, onSuccess, onOpenChange }: any) =>
    open && user ? (
      <div data-testid="mock-block-dialog">
        <span>Dialog mode: {mode}</span>
        <button
          type="button"
          data-testid="mock-dialog-close-btn"
          onClick={() => onOpenChange(false)}
        >
          Cancel
        </button>
        <button
          type="button"
          data-testid="mock-dialog-success-btn"
          onClick={() =>
            onSuccess({
              ...user,
              banned: mode === "block",
            })
          }
        >
          Confirm Success
        </button>
      </div>
    ) : null,
}));

import { UserManagementTable } from "@/features/admin/components/user-management-table";

const mockUsers = [
  {
    id: "user-1",
    name: "Arnab Nandy",
    email: "arnab@example.com",
    emailVerified: true,
    role: "admin",
    banned: false,
    image: "https://example.com/avatar1.png",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "user-2",
    name: "Bad Actor",
    email: "bad@example.com",
    emailVerified: false,
    role: "user",
    banned: true,
    banReason: "Spamming",
    image: null,
    createdAt: "2026-02-01T00:00:00.000Z",
    updatedAt: "2026-02-01T00:00:00.000Z",
  },
  {
    id: "user-3",
    name: "Good Contributor",
    email: "good@example.com",
    emailVerified: true,
    role: "user",
    banned: false,
    image: "https://example.com/avatar3.png",
    createdAt: "2026-02-05T00:00:00.000Z",
    updatedAt: "2026-02-05T00:00:00.000Z",
  },
  {
    id: "user-4",
    name: "Colleague Admin",
    email: "colleague@example.com",
    emailVerified: true,
    role: "admin",
    banned: false,
    image: null,
    createdAt: "2026-02-10T00:00:00.000Z",
    updatedAt: "2026-02-10T00:00:00.000Z",
  },
];

describe("UserManagementTable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listAdminUsers.mockResolvedValue({
      users: mockUsers,
      total: 25,
    });
  });

  afterEach(cleanup);

  it("renders user table with user records, roles, and status badges", async () => {
    render(<UserManagementTable currentUserId="user-1" />);

    await waitFor(() => {
      expect(screen.getByText("Arnab Nandy")).toBeTruthy();
      expect(screen.getByText("arnab@example.com")).toBeTruthy();
      expect(screen.getByText("You")).toBeTruthy();
      expect(screen.getAllByText("Admin").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("Active").length).toBeGreaterThanOrEqual(1);

      expect(screen.getByText("Bad Actor")).toBeTruthy();
      expect(screen.getByText("bad@example.com")).toBeTruthy();
      expect(screen.getAllByText("Blocked").length).toBeGreaterThanOrEqual(1);
    });
  });

  it("updates search input and triggers debounced user query", async () => {
    render(<UserManagementTable currentUserId="user-1" />);

    await waitFor(() => {
      expect(screen.getByText("Arnab Nandy")).toBeTruthy();
    });

    const searchInput = screen.getByPlaceholderText("Search by name or email…");
    fireEvent.change(searchInput, { target: { value: "bad" } });

    await waitFor(() => {
      expect(listAdminUsers).toHaveBeenCalledWith(
        expect.objectContaining({
          searchValue: "bad",
        }),
      );
    });
  });

  it("renders empty state when no users are found", async () => {
    listAdminUsers.mockResolvedValue({ users: [], total: 0 });

    render(<UserManagementTable currentUserId="user-1" />);

    await waitFor(() => {
      expect(
        screen.getByText("No users found matching current filters."),
      ).toBeTruthy();
    });
  });

  it("handles refresh button click", async () => {
    render(<UserManagementTable currentUserId="user-1" />);

    await waitFor(() => {
      expect(screen.getByText("Arnab Nandy")).toBeTruthy();
    });

    const refreshButton = screen.getByRole("button", {
      name: "Refresh user list",
    });
    fireEvent.click(refreshButton);

    await waitFor(() => {
      expect(listAdminUsers).toHaveBeenCalledTimes(2);
    });
  });

  it("promotes a contributor to admin", async () => {
    setUserRole.mockResolvedValue({});

    render(<UserManagementTable currentUserId="user-1" />);

    await waitFor(() => {
      expect(screen.getByText("Good Contributor")).toBeTruthy();
    });

    const promoteButtons = screen.getAllByText("Promote to Admin");
    // promoteButtons[1] is for Good Contributor (user-3)
    fireEvent.click(promoteButtons[1]);

    await waitFor(() => {
      expect(setUserRole).toHaveBeenCalledWith("user-3", "admin");
      expect(
        screen.getByText(/Role for Good Contributor updated to admin/),
      ).toBeTruthy();
    });
  });

  it("demotes an admin to contributor", async () => {
    setUserRole.mockResolvedValue({});

    render(<UserManagementTable currentUserId="user-1" />);

    await waitFor(() => {
      expect(screen.getByText("Colleague Admin")).toBeTruthy();
    });

    const demoteButtons = screen.getAllByText("Demote to Contributor");
    // demoteButtons[1] is for Colleague Admin (user-4); demoteButtons[0] is user-1 (disabled self)
    fireEvent.click(demoteButtons[1]);

    await waitFor(() => {
      expect(setUserRole).toHaveBeenCalledWith("user-4", "user");
      expect(
        screen.getByText(/Role for Colleague Admin updated to user/),
      ).toBeTruthy();
    });
  });

  it("displays error when role toggle fails", async () => {
    setUserRole.mockRejectedValue(new Error("Permission denied"));

    render(<UserManagementTable currentUserId="user-1" />);

    await waitFor(() => {
      expect(screen.getByText("Good Contributor")).toBeTruthy();
    });

    const promoteButtons = screen.getAllByText("Promote to Admin");
    fireEvent.click(promoteButtons[1]);

    await waitFor(() => {
      expect(screen.getByText("Permission denied")).toBeTruthy();
    });
  });

  it("revokes user sessions", async () => {
    revokeUserSessions.mockResolvedValue({});

    render(<UserManagementTable currentUserId="user-1" />);

    await waitFor(() => {
      expect(screen.getByText("Good Contributor")).toBeTruthy();
    });

    const actionButton = screen.getByRole("button", {
      name: "Actions for Good Contributor",
    });
    fireEvent.click(actionButton);

    const revokeButtons = screen.getAllByText("Revoke all sessions");
    fireEvent.click(revokeButtons[2]);

    await waitFor(() => {
      expect(revokeUserSessions).toHaveBeenCalledWith("user-3");
      expect(
        screen.getByText("Active sessions for Good Contributor were revoked."),
      ).toBeTruthy();
    });
  });

  it("displays error when session revocation fails", async () => {
    revokeUserSessions.mockRejectedValue(new Error("Revocation failed"));

    render(<UserManagementTable currentUserId="user-1" />);

    await waitFor(() => {
      expect(screen.getByText("Good Contributor")).toBeTruthy();
    });

    const actionButton = screen.getByRole("button", {
      name: "Actions for Good Contributor",
    });
    fireEvent.click(actionButton);

    const revokeButtons = screen.getAllByText("Revoke all sessions");
    fireEvent.click(revokeButtons[2]);

    await waitFor(() => {
      expect(screen.getByText("Revocation failed")).toBeTruthy();
    });
  });

  it("handles pagination next and previous controls", async () => {
    render(<UserManagementTable currentUserId="user-1" />);

    await waitFor(() => {
      expect(screen.getByText("Page 1 of 3")).toBeTruthy();
    });

    const nextButton = screen.getByRole("button", { name: "Next" });
    fireEvent.click(nextButton);

    await waitFor(() => {
      expect(listAdminUsers).toHaveBeenCalledWith(
        expect.objectContaining({ offset: 10 }),
      );
    });

    const prevButton = screen.getByRole("button", { name: "Previous" });
    fireEvent.click(prevButton);

    await waitFor(() => {
      expect(listAdminUsers).toHaveBeenCalledWith(
        expect.objectContaining({ offset: 0 }),
      );
    });
  });

  it("displays error banner when user list fetching fails", async () => {
    listAdminUsers.mockRejectedValue(new Error("Network timeout"));

    render(<UserManagementTable currentUserId="user-1" />);

    await waitFor(() => {
      expect(screen.getByText("Network timeout")).toBeTruthy();
    });
  });

  it("displays fallback error message when list fetching throws non-Error", async () => {
    listAdminUsers.mockRejectedValue("Unknown error");

    render(<UserManagementTable currentUserId="user-1" />);

    await waitFor(() => {
      expect(screen.getByText("Failed to load users.")).toBeTruthy();
    });
  });

  it("updates status and role filters", async () => {
    render(<UserManagementTable currentUserId="user-1" />);

    await waitFor(() => {
      expect(screen.getByText("Arnab Nandy")).toBeTruthy();
    });

    const selects = screen.getAllByTestId("mock-select");
    const statusSelect = selects[0];
    const roleSelect = selects[1];

    // Filter by blocked
    fireEvent.change(statusSelect, { target: { value: "blocked" } });
    await waitFor(() => {
      expect(listAdminUsers).toHaveBeenCalledWith(
        expect.objectContaining({
          filterField: "banned",
          filterValue: true,
        }),
      );
    });

    // Filter by active
    fireEvent.change(statusSelect, { target: { value: "active" } });
    await waitFor(() => {
      expect(listAdminUsers).toHaveBeenCalledWith(
        expect.objectContaining({
          filterField: "banned",
          filterValue: false,
        }),
      );
    });

    // Reset status to all and filter by role admin
    fireEvent.change(statusSelect, { target: { value: "all" } });
    fireEvent.change(roleSelect, { target: { value: "admin" } });
    await waitFor(() => {
      expect(listAdminUsers).toHaveBeenCalledWith(
        expect.objectContaining({
          filterField: "role",
          filterValue: "admin",
        }),
      );
    });

    // Filter by role user
    fireEvent.change(roleSelect, { target: { value: "user" } });
    await waitFor(() => {
      expect(listAdminUsers).toHaveBeenCalledWith(
        expect.objectContaining({
          filterField: "role",
          filterValue: "user",
        }),
      );
    });
  });

  it("triggers block dialog and updates user state on success", async () => {
    render(<UserManagementTable currentUserId="user-1" />);

    await waitFor(() => {
      expect(screen.getByText("Good Contributor")).toBeTruthy();
    });

    const blockButtons = screen.getAllByText("Block user");
    // Good Contributor is user-3, whose block button is enabled (user-1 isSelf)
    fireEvent.click(blockButtons[1]);

    expect(screen.getByText("Dialog mode: block")).toBeTruthy();

    const confirmSuccessBtn = screen.getByTestId("mock-dialog-success-btn");
    fireEvent.click(confirmSuccessBtn);

    await waitFor(() => {
      expect(screen.getByText(/has been blocked/)).toBeTruthy();
    });
  });

  it("triggers unblock dialog and updates user state on success", async () => {
    render(<UserManagementTable currentUserId="user-1" />);

    await waitFor(() => {
      expect(screen.getByText("Bad Actor")).toBeTruthy();
    });

    const unblockButton = screen.getByText("Unblock user");
    fireEvent.click(unblockButton);

    expect(screen.getByText("Dialog mode: unblock")).toBeTruthy();

    const confirmSuccessBtn = screen.getByTestId("mock-dialog-success-btn");
    fireEvent.click(confirmSuccessBtn);

    await waitFor(() => {
      expect(screen.getByText(/has been unblocked/)).toBeTruthy();
    });
  });

  it("allows closing the dialog without action", async () => {
    render(<UserManagementTable currentUserId="user-1" />);

    await waitFor(() => {
      expect(screen.getByText("Bad Actor")).toBeTruthy();
    });

    const unblockButton = screen.getByText("Unblock user");
    fireEvent.click(unblockButton);

    expect(screen.getByTestId("mock-block-dialog")).toBeTruthy();

    const cancelBtn = screen.getByTestId("mock-dialog-close-btn");
    fireEvent.click(cancelBtn);

    await waitFor(() => {
      expect(screen.queryByTestId("mock-block-dialog")).toBeNull();
    });
  });
});
