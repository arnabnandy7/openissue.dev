"use client";

import { useState } from "react";
import { AlertTriangle, Ban, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  banUser,
  unbanUser,
  type AdminUser,
} from "@/features/admin/lib/admin-users-client";

interface BlockUserDialogProps {
  user: AdminUser | null;
  mode: "block" | "unblock";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (updatedUser: AdminUser) => void;
}

const BAN_DURATIONS = [
  { label: "Permanent", seconds: 0 },
  { label: "24 Hours", seconds: 86400 },
  { label: "7 Days", seconds: 604800 },
  { label: "30 Days", seconds: 2592000 },
];

export function BlockUserDialog({
  user,
  mode,
  open,
  onOpenChange,
  onSuccess,
}: Readonly<BlockUserDialogProps>) {
  const [reason, setReason] = useState("");
  const [duration, setDuration] = useState("0");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user) return null;

  const isBlock = mode === "block";

  async function handleConfirm() {
    if (!user) return;
    setIsSubmitting(true);
    setError(null);

    try {
      if (isBlock) {
        const expiresInSec = Number(duration);
        await banUser({
          userId: user.id,
          banReason: reason.trim() || undefined,
          banExpiresIn: expiresInSec > 0 ? expiresInSec : undefined,
        });

        onSuccess({
          ...user,
          banned: true,
          banReason: reason.trim() || null,
          banExpires:
            expiresInSec > 0
              ? new Date(Date.now() + expiresInSec * 1000)
              : null,
        });
      } else {
        await unbanUser(user.id);
        onSuccess({
          ...user,
          banned: false,
          banReason: null,
          banExpires: null,
        });
      }
      onOpenChange(false);
      setReason("");
      setDuration("0");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isBlock ? (
              <>
                <Ban className="size-5 text-destructive" />
                Block User Account
              </>
            ) : (
              <>
                <CheckCircle2 className="size-5 text-emerald-500" />
                Unblock User Account
              </>
            )}
          </DialogTitle>
          <DialogDescription>
            {isBlock
              ? `Are you sure you want to block ${user.name} (${user.email})? Blocked users will be signed out and unable to access authenticated features.`
              : `Restore account access for ${user.name} (${user.email})?`}
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <div className="flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            <AlertTriangle className="size-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        {isBlock ? (
          <div className="grid gap-4 py-2">
            <div className="grid gap-1.5">
              <label htmlFor="ban-reason" className="text-sm font-medium">
                Reason (optional)
              </label>
              <Input
                id="ban-reason"
                placeholder="e.g. Violation of terms, spam, abusive behavior"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                disabled={isSubmitting}
              />
            </div>

            <div className="grid gap-1.5">
              <label htmlFor="ban-duration" className="text-sm font-medium">
                Duration
              </label>
              <Select value={duration} onValueChange={setDuration}>
                <SelectTrigger id="ban-duration">
                  <SelectValue placeholder="Select duration" />
                </SelectTrigger>
                <SelectContent>
                  {BAN_DURATIONS.map((dur) => (
                    <SelectItem key={dur.seconds} value={String(dur.seconds)}>
                      {dur.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        ) : null}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant={isBlock ? "destructive" : "default"}
            onClick={handleConfirm}
            disabled={isSubmitting}
            className="gap-2"
          >
            {isSubmitting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : isBlock ? (
              <Ban className="size-4" />
            ) : (
              <CheckCircle2 className="size-4" />
            )}
            {isBlock ? "Block User" : "Unblock User"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
