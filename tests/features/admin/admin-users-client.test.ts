import { beforeEach, describe, expect, it, vi } from "vitest";

const { admin } = vi.hoisted(() => ({
  admin: {
    listUsers: vi.fn(),
    banUser: vi.fn(),
    unbanUser: vi.fn(),
    setRole: vi.fn(),
    revokeUserSessions: vi.fn(),
  },
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    admin,
  },
}));

import {
  banUser,
  listAdminUsers,
  revokeUserSessions,
  setUserRole,
  unbanUser,
} from "@/features/admin/lib/admin-users-client";

describe("admin users client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("listAdminUsers", () => {
    it("fetches users with default pagination and sorting", async () => {
      admin.listUsers.mockResolvedValue({
        data: {
          users: [
            { id: "u-1", name: "Alice", email: "alice@example.com", banned: false },
          ],
          total: 1,
        },
        error: null,
      });

      const result = await listAdminUsers();

      expect(admin.listUsers).toHaveBeenCalledWith({
        query: {
          searchValue: undefined,
          searchField: undefined,
          limit: 20,
          offset: 0,
          sortBy: "createdAt",
          sortDirection: "desc",
          filterField: undefined,
          filterValue: undefined,
          filterOperator: undefined,
        },
      });
      expect(result.users).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it("passes search and filter parameters", async () => {
      admin.listUsers.mockResolvedValue({
        data: { users: [], total: 0 },
        error: null,
      });

      await listAdminUsers({
        searchValue: "alice",
        searchField: "email",
        limit: 10,
        offset: 20,
        sortBy: "name",
        sortDirection: "asc",
        filterField: "banned",
        filterValue: true,
        filterOperator: "eq",
      });

      expect(admin.listUsers).toHaveBeenCalledWith({
        query: {
          searchValue: "alice",
          searchField: "email",
          limit: 10,
          offset: 20,
          sortBy: "name",
          sortDirection: "asc",
          filterField: "banned",
          filterValue: true,
          filterOperator: "eq",
        },
      });
    });

    it("handles response with null data gracefully", async () => {
      admin.listUsers.mockResolvedValue({
        data: null,
        error: null,
      });

      const res = await listAdminUsers();
      expect(res.users).toEqual([]);
      expect(res.total).toBe(0);
    });

    it("throws error when API returns failure with message", async () => {
      admin.listUsers.mockResolvedValue({
        data: null,
        error: { message: "Unauthorized." },
      });

      await expect(listAdminUsers()).rejects.toThrow("Unauthorized.");
    });

    it("throws default error when API returns failure without message", async () => {
      admin.listUsers.mockResolvedValue({
        data: null,
        error: {},
      });

      await expect(listAdminUsers()).rejects.toThrow("Failed to list users.");
    });
  });

  describe("banUser", () => {
    it("submits ban request with optional reason and expiry", async () => {
      admin.banUser.mockResolvedValue({
        data: { user: { id: "u-1", banned: true } },
        error: null,
      });

      const res = await banUser({
        userId: "u-1",
        banReason: "  Spam  ",
        banExpiresIn: 86400,
      });

      expect(admin.banUser).toHaveBeenCalledWith({
        userId: "u-1",
        banReason: "Spam",
        banExpiresIn: 86400,
      });
      expect(res).toBeDefined();
    });

    it("handles empty reason", async () => {
      admin.banUser.mockResolvedValue({
        data: { user: { id: "u-1", banned: true } },
        error: null,
      });

      await banUser({
        userId: "u-1",
        banReason: "   ",
      });

      expect(admin.banUser).toHaveBeenCalledWith({
        userId: "u-1",
        banReason: undefined,
        banExpiresIn: undefined,
      });
    });

    it("throws default error if ban fails without message", async () => {
      admin.banUser.mockResolvedValue({
        data: null,
        error: {},
      });

      await expect(banUser({ userId: "self" })).rejects.toThrow("Failed to ban user.");
    });
  });

  describe("unbanUser", () => {
    it("submits unban request", async () => {
      admin.unbanUser.mockResolvedValue({
        data: { user: { id: "u-1", banned: false } },
        error: null,
      });

      await unbanUser("u-1");
      expect(admin.unbanUser).toHaveBeenCalledWith({ userId: "u-1" });
    });

    it("throws default error if unban fails without message", async () => {
      admin.unbanUser.mockResolvedValue({
        data: null,
        error: {},
      });

      await expect(unbanUser("u-1")).rejects.toThrow("Failed to unban user.");
    });
  });

  describe("setUserRole", () => {
    it("submits role change request", async () => {
      admin.setRole.mockResolvedValue({
        data: { user: { id: "u-1", role: "admin" } },
        error: null,
      });

      await setUserRole("u-1", "admin");
      expect(admin.setRole).toHaveBeenCalledWith({ userId: "u-1", role: "admin" });
    });

    it("throws default error if setRole fails without message", async () => {
      admin.setRole.mockResolvedValue({
        data: null,
        error: {},
      });

      await expect(setUserRole("u-1", "admin")).rejects.toThrow("Failed to update user role.");
    });
  });

  describe("revokeUserSessions", () => {
    it("submits session revocation request", async () => {
      admin.revokeUserSessions.mockResolvedValue({
        data: { success: true },
        error: null,
      });

      await revokeUserSessions("u-1");
      expect(admin.revokeUserSessions).toHaveBeenCalledWith({ userId: "u-1" });
    });

    it("throws default error if revokeUserSessions fails without message", async () => {
      admin.revokeUserSessions.mockResolvedValue({
        data: null,
        error: {},
      });

      await expect(revokeUserSessions("u-1")).rejects.toThrow("Failed to revoke user sessions.");
    });
  });
});
