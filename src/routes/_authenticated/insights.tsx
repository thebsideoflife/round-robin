import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, FileText, Loader2, Mic, Plus, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  EmptyState,
  FilterRail,
  ListCard,
  PageHeader,
  Row,
  SectionHeading,
} from "@/components/primitives";
import { HealthRing, HealthBreakdownChart, BAND_WORD } from "@/components/health-ring";
import { ThemeDrilldown } from "@/components/theme-drilldown";
import { ThemeRanking } from "@/components/theme-ranking";
import { useStore } from "@/lib/store";
import { themeTrends } from "@/lib/domain/trends";
import { clinicHealth } from "@/lib/domain/health";
import { analyzeTrends } from "@/lib/ai.functions";
import { listReports } from "@/lib/reports.functions";
import { ROLE_LABELS } from "@/data/types";
import { cn } from "@/lib/utils";

const TABS = ["Themes", "Clinics", "PX"] as const;
const THEME_FILTERS = ["All themes", "Escalating", "Spreading", "Open work"] as const;
type ThemeFilter = (typeof THEME_FILTERS)[number];
const CLINIC_SCOPES = ["All clinics", "My clinics", "Needs attention", "Not visited"] as const;
type ClinicScope = (typeof CLINIC_SCOPES)[number];
type Tab = (typeof TABS)[number];

