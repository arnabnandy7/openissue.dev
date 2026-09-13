import Link from "next/link";
import { Building2, CircleDot } from "lucide-react";
import { cn } from "@/lib/utils";

export function DashboardNavigation({
  current,
}: Readonly<{ current: "issues" | "organizations" | "pull-requests" }>) {
  const activeTab = current === "pull-requests" ? "organizations" : current;

  return (
    <nav
      aria-label="Dashboards"
      className="flex w-fit items-center gap-1 rounded-lg border bg-background p-1 text-sm"
    >
      {[
        { href: "/", value: "issues", label: "By Technology", Icon: CircleDot },
        {
          href: "/organizations",
          value: "organizations",
          label: "By Organization",
          Icon: Building2,
        },
      ].map(({ href, value, label, Icon }) => (
        <Link
          key={value}
          href={href}
          aria-current={activeTab === value ? "page" : undefined}
          className={cn(
            "inline-flex items-center gap-2 rounded-md px-3 py-2 hover:bg-muted",
            activeTab === value && "bg-muted font-medium",
          )}
        >
          <Icon className="size-4" />
          {label}
        </Link>
      ))}
    </nav>
  );
}
