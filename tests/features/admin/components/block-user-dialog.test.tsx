// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { banUser, unbanUser } = vi.hoisted(() => ({
  banUser: vi.fn(),
  unbanUser: vi.fn(),
}));

vi.mock("@/features/admin/lib/admin-users-client", () => ({
  banUser,
  unbanUser,
}));

vi.mock("@/components/ui/select", () => ({
  Select: ({ onValueChange, children }: any) => (
    <div>
      <button
        type="button"
        data-testid="set-duration-btn"
        onClick={() => onValueChange("86400")}
      >
        Set Duration
      </button>
      {children}
    </div>
  ),
  SelectTrigger: ({ children }: any) => <div>{children}</div>,
  SelectValue: ({ children }: any) => <div>{children}</div>,
  SelectContent: ({ children }: any) => <div>{children}</div>,
  SelectItem: ({ children, value }: any) => (
    <option value={value}>{children}</option>
  ),
}));

import { BlockUserDialog } from "@/features/admin/components/block-user-dialog";
import type { AdminUser } from "@/features/admin/lib/admin-users-client";

const mockUser: AdminUser = {
  id: "user-1",
  name: "Jane Doe",
  email: "jane@example.com",
  emailVerified: true,
  role: "user",
  banned: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("BlockUserDialog", () => {
  const onOpenChange = vi.fn();
  const onSuccess = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(cleanup);

  it("renders nothing when user is null", () => {
    const { container } = render(
      <BlockUserDialog
        user={null}
        mode="block"
        open={true}
        onOpenChange={onOpenChange}
        onSuccess={onSuccess}
      />,
    );

    expect(container.firstChild).toBeNull();
  });

  it("renders block modal details and submits ban", async () => {
    banUser.mockResolvedValue({});

    render(
      <BlockUserDialog
        user={mockUser}
        mode="block"
        open={true}
        onOpenChange={onOpenChange}
        onSuccess={onSuccess}
      />,
    );

    expect(screen.getByText("Block User Account")).toBeTruthy();
    expect(screen.getByText(/Are you sure you want to block Jane Doe/)).toBeTruthy();

    const reasonInput = screen.getByPlaceholderText(/Violation of terms/);
    fireEvent.change(reasonInput, { target: { value: "Spam behavior" } });

    const submitButton = screen.getByRole("button", { name: "Block User" });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(banUser).toHaveBeenCalledWith({
        userId: "user-1",
        banReason: "Spam behavior",
        banExpiresIn: undefined,
      });
      expect(onSuccess).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "user-1",
          banned: true,
          banReason: "Spam behavior",
        }),
      );
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it("submits ban with non-zero duration", async () => {
    banUser.mockResolvedValue({});

    render(
      <BlockUserDialog
        user={mockUser}
        mode="block"
        open={true}
        onOpenChange={onOpenChange}
        onSuccess={onSuccess}
      />,
    );

    fireEvent.click(screen.getByTestId("set-duration-btn"));

    const submitButton = screen.getByRole("button", { name: "Block User" });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(banUser).toHaveBeenCalledWith({
        userId: "user-1",
        banReason: undefined,
        banExpiresIn: 86400,
      });
      expect(onSuccess).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "user-1",
          banned: true,
          banExpires: expect.any(Date),
        }),
      );
    });
  });

  it("renders unblock modal and submits unban", async () => {
    unbanUser.mockResolvedValue({});

    const bannedUser: AdminUser = {
      ...mockUser,
      banned: true,
      banReason: "Previous spam",
    };

    render(
      <BlockUserDialog
        user={bannedUser}
        mode="unblock"
        open={true}
        onOpenChange={onOpenChange}
        onSuccess={onSuccess}
      />,
    );

    expect(screen.getByText("Unblock User Account")).toBeTruthy();
    expect(screen.getByText(/Restore account access for Jane Doe/)).toBeTruthy();

    const submitButton = screen.getByRole("button", { name: "Unblock User" });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(unbanUser).toHaveBeenCalledWith("user-1");
      expect(onSuccess).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "user-1",
          banned: false,
          banReason: null,
        }),
      );
    });
  });

  it("handles cancel button click", () => {
    render(
      <BlockUserDialog
        user={mockUser}
        mode="block"
        open={true}
        onOpenChange={onOpenChange}
        onSuccess={onSuccess}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("displays error message when ban fails", async () => {
    banUser.mockRejectedValue(new Error("Database connection error"));

    render(
      <BlockUserDialog
        user={mockUser}
        mode="block"
        open={true}
        onOpenChange={onOpenChange}
        onSuccess={onSuccess}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Block User" }));

    await waitFor(() => {
      expect(screen.getByText("Database connection error")).toBeTruthy();
    });
  });

  it("displays fallback error when unban fails with non-Error", async () => {
    unbanUser.mockRejectedValue("unknown error");

    render(
      <BlockUserDialog
        user={{ ...mockUser, banned: true }}
        mode="unblock"
        open={true}
        onOpenChange={onOpenChange}
        onSuccess={onSuccess}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Unblock User" }));

    await waitFor(() => {
      expect(screen.getByText("Action failed. Please try again.")).toBeTruthy();
    });
  });
});
