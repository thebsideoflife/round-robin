import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SectionHeading } from "@/components/stat-card";
import { EscalationBadge, PriorityBadge, StatusBadge } from "@/components/status";
import { EscalationPath } from "@/components/escalation-path";
import { assignmentCandidates } from "@/lib/domain/org";
import { useStore } from "@/lib/store";
import { ALLOWED_NEXT, allowedEscalationLevels, suggestEscalation } from "@/lib/domain/escalation";
import { closedOn, daysBetween, isOverdue } from "@/lib/domain/permissions";
import type { EscalationLevel, TaskStatus } from "@/data/types";

export const Route = createFileRoute("/_authenticated/tasks/$taskId")({
  head: () => ({
    meta: [
      { title: "Action item — Round Robin" },
      {
        name: "description",
        content:
          "Action item detail with status workflow, escalation controls and rounding validation history.",
      },
      { property: "og:title", content: "Action item detail" },
      { property: "og:description", content: "Status workflow, escalation and validation history." },
    ],
  }),
  component: TaskDetail,
  notFoundComponent: () => <p className="text-sm text-muted-foreground">Action item not found.</p>,
});

function TaskDetail() {
  const { taskId } = Route.useParams();
  const { data, graph, clinicById, personById, updateTaskStatus, updateTask, setEscalation } = useStore();
  const task = data.tasks.find((t) => t.id === taskId);
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");

  if (!task) throw notFound();
  const clinic = clinicById(task.clinicId);
  const suggestion = suggestEscalation({
    priority: task.priority,
    safetyRelated: task.safetyRelated,
    theme: task.theme,
    createdAt: task.createdAt,
    clinicId: task.clinicId,
    allTasks: data.tasks.filter((t) => t.id !== task.id),
  });

  return (
    <div className="space-y-6 pb-10">
      <div>
        <Link to="/tasks" className="text-sm text-muted-foreground hover:underline">
          ← Action items
        </Link>
        <h1 className="mt-2 text-xl font-semibold sm:text-2xl">{task.title}</h1>
        <p className="text-sm text-muted-foreground">
          {clinic?.name} · owner {personById(task.ownerId)?.name} · opened{" "}
          {daysBetween(task.createdAt)} days ago
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={task.status} />
        <PriorityBadge priority={task.priority} />
        <EscalationBadge level={task.escalation} />
        {task.status === "Closed" ? (
          <span className="text-sm text-muted-foreground">
            {closedOn(task) ? `Closed on ${closedOn(task)}` : "Closed"}
          </span>
        ) : (
          <span
            className={
              isOverdue(task) ? "text-sm font-medium text-critical" : "text-sm text-muted-foreground"
            }
          >
            Due {new Date(task.dueDate).toLocaleDateString()}
          </span>
        )}
      </div>


      <Card className="gap-2 p-4">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Description
        </p>
        <p className="text-sm">{task.description}</p>
        <p className="pt-2 text-sm text-muted-foreground">
          Theme: {task.theme}
          {task.safetyRelated ? " · safety related" : ""}
          {task.roundId ? " · " : ""}
          {task.roundId ? (
            <Link
              to="/rounds/$roundId"
              params={{ roundId: task.roundId }}
              className="text-primary hover:underline"
            >
              view source round
            </Link>
          ) : null}
          {task.source === "px_opportunity" && task.reportId ? (
            <>
              {" · "}
              <Link
                to="/px/$reportId"
                params={{ reportId: task.reportId }}
                className="text-primary hover:underline"
              >
                from PX Engine report
              </Link>
            </>
          ) : null}
        </p>
      </Card>

      <section className="space-y-3">
        <SectionHeading title="Workflow" description="Move the item through the resolution path." />
        <Card className="gap-4 p-4">
          <div className="flex flex-wrap gap-2">
            {ALLOWED_NEXT[task.status].map((next) => (
              <Button
                key={next}
                variant={next === "Closed" ? "default" : "outline"}
                onClick={() => {
                  updateTaskStatus(task.id, next as TaskStatus, note || undefined);
                  setNote("");
                  toast.success(`Moved to ${next}`);
                }}
              >
                {next}
              </Button>
            ))}
          </div>
          <div className="space-y-2">
            <Label htmlFor="note">Resolution note</Label>
            <Textarea
              id="note"
              value={note}
              maxLength={500}
              placeholder="What changed? Closed items are re-validated on the next round."
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Due date</Label>
              <Input
                type="date"
                value={task.dueDate.slice(0, 10)}
                onChange={(e) =>
                  updateTask(task.id, { dueDate: new Date(e.target.value).toISOString() })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Owner</Label>
              <Select value={task.ownerId} onValueChange={(v) => updateTask(task.id, { ownerId: v })}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {assignmentCandidates(graph, task.clinicId, task.escalation).map((c) => (
                    <SelectItem key={c.person.id} value={c.person.id}>
                      {c.person.name}
                      {c.recommended ? " · accountable" : ` · ${c.reason}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </Card>
      </section>

      <section className="space-y-3">
        <SectionHeading
          title="Escalation path"
          description="Who this routes to, by name, for this clinic."
        />
        <EscalationPath task={task} />
      </section>

      <section className="space-y-3">
        <SectionHeading
          title="Escalation tier"
          description="System suggestion based on safety, priority, aging and cross-clinic patterns."
        />
        <Card className="gap-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Suggested
            </span>
            <EscalationBadge level={suggestion.level} />
          </div>
          <ul className="space-y-1 text-sm text-muted-foreground">
            {suggestion.reasons.map((r) => (
              <li key={r}>• {r}</li>
            ))}
          </ul>
          {task.escalationOverridden ? (
            <p className="text-sm text-warning-foreground">
              Overridden to {task.escalation}
              {task.overrideReason ? ` — ${task.overrideReason}` : ""}
            </p>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Escalation level</Label>
              <Select
                value={task.escalation}
                onValueChange={(v) =>
                  setEscalation(
                    task.id,
                    v as EscalationLevel,
                    v !== suggestion.level,
                    reason || undefined,
                  )
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {allowedEscalationLevels(task.escalation).map((l) => (
                    <SelectItem key={l} value={l}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>

              </Select>
            </div>
            <div className="space-y-2">
              <Label>Override reason</Label>
              <Input
                value={reason}
                maxLength={160}
                placeholder="Required when deviating from the suggestion"
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
          </div>
        </Card>
      </section>

      <section className="space-y-3">
        <SectionHeading
          title="Validation history"
          description="Resolution is confirmed with staff during a later round."
        />
        {task.validationHistory.length ? (
          <Card className="divide-y divide-border p-0">
            {task.validationHistory.map((v, i) => (
              <div key={i} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 p-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {v.resolved ? "Confirmed resolved" : "Reported unresolved"}
                  </p>
                  {v.note ? <p className="text-sm text-muted-foreground">{v.note}</p> : null}
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {new Date(v.date).toLocaleDateString()}
                </span>
              </div>
            ))}
          </Card>
        ) : (
          <p className="text-sm text-muted-foreground">No validation events yet.</p>
        )}
      </section>
    </div>
  );
}
