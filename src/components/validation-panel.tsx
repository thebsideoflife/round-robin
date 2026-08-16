import { useState } from "react";
import { CheckCircle2, Clock, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useStore } from "@/lib/store";
import { canValidate, VALIDATION_COPY } from "@/lib/domain/policy";
import { daysBetween } from "@/lib/domain/time";
import type { Task } from "@/data/types";

/**
 * Close-then-confirm.
 *
 * Marking something done is a claim, not a conclusion — the item moves to
 * "waiting for confirmation" and stays on the list, including in the next
 * round at that clinic, until somebody verifies it. Anyone but the person who
 * closed it can confirm immediately; they can confirm their own after fifteen
 * days, so single-manager clinics don't strand work forever.
 */
export function ValidationPanel({ task }: { task: Task }) {
  const { currentUser, personById, closeTask, validateTask } = useStore();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"close" | "confirm" | "reject" | null>(null);

  const closedBy = task.closedBy;
  const right = canValidate({ closedBy, closedAt: task.closedAt }, currentUser.id);
  const awaiting = task.status === "Pending Validation";

  async function run(kind: "close" | "confirm" | "reject") {
    setBusy(kind);
    try {
      if (kind === "close") {
        await closeTask(task.id, note.trim() || undefined);
        toast.success("Marked as done", { description: VALIDATION_COPY.closeHint });
      } else {
        await validateTask(task.id, kind === "confirm", note.trim() || undefined);
        toast.success(kind === "confirm" ? "Confirmed and closed" : "Reopened");
      }
      setNote("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "That didn't work");
    } finally {
      setBusy(null);
    }
  }

  /* ---------- awaiting confirmation ---------- */
  if (awaiting) {
    const closerName = closedBy ? (personById(closedBy)?.name ?? "someone") : "someone";
    const waitedDays = task.closedAt ? daysBetween(task.closedAt) : 0;

    return (
      <Card className="gap-4 border-warning/40 bg-warning-soft/40 p-4">
        <div className="flex items-start gap-3">
          <Clock className="mt-0.5 h-5 w-5 shrink-0 text-signal-deep" />
          <div className="min-w-0">
            <p className="text-[1.0625rem] font-medium">{VALIDATION_COPY.awaiting}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {closerName} marked this done{waitedDays > 0 ? ` ${waitedDays} days ago` : ""}. It
              stays on the list until someone confirms the fix held.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="v-note">Note (optional)</Label>
          <Textarea
            id="v-note"
            rows={2}
            value={note}
            maxLength={500}
            placeholder="What did you check?"
            onChange={(e) => setNote(e.target.value)}
            className="text-base"
          />
        </div>

        {right.allowed ? (
          <div className="flex flex-wrap gap-2">
            <Button
              className="flex-1 gap-2"
              disabled={busy !== null}
              onClick={() => void run("confirm")}
            >
              {busy === "confirm" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              {VALIDATION_COPY.confirmAction}
            </Button>
            <Button
              variant="outline"
              className="flex-1 gap-2"
              disabled={busy !== null}
              onClick={() => void run("reject")}
            >
              {busy === "reject" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RotateCcw className="h-4 w-4" />
              )}
              {VALIDATION_COPY.rejectAction}
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">{right.reason}</p>
            {/* Rejecting your own claim is always allowed — nobody games the
                system by reopening their own work. */}
            <Button
              variant="outline"
              className="w-full gap-2"
              disabled={busy !== null}
              onClick={() => void run("reject")}
            >
              <RotateCcw className="h-4 w-4" />
              {VALIDATION_COPY.rejectAction}
            </Button>
          </div>
        )}
      </Card>
    );
  }

  /* ---------- already closed ---------- */
  if (task.status === "Closed") {
    const validator = task.validatedBy ? personById(task.validatedBy)?.name : null;
    return (
      <Card className="flex-row items-center gap-3 border-success/30 bg-success-soft/40 p-4">
        <CheckCircle2 className="h-5 w-5 shrink-0 text-success" />
        <p className="min-w-0 flex-1 text-[0.9375rem]">
          Closed{validator ? ` — confirmed by ${validator}` : ""}
          {task.validatedAt ? ` on ${new Date(task.validatedAt).toLocaleDateString()}` : ""}.
        </p>
      </Card>
    );
  }

  /* ---------- open: offer to close ---------- */
  return (
    <Card className="gap-4 p-4">
      <div className="space-y-2">
        <Label htmlFor="c-note">What changed?</Label>
        <Textarea
          id="c-note"
          rows={2}
          value={note}
          maxLength={500}
          placeholder="Briefly, what was done."
          onChange={(e) => setNote(e.target.value)}
          className="text-base"
        />
      </div>
      <Button
        className="action-primary w-full gap-2"
        disabled={busy !== null}
        onClick={() => void run("close")}
      >
        {busy === "close" ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <CheckCircle2 className="h-5 w-5" />
        )}
        {VALIDATION_COPY.closeAction}
      </Button>
      <p className="text-[0.8125rem] text-muted-foreground">{VALIDATION_COPY.closeHint}</p>
    </Card>
  );
}
