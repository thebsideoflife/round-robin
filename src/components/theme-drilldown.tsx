import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { EmptyState, TaskRow } from "@/components/task-row";
import { useStore } from "@/lib/store";
import { isOpenStatus } from "@/lib/domain/permissions";
import type { Task } from "@/data/types";

export function ThemeDrilldown({
  theme,
  onOpenChange,
}: {
  theme: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { scope, clinicById } = useStore();
  const tasks = theme ? scope.tasks.filter((t) => t.theme === theme) : [];
  const byDue = (a: Task, b: Task) => +new Date(a.dueDate) - +new Date(b.dueDate);
  const open = tasks.filter(isOpenStatus).sort(byDue);
  const closed = tasks.filter((t) => !isOpenStatus(t)).sort(byDue).reverse().slice(0, 8);
  const clinicCount = new Set(tasks.map((t) => t.clinicId)).size;

  const groupByClinic = (list: Task[]) => {
    const map = new Map<string, Task[]>();
    list.forEach((t) => map.set(t.clinicId, [...(map.get(t.clinicId) ?? []), t]));
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length);
  };

  return (
    <Sheet open={!!theme} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{theme ?? "Theme"}</SheetTitle>
          <SheetDescription>
            {open.length} open · {tasks.length} total action items across {clinicCount} clinic
            {clinicCount === 1 ? "" : "s"}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 px-4 pb-6">
          {tasks.length ? (
            <>
              <section className="space-y-3">
                <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Open action items
                </p>
                {open.length ? (
                  groupByClinic(open).map(([clinicId, list]) => (
                    <div key={clinicId} className="space-y-2">
                      <p className="text-xs font-semibold">{clinicById(clinicId)?.name ?? clinicId}</p>
                      {list.map((t) => (
                        <TaskRow
                          key={t.id}
                          task={t}
                          clinicName={clinicById(t.clinicId)?.name ?? ""}
                        />
                      ))}
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">No open items for this theme.</p>
                )}
              </section>

              {closed.length ? (
                <section className="space-y-3">
                  <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    Recently closed
                  </p>
                  {closed.map((t) => (
                    <TaskRow key={t.id} task={t} clinicName={clinicById(t.clinicId)?.name ?? ""} />
                  ))}
                </section>
              ) : null}

              <Button asChild variant="outline" className="w-full">
                <Link to="/tasks" search={{ theme: theme ?? undefined }}>
                  View all in action items
                </Link>
              </Button>
            </>
          ) : (
            <EmptyState
              title="No action items yet"
              description="This theme has only surfaced in rounding conversations so far."
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
