import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AlertTriangle, Mic, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { EmptyState, FilterRail, PageHeader } from "@/components/primitives";
import { TaskRow } from "@/components/task-row";
import { useStore } from "@/lib/store";
import { isOpenStatus, isOverdue } from "@/lib/domain/time";
import { splitCritical } from "@/lib/domain/priority";
import { ownerAtLevel, type OrgGraph } from "@/lib/domain/org";
import type { Person, Task } from "@/data/types";

/**
 * Ordered so the two most urgent lenses come first on a phone, where only
 * about three chips are visible without scrolling. "Mine" is the bottom-up
 * lens (escalated to me by name); "Escalated" is everything above manager
 * level in scope, which is what the standalone /escalations page used to be.
 */
const FILTERS = [
  "Mine",
  "Overdue",
  "Open",
  "Escalated",
  "Safety",
  "From PX",
  "Pending Validation",
  "Closed",
  "All",
] as const;

type Filter = (typeof FILTERS)[number];

export const Route = createFileRoute("/_authenticated/tasks/")({
  head: () => ({
    meta: [
      { title: "Work — Round Robin" },
      {
        name: "description",
        content:
          "Action items from rounding and PX, filtered by ownership, escalation tier, safety and due date.",
      },
      { property: "og:title", content: "Action item tracking" },
      {
        property: "og:description",
        content: "Owned, dated and escalated follow-up items from leadership rounding.",
      },
    ],
  }),
  validateSearch: (
    search: Record<string, unknown>,
  ): { theme?: string; report?: string; filter?: Filter } => ({
    theme: typeof search.theme === "string" && search.theme ? search.theme : undefined,
    report: typeof search.report === "string" && search.report ? search.report : undefined,
    filter: FILTERS.includes(search.filter as Filter) ? (search.filter as Filter) : undefined,
  }),
  component: TasksPage,
});

function matches(t: Task, f: Filter, me: Person, graph: OrgGraph): boolean {
  switch (f) {
    case "All":
      return true;
    case "Mine":
      return isOpenStatus(t) && ownerAtLevel(graph, t, t.escalation)?.id === me.id;
    case "Open":
      return isOpenStatus(t);
    case "Overdue":
      return isOverdue(t);
    case "Escalated":
      return isOpenStatus(t) && t.escalation !== "Manager Resolve";
    case "Safety":
      return isOpenStatus(t) && t.safetyRelated;
    case "From PX":
      return t.source === "px_opportunity";
    case "Pending Validation":
      return t.status === "Pending Validation";
    case "Closed":
      return t.status === "Closed";
  }
}

function TasksPage() {
  const { scope, currentUser, graph, clinicById } = useStore();
  const { theme, report, filter } = Route.useSearch();
  const navigate = Route.useNavigate();
  const [q, setQ] = useState("");

  const active: Filter = filter ?? (report ? "From PX" : "Mine");

  // Chip counts are computed once so the rail can show workload at a glance
  // without the user having to tap through every filter.
  const counts = useMemo(() => {
    const base = scope.tasks
      .filter((t) => (theme ? t.theme === theme : true))
      .filter((t) => (report ? t.reportId === report : true));
    return Object.fromEntries(
      FILTERS.map((f) => [f, base.filter((t) => matches(t, f, currentUser, graph)).length]),
    ) as Record<Filter, number>;
  }, [scope.tasks, theme, report, currentUser, graph]);

  const tasks = scope.tasks
    .filter((t) => (theme ? t.theme === theme : true))
    .filter((t) => (report ? t.reportId === report : true))
    .filter((t) => matches(t, active, currentUser, graph))
    .filter((t) =>
      `${t.title} ${t.theme} ${clinicById(t.clinicId)?.name ?? ""}`
        .toLowerCase()
        .includes(q.toLowerCase()),
    )
;

  // Safety and critical items are lifted out and pinned, never buried by a
  // nearer due date further down the list.
  const { critical, rest } = splitCritical(tasks);

  const clearChip = (key: "theme" | "report") =>
    navigate({
      search: (prev: { theme?: string; report?: string; filter?: Filter }) => ({
        ...prev,
        [key]: undefined,
      }),
    });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Tasks"
        description={`${counts.Open} open · ${counts.Overdue} overdue · ${counts.Mine} waiting on you`}
        action={
          <Button asChild variant="outline" size="sm" className="gap-1.5">
            <Link to="/rounds/new">
              <Mic className="h-4 w-4" />
              <span className="hidden sm:inline">New round</span>
            </Link>
          </Button>
        }
      />

      <FilterRail
        options={FILTERS}
        value={active}
        counts={counts}
        onChange={(next) => navigate({ search: (prev) => ({ ...prev, filter: next }) })}
        label="Task filter"
      />

      {theme || report ? (
        <div className="flex flex-wrap gap-2">
          {theme ? (
            <button
              type="button"
              onClick={() => clearChip("theme")}
              className="flex h-8 items-center gap-1.5 rounded-full border border-border px-3 text-xs text-muted-foreground hover:bg-accent"
            >
              Theme: {theme}
              <X className="h-3 w-3" />
            </button>
          ) : null}
          {report ? (
            <button
              type="button"
              onClick={() => clearChip("report")}
              className="flex h-8 items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 text-xs text-primary hover:bg-primary/20"
            >
              From this PX report
              <X className="h-3 w-3" />
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="relative">
        <Search className="pointer-events-none absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search tasks"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="h-12 ps-10 text-base"
          aria-label="Search tasks"
        />
      </div>

      {tasks.length ? (
        <div className="space-y-2.5">
          {critical.length ? (
            <section className="space-y-2.5">
              <p className="flex items-center gap-2 text-[0.9375rem] font-medium text-critical">
                <AlertTriangle className="h-4 w-4" />
                Needs attention first
              </p>
              {critical.map((t) => (
                <div key={t.id} className="rounded-2xl ring-2 ring-critical/25">
                  <TaskRow task={t} clinicName={clinicById(t.clinicId)?.name ?? ""} />
                </div>
              ))}
              {rest.length ? <div className="h-1" /> : null}
            </section>
          ) : null}
          {rest.slice(0, 60).map((t) => (
            <TaskRow key={t.id} task={t} clinicName={clinicById(t.clinicId)?.name ?? ""} />
          ))}
          {tasks.length > 60 ? (
            <p className="py-2 text-center text-xs text-muted-foreground">
              Showing the first 60 of {tasks.length}. Narrow the filter or search to see more.
            </p>
          ) : null}
        </div>
      ) : (
        <EmptyState
          title={active === "Mine" ? "Nothing is waiting on you" : "Nothing here"}
          description={
            active === "Mine"
              ? "Items escalate to you by name when the level below can't resolve them."
              : "No action items match this filter."
          }
        />
      )}
    </div>
  );
}
