import Link from "next/link";
import { CircleDot, GitPullRequest } from "lucide-react";
import { cn } from "@/lib/utils";

export function DashboardNavigation({
  current,
}: Readonly<{ current: "issues" | "pull-requests" }>) {
  return (
    <nav
      aria-label="Dashboards"
      className="flex w-fit items-center gap-1 rounded-lg border bg-background p-1 text-sm"
    >
      {[
        { href: "/", value: "issues", label: "Issues", Icon: CircleDot },
        {
          href: "/pull-requests",
          value: "pull-requests",
          label: "Pull requests",
          Icon: GitPullRequest,
        },
      ].map(({ href, value, label, Icon }) => (
        <Link
          key={value}
          href={href}
          aria-current={current === value ? "page" : undefined}
          className={cn(
            "inline-flex items-center gap-2 rounded-md px-3 py-2 hover:bg-muted",
            current === value && "bg-muted font-medium",
          )}
        >
          <Icon className="size-4" />
          {label}
        </Link>
      ))}
    </nav>
  );
}