export const Route = createFileRoute("/_authenticated/insights")({
  head: () => ({
    meta: [
      { title: "Insights — Round Robin" },
      {
        name: "description",
        content:
          "Cross-clinic themes, clinic health scores and Press Ganey scorecards in one analysis surface.",
      },
      { property: "og:title", content: "Round Robin insights" },
      {
        property: "og:description",
        content: "Repeated concerns, emerging risks, clinic health and PX performance.",
      },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): { tab?: Tab } => ({
    tab: TABS.includes(search.tab as Tab) ? (search.tab as Tab) : undefined,
  }),
  component: InsightsPage,
});

/**
 * Analysis surface. Merges three former top-level nav entries — Trends,
 * Clinics and PX Engine — behind one tab rail, because all three answer
 * "what is going on" rather than "what do I do next" (which is Today) or
 * "what do I owe" (which is Work).
 */
function InsightsPage() {
  const { tab } = Route.useSearch();
  const navigate = Route.useNavigate();
  const active: Tab = tab ?? "Themes";

  return (
    <div className="space-y-5">
      <PageHeader title="Insights" description="Patterns across your scope." />
      <FilterRail
        options={TABS}
        value={active}
        onChange={(next) => navigate({ search: { tab: next } })}
        label="Insight area"
      />
      {active === "Themes" ? <ThemesTab /> : null}
      {active === "Clinics" ? <ClinicsTab /> : null}
      {active === "PX" ? <PxTab /> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function ThemesTab() {
  const { scope, currentUser } = useStore();
  const trends = themeTrends(scope.clinics, scope.rounds, scope.tasks);
  const [loading, setLoading] = useState(false);
  const [drilldown, setDrilldown] = useState<string | null>(null);
  const [themeFilter, setThemeFilter] = useState<ThemeFilter>("All themes");
  const [themeQuery, setThemeQuery] = useState("");
  const [ai, setAi] = useState<{
    headline: string;
    insights: string[];
    emergingRisks: string[];
  } | null>(null);

  async function run() {
    setLoading(true);
    try {
      const context = trends
        .slice(0, 10)
        .map(
          (t) =>
            `${t.theme}: ${t.mentions} mentions, ${t.clinics} clinics (${t.clinicNames
              .slice(0, 5)
              .join(", ")}), ${t.openTasks} open tasks, ${t.executiveEscalations} executive escalations.`,
        )
        .join("\n");
      const res = await analyzeTrends({
        data: {
          context: context || "No rounding activity recorded in the last 30 days.",
          scopeLabel: `${ROLE_LABELS[currentUser.role]} ${currentUser.name} — ${scope.clinics.length} clinics`,
        },
      });
      if ("error" in res) toast.error(res.error);
      else setAi(res.trends);
    } catch {
      toast.error("AI request failed. Try again.");
    } finally {
      setLoading(false);
    }
  }

  const shown = useMemo(() => {
    const byFilter = trends.filter((t) => {
      switch (themeFilter) {
        case "Escalating":
          return t.executiveEscalations > 0;
        case "Spreading":
          return t.clinics >= 3;
        case "Open work":
          return t.openTasks > 0;
        default:
          return true;
      }
    });
    const q = themeQuery.trim().toLowerCase();
    return q ? byFilter.filter((t) => t.theme.toLowerCase().includes(q)) : byFilter;
  }, [trends, themeFilter, themeQuery]);

  if (!trends.length) {
    return <EmptyState title="No activity in the last 30 days" description="Log a round to start building trend data." />;
  }


  return (
    <div className="space-y-5">
      <FilterRail
        options={THEME_FILTERS}
        value={themeFilter}
        onChange={setThemeFilter}
        counts={{
          "All themes": trends.length,
          Escalating: trends.filter((t) => t.executiveEscalations > 0).length,
          Spreading: trends.filter((t) => t.clinics >= 3).length,
          "Open work": trends.filter((t) => t.openTasks > 0).length,
        }}
        label="Theme filter"
      />

      <Card className="p-1.5">
        <ThemeRanking trends={shown} onSelect={setDrilldown} limit={8} />
      </Card>

      <Button onClick={run} disabled={loading} variant="outline" className="w-full gap-2">
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        {loading ? "Analyzing…" : "AI analysis of these themes"}
      </Button>

      {ai ? (
        <Card className="gap-4 p-4">
          <p className="text-base font-semibold">{ai.headline}</p>
          <div>
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Insights</p>
            <ul className="mt-1 space-y-1 text-sm text-muted-foreground">
              {ai.insights.map((i) => (
                <li key={i}>• {i}</li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Emerging risks
            </p>
            <ul className="mt-1 space-y-1 text-sm text-critical">
              {ai.emergingRisks.map((r) => (
                <li key={r}>• {r}</li>
              ))}
            </ul>
          </div>
        </Card>
      ) : null}

      <section className="space-y-3">
        <SectionHeading title="Detected themes" description="Tap a theme to see the underlying items." />
        <Input
          placeholder="Search themes"
          value={themeQuery}
          onChange={(e) => setThemeQuery(e.target.value)}
          className="h-12 text-base"
          aria-label="Search themes"
        />
        {shown.length ? (
          <ListCard>
            {shown.map((t) => {
              const share = Math.round((t.mentions / Math.max(1, trends[0].mentions)) * 100);
              return (
                <Row
                  key={t.theme}
                  title={
                    <span className="flex items-center gap-2">
                      {t.theme}
                      {t.executiveEscalations > 0 ? (
                        <span className="rounded-full bg-signal-soft px-2 py-0.5 text-[11px] font-medium text-signal-deep">
                          escalating
                        </span>
                      ) : null}
                    </span>
                  }
                  subtitle={
                    <span className="block">
                      <span className="block truncate">{t.statement}</span>
                      <span className="mt-1.5 block h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <span
                          className="block h-full rounded-full"
                          style={{
                            width: `${share}%`,
                            background:
                              t.executiveEscalations > 0 ? "var(--signal)" : "var(--primary)",
                          }}
                        />
                      </span>
                    </span>
                  }
                  right={
                    <span className="text-end">
                      <span className="block text-[1.0625rem] font-semibold tabular-nums">
                        {t.mentions}
                      </span>
                      <span className="block text-[11px] text-muted-foreground">
                        {t.clinics} clinic{t.clinics === 1 ? "" : "s"}
                      </span>
                    </span>
                  }
                  onClick={() => setDrilldown(t.theme)}
                />
              );
            })}
          </ListCard>
        ) : (
          <EmptyState title="No themes match that" description="Try a different filter or search." />
        )}
      </section>

      <ThemeDrilldown theme={drilldown} onOpenChange={(open) => !open && setDrilldown(null)} />
    </div>
  );
}

/* ------------------------------------------------------------------ */

function ClinicsTab() {
  const { scope, currentUser, graph, personById } = useStore();
  const [q, setQ] = useState("");
  const [clinicScope, setClinicScope] = useState<ClinicScope>("All clinics");
  const [expanded, setExpanded] = useState<string | null>(null);

  // "Mine" means clinics this person is personally named on, not everything
  // they can see — a director's scope includes their managers' clinics too.
  const ownIds = useMemo(
    () => new Set(graph.clinicsOwnedBy(currentUser).map((c) => c.id)),
    [graph, currentUser],
  );

  const scored = useMemo(
    () =>
      scope.clinics
        .map((c) => ({ clinic: c, health: clinicHealth(c, scope.rounds, scope.tasks) }))
        .sort((a, b) => a.health.score - b.health.score),
    [scope.clinics, scope.rounds, scope.tasks],
  );

  const counts = {
    "All clinics": scored.length,
    "My clinics": scored.filter((r) => ownIds.has(r.clinic.id)).length,
    "Needs attention": scored.filter((r) => r.health.band !== "green").length,
    "Not visited": scored.filter((r) => r.health.lastRoundDays === null || r.health.lastRoundDays > 30)
      .length,
  } as Record<ClinicScope, number>;

  const rows = scored
    .filter((r) => {
      switch (clinicScope) {
        case "My clinics":
          return ownIds.has(r.clinic.id);
        case "Needs attention":
          return r.health.band !== "green";
        case "Not visited":
          return r.health.lastRoundDays === null || r.health.lastRoundDays > 30;
        default:
          return true;
      }
    })
    .filter((r) =>
      `${r.clinic.name} ${r.clinic.specialty} ${r.clinic.region}`
        .toLowerCase()
        .includes(q.toLowerCase()),
    );

  const avg = rows.length
    ? Math.round(rows.reduce((a, r) => a + r.health.score, 0) / rows.length)
    : 0;
  const band = avg >= 80 ? "green" : avg >= 60 ? "yellow" : "red";

  return (
    <div className="space-y-4">
      <FilterRail
        options={CLINIC_SCOPES}
        value={clinicScope}
        onChange={setClinicScope}
        counts={counts}
        label="Clinic filter"
      />

      {rows.length ? (
        <Card className="flex-row items-center gap-4 p-4">
          <HealthRing score={avg} band={band} size={68} showLabel />
          <div className="min-w-0 flex-1">
            <p className="text-[1.0625rem] font-medium">
              {rows.length} clinic{rows.length === 1 ? "" : "s"}, average {avg}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {counts["Needs attention"]} below 80 · {counts["Not visited"]} not visited in 30 days
            </p>
          </div>
        </Card>
      ) : null}

      <div className="relative">
        <Input
          placeholder="Search clinics"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="h-12 text-base"
          aria-label="Search clinics"
        />
      </div>

      {rows.length ? (
        <div className="space-y-2.5">
          {rows.map(({ clinic, health }) => (
            <Card key={clinic.id} className="gap-0 overflow-hidden rounded-2xl p-0">
              <button
                type="button"
                onClick={() => setExpanded((e) => (e === clinic.id ? null : clinic.id))}
                className="flex w-full items-center gap-3.5 p-4 text-start transition-colors hover:bg-accent/40"
              >
                <HealthRing score={health.score} band={health.band} size={52} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[1.0625rem] font-medium">{clinic.name}</span>
                  <span className="mt-1 block truncate text-sm text-muted-foreground">
                    {clinic.specialty} · {personById(clinic.managerId)?.name ?? "unassigned"}
                  </span>
                  <span className="mt-1.5 flex flex-wrap gap-1.5">
                    {health.lastRoundDays === null ? (
                      <Badge className="bg-critical-soft text-critical">Never visited</Badge>
                    ) : health.lastRoundDays > 30 ? (
                      <Badge className="bg-signal-soft text-signal-deep">
                        {health.lastRoundDays}d since a visit
                      </Badge>
                    ) : null}
                    {health.overdueTasks > 0 ? (
                      <Badge className="bg-signal-soft text-signal-deep">
                        {health.overdueTasks} overdue
                      </Badge>
                    ) : null}
                    {health.openTasks > 0 ? (
                      <Badge variant="outline" className="font-normal">
                        {health.openTasks} open
                      </Badge>
                    ) : null}
                  </span>
                </span>
                <ChevronDown
                  className={cn(
                    "h-5 w-5 shrink-0 text-muted-foreground/50 transition-transform",
                    expanded === clinic.id && "rotate-180",
                  )}
                />
              </button>

              {expanded === clinic.id ? (
                <div className="space-y-4 border-t border-border bg-surface-2/50 p-4">
                  <div>
                    <p className="mb-3 text-sm font-medium">
                      What's driving {BAND_WORD[health.band].toLowerCase()}
                    </p>
                    <HealthBreakdownChart health={health} />
                  </div>
                  <div className="flex gap-2">
                    <Button asChild size="sm" variant="outline" className="flex-1">
                      <Link to="/clinics/$clinicId" params={{ clinicId: clinic.id }}>
                        Open clinic
                      </Link>
                    </Button>
                    <Button asChild size="sm" className="flex-1 gap-1.5">
                      <Link to="/rounds/new" search={{ clinicId: clinic.id }}>
                        <Mic className="h-3.5 w-3.5" />
                        Round here
                      </Link>
                    </Button>
                  </div>
                </div>
              ) : null}
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState title="No clinics match that" description="Try a different filter or search." />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function PxTab() {
  const { scope } = useStore();
  const list = useServerFn(listReports);
  const { data, isLoading } = useQuery({ queryKey: ["px-reports"], queryFn: () => list() });
  const [expanded, setExpanded] = useState<string | null>(null);

  const clinicName = (id: string | null) =>
    id ? (scope.clinics.find((c) => c.id === id)?.name ?? null) : null;

  // Percentile is already 0-100, so it maps onto the same ring and the same
  // bands the clinic health scores use — one visual language across Insights.
  const bandFor = (p: number | null): "green" | "yellow" | "red" =>
    p === null ? "red" : p >= 80 ? "green" : p >= 60 ? "yellow" : "red";

  const ready = (data ?? []).filter((r) => r.status === "ready" && r.overall_percentile != null);
  const avg = ready.length
    ? Math.round(
        ready.reduce((a, r) => a + (r.overall_percentile as number), 0) / ready.length,
      )
    : 0;

  return (
    <div className="space-y-4">
      <SectionHeading
        title="Press Ganey scorecards"
        action={
          <Button asChild size="sm" className="gap-1.5">
            <Link to="/px/upload">
              <Plus className="h-4 w-4" />
              Upload
            </Link>
          </Button>
        }
      />

      {ready.length ? (
        <Card className="flex-row items-center gap-4 p-4">
          <HealthRing score={avg} band={bandFor(avg)} size={68} showLabel />
          <div className="min-w-0 flex-1">
            <p className="text-[1.0625rem] font-medium">
              {ready.length} scorecard{ready.length === 1 ? "" : "s"}, average {avg}th percentile
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {ready.filter((r) => (r.overall_percentile as number) < 60).length} below the 60th
            </p>
          </div>
        </Card>
      ) : null}

      {isLoading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Loading scorecards…</p>
      ) : !data || data.length === 0 ? (
        <EmptyState
          title="No scorecards yet"
          description="Upload a Press Ganey scorecard to generate opportunities and coaching plans."
          action={
            <Button asChild>
              <Link to="/px/upload">Upload scorecard</Link>
            </Button>
          }
        />
      ) : (
        <div className="space-y-2.5">
          {data.map((r) => {
            const pct = r.overall_percentile;
            const band = bandFor(pct);
            const processing = r.status === "processing";
            const failed = r.status === "error";

            return (
              <Card key={r.id} className="gap-0 overflow-hidden rounded-2xl p-0">
                <button
                  type="button"
                  onClick={() => setExpanded((e) => (e === r.id ? null : r.id))}
                  className="flex w-full items-center gap-3.5 p-4 text-start transition-colors hover:bg-accent/40"
                >
                  {processing || failed || pct == null ? (
                    <span className="grid h-13 w-13 shrink-0 place-items-center rounded-full bg-muted" style={{ height: "3.25rem", width: "3.25rem" }}>
                      <FileText className="h-5 w-5 text-muted-foreground" />
                    </span>
                  ) : (
                    <HealthRing score={pct} band={band} size={52} />
                  )}

                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[1.0625rem] font-medium">
                      {r.site_name}
                    </span>
                    <span className="mt-1 block truncate text-sm text-muted-foreground">
                      {clinicName(r.clinic_id) ?? r.facility_name ?? "Unassigned"}
                      {r.service_line ? ` · ${r.service_line}` : ""}
                    </span>
                    <span className="mt-1.5 flex flex-wrap gap-1.5">
                      {processing ? <Badge variant="secondary">Processing…</Badge> : null}
                      {failed ? <Badge variant="destructive">Failed</Badge> : null}
                      {!processing && !failed && r.overall_top_box != null ? (
                        <Badge variant="outline" className="font-normal">
                          {Number(r.overall_top_box).toFixed(1)}% top box
                        </Badge>
                      ) : null}
                      {r.time_frame ? (
                        <Badge variant="outline" className="font-normal">
                          {r.time_frame}
                        </Badge>
                      ) : null}
                      <Badge variant="outline" className="font-normal">
                        {new Date(r.created_at).toLocaleDateString()}
                      </Badge>
                    </span>
                  </span>

                  <ChevronDown
                    className={cn(
                      "h-5 w-5 shrink-0 text-muted-foreground/50 transition-transform",
                      expanded === r.id && "rotate-180",
                    )}
                  />
                </button>

                {expanded === r.id ? (
                  <div className="space-y-4 border-t border-border bg-surface-2/50 p-4">
                    {r.exec_summary ? (
                      <p className="text-[0.9375rem] leading-relaxed text-muted-foreground">
                        {r.exec_summary}
                      </p>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        {processing
                          ? "Still extracting this scorecard."
                          : failed
                            ? "This upload failed to process. Try uploading it again."
                            : "No summary generated for this report."}
                      </p>
                    )}
                    <div className="flex gap-2">
                      <Button asChild size="sm" variant="outline" className="flex-1">
                        <Link to="/tasks" search={{ report: r.id }}>
                          Action items
                        </Link>
                      </Button>
                      <Button asChild size="sm" className="flex-1">
                        <Link to="/px/$reportId" params={{ reportId: r.id }}>
                          Open report
                        </Link>
                      </Button>
                    </div>
                  </div>
                ) : null}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
