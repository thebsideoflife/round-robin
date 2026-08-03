import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SectionHeading, StatCard } from "@/components/stat-card";
import { HealthPill } from "@/components/status";
import { TaskRow } from "@/components/task-row";
import { useStore } from "@/lib/store";
import { clinicHealth } from "@/lib/domain/health";
import { daysBetween, isOpenStatus } from "@/lib/domain/permissions";

export const Route = createFileRoute("/_authenticated/clinics/$clinicId")({
  head: () => ({
    meta: [
      { title: "Clinic detail — Round Robin" },
      {
        name: "description",
        content:
          "Clinic health score breakdown, rounding history and open action items for a single practice.",
      },
      { property: "og:title", content: "Clinic detail" },
      { property: "og:description", content: "Health score breakdown and rounding history." },
    ],
  }),
  component: ClinicDetail,
  notFoundComponent: () => <p className="text-sm text-muted-foreground">Clinic not found.</p>,
});

function ClinicDetail() {
  const { clinicId } = Route.useParams();
  const { data, personById } = useStore();
  const clinic = data.clinics.find((c) => c.id === clinicId);
  if (!clinic) throw notFound();

  const health = clinicHealth(clinic, data.rounds, data.tasks);
  const rounds = data.rounds
    .filter((r) => r.clinicId === clinic.id)
    .sort((a, b) => +new Date(b.date) - +new Date(a.date));
  const tasks = data.tasks.filter((t) => t.clinicId === clinic.id);
  const open = tasks.filter(isOpenStatus);

  return (
    <div className="space-y-6 pb-10">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
        <div className="min-w-0">
          <Link to="/clinics" className="text-sm text-muted-foreground hover:underline">
            ← Clinics
          </Link>
          <h1 className="mt-2 truncate text-xl font-semibold sm:text-2xl">{clinic.name}</h1>
          <p className="text-sm text-muted-foreground">
            {clinic.specialty} · {clinic.site} · {clinic.region} · {clinic.division}
          </p>
        </div>
        <HealthPill score={health.score} band={health.band} className="text-sm" />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Open items" value={open.length} />
        <StatCard label="Overdue" value={health.overdueTasks} tone="critical" />
        <StatCard label="Resolution rate" value={`${Math.round(health.resolutionRate * 100)}%`} />
        <StatCard
          label="Last round"
          value={health.lastRoundDays === null ? "—" : `${health.lastRoundDays}d`}
        />
      </div>

      <Card className="gap-2 p-4">
        <p className="text-sm font-semibold">Health score breakdown</p>
        {health.factors.map((f) => (
          <div key={f.label} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
            <span className="truncate text-sm text-muted-foreground">{f.label}</span>
            <span
              className={
                f.delta >= 0
                  ? "text-sm font-semibold tabular-nums text-success"
                  : "text-sm font-semibold tabular-nums text-critical"
              }
            >
              {f.delta > 0 ? "+" : ""}
              {f.delta}
            </span>
          </div>
        ))}
        <p className="pt-1 text-xs text-muted-foreground">
          Leadership: {personById(clinic.managerId)?.name} ·{" "}
          {personById(clinic.directorId)?.name} · {personById(clinic.executiveDirectorId)?.name}
        </p>
      </Card>

      <section className="space-y-3">
        <SectionHeading
          title="Open action items"
          action={
            <Button asChild size="sm">
              <Link to="/rounds/new" search={{ clinicId: clinic.id }}>
                Round here
              </Link>
            </Button>
          }
        />
        {open.length ? (
          <div className="space-y-3">
            {open.slice(0, 10).map((t) => (
              <TaskRow key={t.id} task={t} clinicName={clinic.name} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No open items.</p>
        )}
      </section>

      <section className="space-y-3">
        <SectionHeading title="Rounding history" />
        <Card className="divide-y divide-border p-0">
          {rounds.slice(0, 10).map((r) => (
            <Link
              key={r.id}
              to="/rounds/$roundId"
              params={{ roundId: r.id }}
              className="block p-4 transition-colors hover:bg-accent/50"
            >
              <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3">
                <p className="truncate text-sm font-medium">
                  {r.individual} · {r.individualRole}
                </p>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {daysBetween(r.date)}d ago
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {r.themes.map((t) => (
                  <Badge key={t} variant="outline">
                    {t}
                  </Badge>
                ))}
              </div>
            </Link>
          ))}
          {rounds.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No rounds recorded.</p>
          ) : null}
        </Card>
      </section>
    </div>
  );
}
