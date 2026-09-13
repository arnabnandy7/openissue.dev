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
    createdAt: "2026-02-01T00:00:00.000Z",
    updatedAt: "2026-02-01T00:00:00.000Z",
  },
];

describe("UserManagementTable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listAdminUsers.mockResolvedValue({
      users: mockUsers,
      total: 2,
    });
  });

  afterEach(cleanup);

  it("renders user table with user records, roles, and status badges", async () => {
    render(<UserManagementTable currentUserId="user-1" />);

    await waitFor(() => {
      expect(screen.getByText("Arnab Nandy")).toBeTruthy();
      expect(screen.getByText("arnab@example.com")).toBeTruthy();
      expect(screen.getByText("You")).toBeTruthy();
      expect(screen.getByText("Admin")).toBeTruthy();
      expect(screen.getByText("Active")).toBeTruthy();

      expect(screen.getByText("Bad Actor")).toBeTruthy();
      expect(screen.getByText("bad@example.com")).toBeTruthy();
      expect(screen.getByText("Contributor")).toBeTruthy();
      expect(screen.getByText("Blocked")).toBeTruthy();
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
});
