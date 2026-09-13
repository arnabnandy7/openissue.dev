"use client";

import Image from "next/image";
import Link from "next/link";
import { LogOut, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

export function AuthControls() {
  const { data: session, isPending } = authClient.useSession();

  if (isPending) {
    return (
      <Button variant="outline" size="sm" disabled>
        Loading account…
      </Button>
    );
  }

  if (!session) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-2"
        onClick={() =>
          authClient.signIn.social({ provider: "github", callbackURL: "/" })
        }
      >
        <GitHubIcon />
        Sign in with GitHub
      </Button>
    );
  }

  const isAdmin = (session.user as { role?: string }).role === "admin";

  return (
    <div className="flex items-center gap-2">
      {isAdmin ? (
        <Link href="/admin" passHref>
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs font-medium border-primary/30 text-primary hover:bg-primary/10"
            title="Admin Console"
            aria-label="Admin Console"
          >
            <Shield className="size-3.5" />
            <span className="hidden sm:inline">Admin</span>
          </Button>
        </Link>
      ) : null}
      {session.user.image ? (
        <Image
          src={session.user.image}
          alt=""
          width={28}
          height={28}
          className="rounded-full"
        />
      ) : null}
      <span className="hidden max-w-40 truncate text-sm sm:inline">
        {session.user.name}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Sign out"
        onClick={() => authClient.signOut()}
      >
        <LogOut className="h-4 w-4" />
      </Button>
    </div>
  );
}

function GitHubIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-4 w-4 fill-current"
    >
      <path d="M12 .7a11.5 11.5 0 0 0-3.64 22.41c.58.11.79-.25.79-.56v-2.23c-3.22.7-3.9-1.37-3.9-1.37-.52-1.34-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.97.1-.75.4-1.26.73-1.55-2.57-.29-5.27-1.28-5.27-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.16 1.18A10.96 10.96 0 0 1 12 6.16c.98 0 1.95.13 2.86.38 2.2-1.49 3.16-1.18 3.16-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.41-2.71 5.38-5.29 5.67.42.36.79 1.06.79 2.14v3.24c0 .31.21.68.8.56A11.5 11.5 0 0 0 12 .7Z" />
    </svg>
  );
}
