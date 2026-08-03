import { Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { EscalationBadge, PriorityBadge, StatusBadge } from "@/components/status";
import type { Task } from "@/data/types";
import { closedOn, daysBetween, isOpenStatus, isOverdue } from "@/lib/domain/time";

export function TaskRow({ task, clinicName }: { task: Task; clinicName: string }) {
  const overdue = isOverdue(task);
  const open = isOpenStatus(task);
  const closedDate = closedOn(task);
  return (
    <Link to="/tasks/$taskId" params={{ taskId: task.id }} className="block">
      <Card className="press gap-2.5 rounded-2xl p-4 transition-colors hover:bg-accent/50">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
          <p className="min-w-0 text-[1.0625rem] leading-snug font-semibold">{task.title}</p>
          <PriorityBadge priority={task.priority} />
        </div>
        <p className="line-clamp-2 text-[0.9375rem] text-muted-foreground">{task.description}</p>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <StatusBadge status={task.status} />
          <EscalationBadge level={task.escalation} />
          {task.source === "px_opportunity" ? (
            <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-medium tracking-wide text-primary uppercase">
              PX Engine
            </span>
          ) : null}
          <span className="text-xs text-muted-foreground">{clinicName}</span>
          {open ? (
            <span
              className={
                overdue ? "text-xs font-medium text-critical" : "text-xs text-muted-foreground"
              }
            >
              {overdue
                ? `Overdue by ${daysBetween(task.dueDate)}d`
                : `Due in ${-daysBetween(task.dueDate)}d`}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">
              {closedDate ? `Closed ${closedDate}` : "Closed"}
            </span>
          )}
        </div>

      </Card>
    </Link>
  );
}

export { EmptyState } from "@/components/primitives";
