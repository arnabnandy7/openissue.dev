"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Mail,
  Shield,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { UserManagementTable } from "@/features/admin/components/user-management-table";
import { AdminEmailCard } from "@/features/issues/components/admin-email-card";

interface AdminDashboardProps {
  currentUserId: string;
  currentUserEmail: string;
}

export function AdminDashboard({
  currentUserId,
  currentUserEmail,
}: Readonly<AdminDashboardProps>) {
  const [activeTab, setActiveTab] = useState<"users" | "email">("users");

  return (
    <div className="flex flex-col gap-6">
      {/* Top Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Link href="/" passHref>
            <Button variant="ghost" size="icon" aria-label="Back to dashboard">
              <ArrowLeft className="size-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <Shield className="size-5 text-primary" />
              <h1 className="font-heading text-xl font-semibold tracking-tight sm:text-2xl">
                Admin Console
              </h1>
            </div>
            <p className="text-sm text-muted-foreground">
              Manage users, account access, security moderation, and delivery tools
            </p>
          </div>
        </div>

        {/* Tab switcher */}
        <div className="flex items-center rounded-lg border bg-muted/40 p-1 text-sm self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setActiveTab("users")}
            className={`flex items-center gap-2 rounded-md px-3 py-1.5 font-medium transition-colors ${
              activeTab === "users"
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Users className="size-4" />
            User Management
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("email")}
            className={`flex items-center gap-2 rounded-md px-3 py-1.5 font-medium transition-colors ${
              activeTab === "email"
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Mail className="size-4" />
            Email Delivery Tools
          </button>
        </div>
      </div>

      {/* Main Tab Content */}
      {activeTab === "users" ? (
        <Card>
          <CardHeader>
            <CardTitle>User Directory & Moderation</CardTitle>
            <CardDescription>
              View registered users, promote administrator roles, block or unblock accounts, and revoke active sessions.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <UserManagementTable currentUserId={currentUserId} />
          </CardContent>
        </Card>
      ) : (
        <div className="max-w-xl">
          <AdminEmailCard defaultEmail={currentUserEmail} />
        </div>
      )}
    </div>
  );
}
