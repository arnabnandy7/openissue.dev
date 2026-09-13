"use client";

import { authClient } from "@/lib/auth-client";

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image?: string | null;
  role?: string;
  banned: boolean;
  banReason?: string | null;
  banExpires?: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface ListUsersParams {
  searchValue?: string;
  searchField?: "email" | "name";
  limit?: number;
  offset?: number;
  sortBy?: string;
  sortDirection?: "asc" | "desc";
  filterField?: string;
  filterValue?: string | number | boolean;
  filterOperator?: "eq" | "ne" | "contains";
}

export async function listAdminUsers(params: ListUsersParams = {}) {
  const response = await authClient.admin.listUsers({
    query: {
      searchValue: params.searchValue?.trim() || undefined,
      searchField: params.searchField || undefined,
      limit: params.limit ?? 20,
      offset: params.offset ?? 0,
      sortBy: params.sortBy ?? "createdAt",
      sortDirection: params.sortDirection ?? "desc",
      filterField: params.filterField || undefined,
      filterValue: params.filterValue !== undefined ? params.filterValue : undefined,
      filterOperator: params.filterOperator || undefined,
    },
  });

  if (response.error) {
    throw new Error(response.error.message ?? "Failed to list users.");
  }

  return {
    users: ((response.data?.users ?? []) as unknown) as AdminUser[],
    total: response.data?.total ?? 0,
  };
}

export async function banUser(input: {
  userId: string;
  banReason?: string;
  banExpiresIn?: number;
}) {
  const response = await authClient.admin.banUser({
    userId: input.userId,
    banReason: input.banReason?.trim() || undefined,
    banExpiresIn: input.banExpiresIn,
  });

  if (response.error) {
    throw new Error(response.error.message ?? "Failed to ban user.");
  }

  return response.data;
}

export async function unbanUser(userId: string) {
  const response = await authClient.admin.unbanUser({
    userId,
  });

  if (response.error) {
    throw new Error(response.error.message ?? "Failed to unban user.");
  }

  return response.data;
}

export type AdminRole = "user" | "admin";

export async function setUserRole(userId: string, role: AdminRole) {
  const response = await authClient.admin.setRole({
    userId,
    role,
  });

  if (response.error) {
    throw new Error(response.error.message ?? "Failed to update user role.");
  }

  return response.data;
}

export async function revokeUserSessions(userId: string) {
  const response = await authClient.admin.revokeUserSessions({
    userId,
  });

  if (response.error) {
    throw new Error(response.error.message ?? "Failed to revoke user sessions.");
  }

  return response.data;
}
