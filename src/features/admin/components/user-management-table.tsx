"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import {
  AlertCircle,
  Ban,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  KeyRound,
  MoreHorizontal,
  RefreshCw,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  UserX,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { BlockUserDialog } from "@/features/admin/components/block-user-dialog";
import {
  listAdminUsers,
  revokeUserSessions,
  setUserRole,
  type AdminUser,
} from "@/features/admin/lib/admin-users-client";

const PAGE_SIZE = 10;

export function UserManagementTable({
  currentUserId,
}: Readonly<{ currentUserId?: string }>) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "blocked">("all");
  const [roleFilter, setRoleFilter] = useState<"all" | "admin" | "user">("all");
  const [isLoading, setIsLoading] = useState(true);
  const [actionMessage, setActionMessage] = useState<{
    text: string;
    type: "success" | "error";
  } | null>(null);

  // Dialog state
  const [dialogUser, setDialogUser] = useState<AdminUser | null>(null);
  const [dialogMode, setDialogMode] = useState<"block" | "unblock">("block");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // Debounce search
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
      setOffset(0);
    }, 300);
    return () => clearTimeout(handler);
  }, [search]);

  useEffect(() => {
    let cancelled = false;

    let filterField: string | undefined;
    let filterValue: string | number | boolean | undefined;

    if (statusFilter === "blocked") {
      filterField = "banned";
      filterValue = true;
    } else if (statusFilter === "active") {
      filterField = "banned";
      filterValue = false;
    } else if (roleFilter !== "all") {
      filterField = "role";
      filterValue = roleFilter;
    }

    void listAdminUsers({
      searchValue: debouncedSearch,
      limit: PAGE_SIZE,
      offset,
      sortBy: "createdAt",
      sortDirection: "desc",
      filterField,
      filterValue,
      filterOperator: "eq",
    })
      .then((result) => {
        if (!cancelled) {
          setUsers(result.users);
          setTotal(result.total);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setActionMessage({
            text: err instanceof Error ? err.message : "Failed to load users.",
            type: "error",
          });
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedSearch, offset, statusFilter, roleFilter, refreshKey]);

  function handleRefresh() {
    setIsLoading(true);
    setActionMessage(null);
    setRefreshKey((k) => k + 1);
  }

  function handleUserUpdated(updated: AdminUser) {
    setUsers((prev) =>
      prev.map((u) => (u.id === updated.id ? { ...u, ...updated } : u)),
    );
    setActionMessage({
      text: updated.banned
        ? `User ${updated.name} has been blocked.`
        : `User ${updated.name} has been unblocked.`,
      type: "success",
    });
  }

  async function handleToggleRole(targetUser: AdminUser) {
    const newRole = targetUser.role === "admin" ? "user" : "admin";
    try {
      await setUserRole(targetUser.id, newRole);
      setUsers((prev) =>
        prev.map((u) => (u.id === targetUser.id ? { ...u, role: newRole } : u)),
      );
      setActionMessage({
        text: `Role for ${targetUser.name} updated to ${newRole}.`,
        type: "success",
      });
    } catch (err) {
      setActionMessage({
        text: err instanceof Error ? err.message : "Failed to change role.",
        type: "error",
      });
    }
  }

  async function handleRevokeSessions(targetUser: AdminUser) {
    try {
      await revokeUserSessions(targetUser.id);
      setActionMessage({
        text: `Active sessions for ${targetUser.name} were revoked.`,
        type: "success",
      });
    } catch (err) {
      setActionMessage({
        text: err instanceof Error ? err.message : "Failed to revoke sessions.",
        type: "error",
      });
    }
  }

  function renderTableRows() {
    if (isLoading) {
      return Array.from({ length: 5 }).map((_, i) => (
        <tr key={i} className="animate-pulse">
          <td className="px-4 py-3">
            <div className="flex items-center gap-3">
              <Skeleton className="size-8 rounded-full" />
              <div className="space-y-1">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-3 w-36" />
              </div>
            </div>
          </td>
          <td className="px-4 py-3">
            <Skeleton className="h-5 w-16" />
          </td>
          <td className="px-4 py-3">
            <Skeleton className="h-5 w-16" />
          </td>
          <td className="hidden px-4 py-3 md:table-cell">
            <Skeleton className="h-4 w-24" />
          </td>
          <td className="px-4 py-3 text-right">
            <Skeleton className="ml-auto size-8" />
          </td>
        </tr>
      ));
    }

    if (users.length === 0) {
      return (
        <tr>
          <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
            No users found matching current filters.
          </td>
        </tr>
      );
    }

    return users.map((userItem) => {
      const isSelf = currentUserId === userItem.id;
      const isAdmin = userItem.role === "admin";
      const isBanned = Boolean(userItem.banned);

      return (
        <tr
          key={userItem.id}
          className="hover:bg-muted/30 transition-colors"
        >
          {/* User Info */}
          <td className="px-4 py-3">
            <div className="flex items-center gap-3">
              {userItem.image ? (
                <Image
                  src={userItem.image}
                  alt=""
                  width={32}
                  height={32}
                  className="size-8 rounded-full"
                />
              ) : (
                <div className="flex size-8 items-center justify-center rounded-full bg-muted font-medium text-xs text-muted-foreground">
                  {userItem.name?.slice(0, 2).toUpperCase() || "U"}
                </div>
              )}
              <div className="flex flex-col">
                <div className="flex items-center gap-1.5 font-medium">
                  <span>{userItem.name}</span>
                  {isSelf ? (
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground font-normal">
                      You
                    </span>
                  ) : null}
                </div>
                <span className="text-xs text-muted-foreground">
                  {userItem.email}
                </span>
              </div>
            </div>
          </td>

          {/* Role */}
          <td className="px-4 py-3">
            {isAdmin ? (
              <Badge
                variant="secondary"
                className="gap-1 border-primary/20 bg-primary/10 text-primary hover:bg-primary/20"
              >
                <Shield className="size-3" />
                Admin
              </Badge>
            ) : (
              <Badge variant="outline" className="text-muted-foreground">
                Contributor
              </Badge>
            )}
          </td>

          {/* Status */}
          <td className="px-4 py-3">
            {isBanned ? (
              <Badge
                variant="destructive"
                className="gap-1"
                title={
                  userItem.banReason
                    ? `Reason: ${userItem.banReason}`
                    : "Account blocked"
                }
              >
                <Ban className="size-3" />
                Blocked
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="gap-1 border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
              >
                <CheckCircle2 className="size-3" />
                Active
              </Badge>
            )}
          </td>

          {/* Joined Date */}
          <td className="hidden px-4 py-3 text-xs text-muted-foreground md:table-cell">
            {new Date(userItem.createdAt).toLocaleDateString(undefined, {
              year: "numeric",
              month: "short",
              day: "numeric",
            })}
          </td>

          {/* Actions */}
          <td className="px-4 py-3 text-right">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Actions for ${userItem.name}`}
                >
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                <DropdownMenuSeparator />

                {/* Block / Unblock action */}
                {isBanned ? (
                  <DropdownMenuItem
                    onClick={() => {
                      setDialogUser(userItem);
                      setDialogMode("unblock");
                      setIsDialogOpen(true);
                    }}
                    className="gap-2 text-emerald-600 dark:text-emerald-400"
                  >
                    <UserCheck className="size-4" />
                    Unblock user
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem
                    onClick={() => {
                      setDialogUser(userItem);
                      setDialogMode("block");
                      setIsDialogOpen(true);
                    }}
                    disabled={isSelf}
                    className="gap-2 text-destructive focus:text-destructive"
                  >
                    <UserX className="size-4" />
                    Block user
                  </DropdownMenuItem>
                )}

                {/* Role toggle */}
                <DropdownMenuItem
                  onClick={() => void handleToggleRole(userItem)}
                  disabled={isSelf}
                  className="gap-2"
                >
                  {isAdmin ? (
                    <>
                      <ShieldAlert className="size-4 text-amber-500" />
                      Demote to Contributor
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="size-4 text-primary" />
                      Promote to Admin
                    </>
                  )}
                </DropdownMenuItem>

                {/* Revoke sessions */}
                <DropdownMenuItem
                  onClick={() => void handleRevokeSessions(userItem)}
                  className="gap-2 text-muted-foreground"
                >
                  <KeyRound className="size-4" />
                  Revoke all sessions
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </td>
        </tr>
      );
    });
  }

  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;
  const totalPages = Math.ceil(total / PAGE_SIZE) || 1;

  return (
    <div className="flex flex-col gap-4">
      {/* Search & Filter Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={statusFilter}
            onValueChange={(val) => {
              setStatusFilter(val as "all" | "active" | "blocked");
              setOffset(0);
            }}
          >
            <SelectTrigger className="w-32">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="blocked">Blocked</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={roleFilter}
            onValueChange={(val) => {
              setRoleFilter(val as "all" | "admin" | "user");
              setOffset(0);
            }}
          >
            <SelectTrigger className="w-32">
              <SelectValue placeholder="Role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Roles</SelectItem>
              <SelectItem value="admin">Admins</SelectItem>
              <SelectItem value="user">Contributors</SelectItem>
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            size="icon"
            onClick={handleRefresh}
            title="Refresh list"
            aria-label="Refresh user list"
          >
            <RefreshCw className="size-4" />
          </Button>
        </div>
      </div>

      {/* Notification banner */}
      {actionMessage ? (
        <div
          className={`flex items-center gap-2 rounded-lg border p-3 text-sm ${
            actionMessage.type === "success"
              ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
              : "border-destructive/20 bg-destructive/10 text-destructive"
          }`}
        >
          {actionMessage.type === "success" ? (
            <CheckCircle2 className="size-4 shrink-0" />
          ) : (
            <AlertCircle className="size-4 shrink-0" />
          )}
          <span>{actionMessage.text}</span>
        </div>
      ) : null}

      {/* Table Container */}
      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-muted/40 text-xs font-medium uppercase text-muted-foreground">
            <tr>
              <th scope="col" className="px-4 py-3">
                User
              </th>
              <th scope="col" className="px-4 py-3">
                Role
              </th>
              <th scope="col" className="px-4 py-3">
                Status
              </th>
              <th scope="col" className="hidden px-4 py-3 md:table-cell">
                Joined
              </th>
              <th scope="col" className="px-4 py-3 text-right">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {renderTableRows()}
          </tbody>
        </table>
      </div>

      {/* Pagination Controls */}
      <div className="flex flex-col gap-2 py-2 sm:flex-row sm:items-center sm:justify-between text-xs text-muted-foreground">
        <div>
          Showing {users.length > 0 ? offset + 1 : 0} to{" "}
          {Math.min(offset + users.length, total)} of {total} users
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setOffset((prev) => Math.max(0, prev - PAGE_SIZE))}
            disabled={offset === 0 || isLoading}
            className="gap-1"
          >
            <ChevronLeft className="size-3.5" />
            Previous
          </Button>

          <span className="font-medium text-foreground px-2">
            Page {currentPage} of {totalPages}
          </span>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setOffset((prev) => prev + PAGE_SIZE)}
            disabled={offset + PAGE_SIZE >= total || isLoading}
            className="gap-1"
          >
            Next
            <ChevronRight className="size-3.5" />
          </Button>
        </div>
      </div>

      {/* Block/Unblock Confirmation Dialog */}
      <BlockUserDialog
        user={dialogUser}
        mode={dialogMode}
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        onSuccess={handleUserUpdated}
      />
    </div>
  );
}
