import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { EscalationLevel, TaskPriority, TaskStatus } from "@/data/types";

export function HealthPill({
  score,
  band,
  className,
}: {
  score: number;
  band: "green" | "yellow" | "red";
  className?: string;
}) {
  const styles = {
    green: "bg-success-soft text-success border-success/30",
    yellow: "bg-warning-soft text-warning-foreground border-warning/40",
    red: "bg-critical-soft text-critical border-critical/30",
  }[band];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold tabular-nums",
        styles,
        className,
      )}
    >
      <span
        className={cn(
          "h-2 w-2 rounded-full",
          band === "green" ? "bg-success" : band === "yellow" ? "bg-warning" : "bg-critical",
        )}
      />
      {score}
    </span>
  );
}

export function StatusBadge({ status }: { status: TaskStatus }) {
  const map: Record<TaskStatus, string> = {
    Open: "bg-secondary text-secondary-foreground",
    "In Progress": "bg-info-soft text-primary",
    "Pending Validation": "bg-warning-soft text-warning-foreground",
    Closed: "bg-success-soft text-success",
    Reopened: "bg-critical-soft text-critical",
  };
  return (
    <span className={cn("rounded-full px-2.5 py-1 text-xs font-medium", map[status])}>{status}</span>
  );
}

export function PriorityBadge({ priority }: { priority: TaskPriority }) {
  const map: Record<TaskPriority, string> = {
    Low: "border-border text-muted-foreground",
    Medium: "border-primary/30 text-primary",
    High: "border-warning/50 text-warning-foreground bg-warning-soft",
    Critical: "border-critical/40 text-critical bg-critical-soft",
  };
  return (
    <Badge variant="outline" className={cn("font-medium", map[priority])}>
      {priority}
    </Badge>
  );
}

export function EscalationBadge({ level }: { level: EscalationLevel }) {
  const map: Record<EscalationLevel, string> = {
    "Manager Resolve": "bg-secondary text-secondary-foreground",
    "Director Review": "bg-info-soft text-primary",
    "Executive Review": "bg-critical-soft text-critical",
  };
  return (
    <span className={cn("rounded-md px-2 py-1 text-xs font-medium", map[level])}>{level}</span>
  );
}
