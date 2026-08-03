import { Check, ChevronDown, Circle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useStore } from "@/lib/store";
import { escalationPath } from "@/lib/domain/org";
import { ROLE_LABELS, type Task } from "@/data/types";
import { cn } from "@/lib/utils";

/**
 * BOTTOM-UP view of a single issue: the actual chain of named people it
 * routes through for this specific clinic.
 *
 * Previously the UI showed only a label ("Director Review") with no way to
 * tell who that meant, so escalated items sat unowned. This resolves the tier
 * to a person via the clinic's manager/director/executive assignments.
 */
export function EscalationPath({ task }: { task: Task }) {
  const { graph, currentUser } = useStore();
  const stops = escalationPath(graph, task);

  return (
    <Card className="gap-0 p-0">
      <ol className="divide-y divide-border">
        {stops.map((stop, i) => {
          const isMe = stop.person?.id === currentUser.id;
          return (
            <li key={stop.level} className="flex items-start gap-3 p-3.5">
              <span className="flex flex-col items-center pt-0.5">
                <span
                  className={cn(
                    "grid h-6 w-6 place-items-center rounded-full border-2",
                    stop.current
                      ? "border-primary bg-primary text-primary-foreground"
                      : stop.reached
                        ? "border-success bg-success text-success-foreground"
                        : "border-border text-muted-foreground",
                  )}
                >
                  {stop.reached && !stop.current ? (
                    <Check className="h-3 w-3" />
                  ) : (
                    <Circle className="h-2 w-2 fill-current" />
                  )}
                </span>
                {i < stops.length - 1 ? (
                  <ChevronDown className="mt-1 h-3 w-3 text-muted-foreground/40" />
                ) : null}
              </span>

              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      "text-sm font-medium",
                      stop.current ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {stop.person?.name ?? "Unassigned"}
                  </span>
                  {isMe ? (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-primary uppercase">
                      You
                    </span>
                  ) : null}
                  {stop.current ? (
                    <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold tracking-wide text-primary-foreground uppercase">
                      Owns it now
                    </span>
                  ) : null}
                </span>
                <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                  {stop.level}
                  {stop.person ? ` · ${stop.person.title || ROLE_LABELS[stop.person.role]}` : ""}
                </span>
              </span>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
