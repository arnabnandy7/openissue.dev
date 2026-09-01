"use client";

import { useState } from "react";
import { AlertTriangle, ChevronDown, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type ErrorCardVariant = "warning" | "error";

type ErrorCardAction = {
  label: string;
  onClick: () => void;
  variant?: "default" | "outline" | "secondary" | "ghost" | "destructive" | "link";
};

type ErrorCardProps = {
  title: string;
  message: string;
  description?: string;
  variant?: ErrorCardVariant;
  actions?: ErrorCardAction[];
  technicalDetails?: string;
  className?: string;
};

const variantStyles: Record<
  ErrorCardVariant,
  { card: string; icon: string; title: string }
> = {
  warning: {
    card: "border-amber-500/40 bg-amber-500/5",
    icon: "text-amber-500",
    title: "text-amber-700 dark:text-amber-400",
  },
  error: {
    card: "border-destructive/40",
    icon: "text-destructive",
    title: "text-destructive",
  },
};

export function ErrorCard({
  title,
  message,
  description,
  variant = "error",
  actions = [],
  technicalDetails,
  className,
}: ErrorCardProps) {
  const [showDetails, setShowDetails] = useState(false);
  const styles = variantStyles[variant];
  const Icon = variant === "warning" ? AlertTriangle : XCircle;

  return (
    <Card className={cn(styles.card, className)}>
      <CardHeader>
        <CardTitle className={cn("flex items-center gap-2 text-base", styles.title)}>
          <Icon className="size-4 shrink-0" aria-hidden="true" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-foreground">{message}</p>
        {description ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}
        {actions.length > 0 ? (
          <div className="flex flex-wrap gap-2 pt-1">
            {actions.map((action) => (
              <Button
                key={action.label}
                type="button"
                variant={action.variant ?? "default"}
                size="sm"
                onClick={action.onClick}
              >
                {action.label}
              </Button>
            ))}
          </div>
        ) : null}
        {technicalDetails ? (
          <details
            className="rounded-lg border px-3 py-2 text-sm"
            open={showDetails}
            onToggle={(event) => setShowDetails(event.currentTarget.open)}
          >
            <summary className="flex cursor-pointer items-center gap-1 font-medium text-muted-foreground">
              <ChevronDown
                className={cn(
                  "size-3.5 transition-transform",
                  showDetails && "rotate-180",
                )}
                aria-hidden="true"
              />
              Technical details
            </summary>
            <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-md bg-muted/50 p-3 font-mono text-xs text-muted-foreground">
              {technicalDetails}
            </pre>
          </details>
        ) : null}
      </CardContent>
    </Card>
  );
}
