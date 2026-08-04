import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Mic } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  EmptyState,
  ListCard,
  LoadingBlock,
  Metric,
  MetricGrid,
  PageHeader,
  Row,
  SectionHeading,
} from "@/components/primitives";
import { OrgDrilldown, useScopeMetrics } from "@/components/org-overview";
import { HealthPill } from "@/components/status";
import { WinCard } from "@/components/win-card";
import { useStore } from "@/lib/store";
import { daysBetween, isOpenStatus, isOverdue } from "@/lib/domain/time";
import { ownerAtLevel } from "@/lib/domain/org";
import { byUrgency, isCritical } from "@/lib/domain/priority";
import { recommendations } from "@/lib/domain/recommendations";
import { ROLE_LABELS } from "@/data/types";

export const Route = createFileRoute("/_authenticated/today")({
  head: () => ({
    meta: [
      { title: "Today — Round Robin" },
      {
        name: "description",
        content:
          "Your rounding priorities for today: what needs your decision, where to round next and how your org is tracking.",
      },
      { property: "og:title", content: "Round Robin — Today" },
      {
        property: "og:description",
        content: "Role-aware rounding priorities, escalations and clinic health in one view.",
      },
    ],
  }),
  component: TodayPage,
});

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

/**
 * The single home screen.
 *
 * Absorbs five routes that used to be separate nav entries:
 *   /dashboard        → the org roll-up section
 *   /escalations      → "Needs your decision" (bottom-up, personally routed)
 *   /recommendations  → "Where to round next"
 *   /weekly           → the "This week" strip
 *   /clinics          → the leaf of the org drilldown
 *
 * The ordering is deliberate: everything above the fold is something the
 * signed-in person can act on right now. Analysis lives under Insights.
 */
