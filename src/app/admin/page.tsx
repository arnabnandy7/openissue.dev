import { Suspense } from "react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AuthControls } from "@/components/auth-controls";
import { DashboardNavigation } from "@/components/dashboard-navigation";
import { ThemeToggle } from "@/components/theme-toggle";
import { AdminDashboard } from "@/features/admin/components/admin-dashboard";
import { getAdminSession } from "@/features/admin/server/admin-guard";

export const metadata: Metadata = {
  title: "Admin Console | OpenIssue.dev",
  description: "User management and administrative controls for OpenIssue.dev.",
};

export default async function AdminPage() {
  const reqHeaders = await headers();
  const { session, isAdmin } = await getAdminSession(reqHeaders);

  if (!session || !isAdmin) {
    redirect("/");
  }

  return (
    <div className="flex min-h-full flex-col bg-background text-foreground">
      <header className="border-b bg-background/95 backdrop-blur-xs sticky top-0 z-40">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <DashboardNavigation current="issues" />
          </div>
          <div className="flex items-center gap-2">
            <AuthControls />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto flex-1 w-full max-w-7xl px-4 py-8 sm:px-6">
        <Suspense
          fallback={
            <output className="text-muted-foreground text-sm">
              Loading admin dashboard…
            </output>
          }
        >
          <AdminDashboard
            currentUserId={session.user.id}
            currentUserEmail={session.user.email}
          />
        </Suspense>
      </main>
    </div>
  );
}
