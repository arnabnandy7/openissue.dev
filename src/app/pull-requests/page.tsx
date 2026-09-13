import { Suspense } from "react";
import type { Metadata } from "next";
import { PullRequestDashboard } from "@/features/pull-requests/components/pull-request-dashboard";

export const metadata: Metadata = {
  title: "Pull Request Finder | OpenIssue.dev",
  description:
    "Search public GitHub pull requests by organization and technology, with repository insights and review status.",
};

export default function PullRequestsPage() {
  return (
    <Suspense
      fallback={
        <main className="p-8">
          <output>Loading pull request dashboard…</output>
        </main>
      }
    >
      <PullRequestDashboard />
    </Suspense>
  );
}
