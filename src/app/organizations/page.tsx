import { Suspense } from "react";
import type { Metadata } from "next";
import { OrganizationDashboard } from "@/features/organizations/components/organization-dashboard";

export const metadata: Metadata = {
  title: "Issues by Organization | OpenIssue.dev",
  description:
    "Search public GitHub issues across organizations by technology and repository, with auto-suggestions.",
};

export default function OrganizationsPage() {
  return (
    <Suspense
      fallback={
        <main className="p-8">
          <output>Loading organization dashboard…</output>
        </main>
      }
    >
      <OrganizationDashboard />
    </Suspense>
  );
}