function TodayPage() {
  const { currentUser, scope, graph, clinicById, isLoading } = useStore();
  const m = useScopeMetrics();

  if (isLoading) return <LoadingBlock label="Loading your priorities" />;

  const open = scope.tasks.filter(isOpenStatus);

  // BOTTOM-UP: items that have escalated to a tier where *this person* is the
  // named owner for that specific clinic. Not "all escalations in my scope" —
  // the ones actually waiting on them.
  const mine = open
    .filter((t) => t.escalation !== "Manager Resolve" || currentUser.role === "manager")
    .filter((t) => ownerAtLevel(graph, t, t.escalation)?.id === currentUser.id)
    .sort(byUrgency)
    .slice(0, 6);

  const nextRounds = recommendations(scope.clinics, scope.rounds, scope.tasks).slice(0, 3);

  const rounds7 = scope.rounds.filter((r) => daysBetween(r.date) <= 7);
  const resolved7 = scope.tasks.filter((t) => t.closedAt && daysBetween(t.closedAt) <= 7);
  const created7 = scope.tasks.filter((t) => daysBetween(t.createdAt) <= 7);

  const wins = scope.rounds
    .filter((r) => r.win && daysBetween(r.date) <= 14)
    .sort((a, b) => +new Date(b.date) - +new Date(a.date))
    .slice(0, 2);

  return (
    <div className="space-y-7">
      <PageHeader
        title={`${greeting()}, ${currentUser.name.split(" ")[0] || "there"}`}
        description={`${ROLE_LABELS[currentUser.role]} · ${m.clinicCount} clinic${
          m.clinicCount === 1 ? "" : "s"
        } in scope`}
        action={
          <Button asChild className="hidden gap-2 lg:inline-flex">
            <Link to="/rounds/new">
              <Mic className="h-4 w-4" />
              Start a round
            </Link>
          </Button>
        }
      />

      {/* The whole product is "go have the conversation". On a phone that
          should be the biggest thing on the screen, not a toolbar button. */}
      <Button asChild className="action-primary w-full gap-2.5 lg:hidden">
        <Link to="/rounds/new">
          <Mic className="h-5 w-5" />
          Start a round
        </Link>
      </Button>

      {/* Every tile is a shortcut into a filtered Work or Insights view,
          which is what let the standalone Escalations page go away. */}
      <MetricGrid>
        <Metric
          label="Waiting on you"
          value={mine.length}
          tone={mine.length ? "warning" : "success"}
          to="/tasks"
          search={{ filter: "Mine" }}
        />
        <Metric
          label="Overdue"
          value={m.overdueTasks}
          tone={m.overdueTasks ? "warning" : "default"}
          to="/tasks"
          search={{ filter: "Overdue" }}
        />
        <Metric
          label="Not visited in 30 days"
          value={m.roundingGaps}
          hint={`of ${m.clinicCount}`}
          tone={m.roundingGaps ? "warning" : "success"}
          to="/insights"
          search={{ tab: "Clinics" }}
        />
        <Metric
          label="Average health"
          value={m.avgHealth}
          tone={m.band === "green" ? "success" : m.band === "yellow" ? "warning" : "critical"}
          to="/insights"
          search={{ tab: "Clinics" }}
        />
      </MetricGrid>

      {/* ---------------- Needs your decision (bottom-up) ---------------- */}
      <section className="space-y-3">
        <SectionHeading
          title="Waiting on you"
          description="Nobody below you can resolve these."
          action={
            mine.length ? (
              <Button asChild variant="ghost" size="sm" className="gap-1">
                <Link to="/tasks" search={{ filter: "Mine" }}>
                  All
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            ) : null
          }
        />
        {mine.length ? (
          <ListCard>
            {mine.map((t) => (
              <Row
                key={t.id}
                to="/tasks/$taskId"
                params={{ taskId: t.id }}
                leading={
                  isCritical(t) ? (
                    <span className="h-9 w-1 rounded-full bg-critical" aria-label="Critical" />
                  ) : null
                }
                title={t.title}
                subtitle={`${clinicById(t.clinicId)?.name ?? "—"} · ${t.theme}`}
                right={
                  <span className="flex items-center gap-1.5">
                    {t.safetyRelated ? (
                      <Badge className="bg-critical-soft text-critical">Safety</Badge>
                    ) : null}
                    <span
                      className={
                        isOverdue(t)
                          ? "text-xs font-semibold text-critical tabular-nums"
                          : "text-xs text-muted-foreground tabular-nums"
                      }
                    >
                      {isOverdue(t) ? `${daysBetween(t.dueDate)}d late` : `${-daysBetween(t.dueDate)}d`}
                    </span>
                  </span>
                }
              />
            ))}
          </ListCard>
        ) : (
          <EmptyState
            title="Nothing is waiting on you"
            description="Everything in your area is being handled a level below. It only lands here if it gets stuck."
          />
        )}
      </section>

      {/* ---------------- Where to round next ---------------- */}
      <section className="space-y-3">
        <SectionHeading
          title="Where to go next"
          description="Longest gaps and biggest problems first."
        />
        {nextRounds.length ? (
          <div className="grid gap-2.5 sm:grid-cols-3">
            {nextRounds.map((r) => (
              <Card key={r.clinic.id} className="gap-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{r.clinic.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      Focus: {r.focus}
                    </p>
                  </div>
                  <HealthPill score={r.health} band={r.band} />
                </div>
                <p className="line-clamp-2 text-xs text-muted-foreground">
                  {r.reasons.slice(0, 2).join(" · ")}
                </p>
                <Button asChild size="sm" className="w-full gap-1.5">
                  <Link to="/rounds/new" search={{ clinicId: r.clinic.id }}>
                    <Mic className="h-3.5 w-3.5" />
                    Go round here
                  </Link>
                </Button>
              </Card>
            ))}
          </div>
        ) : (
          <EmptyState title="No clinics in scope yet" />
        )}
      </section>

      {/* ---------------- Org roll-up (top-down) ---------------- */}
      <OrgDrilldown />

      {/* ---------------- This week ---------------- */}
      <section className="space-y-3">
        <SectionHeading title="Your week so far" />
        <Card className="gap-2 p-4">
          <p className="text-sm text-muted-foreground">
            {rounds7.length} rounding conversation{rounds7.length === 1 ? "" : "s"} across{" "}
            {new Set(rounds7.map((r) => r.clinicId)).size} clinic
            {new Set(rounds7.map((r) => r.clinicId)).size === 1 ? "" : "s"} ·{" "}
            {created7.length} issue{created7.length === 1 ? "" : "s"} raised ·{" "}
            <span className="font-medium text-success">{resolved7.length} resolved</span>
          </p>
        </Card>
      </section>

      {wins.length ? (
        <section className="space-y-3">
          <SectionHeading title="Recent wins" description="Say these out loud to the team." />
          <div className="grid gap-2.5 sm:grid-cols-2">
            {wins.map((r) => (
              <WinCard key={r.id} round={r} clinicName={clinicById(r.clinicId)?.name} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
