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
        limit: 10,
        offset: 20,
        filterField: "banned",
        filterValue: true,
        filterOperator: "eq",
      });

      expect(admin.listUsers).toHaveBeenCalledWith({
        query: {
          searchValue: "alice",
          searchField: undefined,
          limit: 10,
          offset: 20,
          sortBy: "createdAt",
          sortDirection: "desc",
          filterField: "banned",
          filterValue: true,
          filterOperator: "eq",
        },
      });
    });

    it("throws error when API returns failure", async () => {
      admin.listUsers.mockResolvedValue({
        data: null,
        error: { message: "Unauthorized." },
      });

      await expect(listAdminUsers()).rejects.toThrow("Unauthorized.");
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
        banReason: "Spam",
        banExpiresIn: 86400,
      });

      expect(admin.banUser).toHaveBeenCalledWith({
        userId: "u-1",
        banReason: "Spam",
        banExpiresIn: 86400,
      });
      expect(res).toBeDefined();
    });

    it("throws error if ban fails", async () => {
      admin.banUser.mockResolvedValue({
        data: null,
        error: { message: "Cannot ban yourself." },
      });

      await expect(banUser({ userId: "self" })).rejects.toThrow("Cannot ban yourself.");
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
  });
});
