import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FileText, Loader2, Plus, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
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
import { HealthPill } from "@/components/status";
import { ThemeDrilldown } from "@/components/theme-drilldown";
import { useStore } from "@/lib/store";
import { themeTrends } from "@/lib/domain/trends";
import { clinicHealth } from "@/lib/domain/health";
import { analyzeTrends } from "@/lib/ai.functions";
import { listReports } from "@/lib/reports.functions";
import { ROLE_LABELS } from "@/data/types";

const TABS = ["Themes", "Clinics", "PX"] as const;
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

  if (!trends.length) {
    return <EmptyState title="No activity in the last 30 days" description="Log a round to start building trend data." />;
  }

  const chartData = trends.slice(0, 8).map((t) => ({ theme: t.theme, mentions: t.mentions }));

  return (
    <div className="space-y-5">
      <Card className="p-3">
        <div className="h-56 w-full sm:h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ left: -24, right: 4, top: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="theme"
                tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                interval={0}
                angle={-35}
                textAnchor="end"
                height={64}
              />
              <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} allowDecimals={false} width={28} />
              <Tooltip
                contentStyle={{
                  background: "var(--popover)",
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  color: "var(--popover-foreground)",
                  fontSize: 12,
                }}
              />
              <Bar dataKey="mentions" fill="var(--chart-1)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
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
        <ListCard>
          {trends.map((t) => (
            <Row
              key={t.theme}
              title={t.theme}
              subtitle={t.statement}
              right={
                <span className="text-xs text-muted-foreground tabular-nums">
                  {t.mentions} · {t.clinics}cl
                </span>
              }
              onClick={() => setDrilldown(t.theme)}
            />
          ))}
        </ListCard>
      </section>

      <ThemeDrilldown theme={drilldown} onOpenChange={(open) => !open && setDrilldown(null)} />
    </div>
  );
}

/* ------------------------------------------------------------------ */

function ClinicsTab() {
  const { scope, personById } = useStore();
  const [q, setQ] = useState("");
  const rows = scope.clinics
    .map((c) => ({ clinic: c, health: clinicHealth(c, scope.rounds, scope.tasks) }))
    .filter((r) =>
      `${r.clinic.name} ${r.clinic.specialty} ${r.clinic.region}`
        .toLowerCase()
        .includes(q.toLowerCase()),
    )
    .sort((a, b) => a.health.score - b.health.score);

  return (
    <div className="space-y-4">
      <Input
        placeholder="Search clinics"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="text-base"
      />
      {rows.length ? (
        <ListCard>
          {rows.map(({ clinic, health }) => (
            <Row
              key={clinic.id}
              to="/clinics/$clinicId"
              params={{ clinicId: clinic.id }}
              title={clinic.name}
              subtitle={`${clinic.specialty} · ${personById(clinic.managerId)?.name ?? "unassigned"} · ${
                health.lastRoundDays === null ? "never rounded" : `${health.lastRoundDays}d ago`
              } · ${health.openTasks} open`}
              right={<HealthPill score={health.score} band={health.band} />}
            />
          ))}
        </ListCard>
      ) : (
        <EmptyState title="No clinics match that search" />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function PxTab() {
  const { scope } = useStore();
  const list = useServerFn(listReports);
  const { data, isLoading } = useQuery({ queryKey: ["px-reports"], queryFn: () => list() });

  const clinicName = (id: string | null) =>
    id ? (scope.clinics.find((c) => c.id === id)?.name ?? null) : null;

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
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
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
        <ListCard>
          {data.map((r) => (
            <Row
              key={r.id}
              to="/px/$reportId"
              params={{ reportId: r.id }}
              leading={<FileText className="h-4 w-4 text-muted-foreground" />}
              title={r.site_name}
              subtitle={`${clinicName(r.clinic_id) ?? r.facility_name ?? "Unassigned"}${
                r.service_line ? ` · ${r.service_line}` : ""
              } · ${new Date(r.created_at).toLocaleDateString()}`}
              right={
                r.status === "processing" ? (
                  <Badge variant="secondary">Processing…</Badge>
                ) : r.status === "error" ? (
                  <Badge variant="destructive">Failed</Badge>
                ) : r.overall_percentile != null ? (
                  <span className="text-right">
                    <span className="block text-base font-semibold tabular-nums">
                      {r.overall_percentile}
                      <span className="text-[10px] text-muted-foreground">th</span>
                    </span>
                    <span className="block text-[10px] text-muted-foreground">
                      {Number(r.overall_top_box).toFixed(1)}% top box
                    </span>
                  </span>
                ) : null
              }
            />
          ))}
        </ListCard>
      )}
    </div>
  );
}
