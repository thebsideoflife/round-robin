import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { getReport } from "@/lib/reports.functions";
import { createTasksFromOpportunity } from "@/lib/tasks.functions";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  Loader2,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Minus,
  Plus,
  Check,
  ListPlus,
} from "lucide-react";
import { useStore } from "@/lib/store";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/px/$reportId")({
  head: () => ({
    meta: [
      { title: "Scorecard — PX Engine" },
      {
        name: "description",
        content: "Press Ganey scorecard results, priorities, action plans and coaching.",
      },
    ],
  }),
  component: ReportDetail,
});

function percentileColor(p: number | null) {
  if (p == null) return "bg-muted text-muted-foreground";
  if (p >= 90) return "bg-success/15 text-success border-success/30";
  if (p >= 75) return "bg-warning/20 text-warning-foreground border-warning/40";
  return "bg-destructive/15 text-destructive border-destructive/30";
}

function ReportDetail() {
  const { reportId } = Route.useParams();
  const navigate = useNavigate();
  const get = useServerFn(getReport);
  const addTasksFn = useServerFn(createTasksFromOpportunity);
  const { data: appData } = useStore();
  const qc = useQueryClient();
  const clinics = appData?.clinics ?? [];
  const [pickedClinic, setPickedClinic] = useState<string>("");
  const [added, setAdded] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["px-report", reportId],
    queryFn: () => get({ data: { reportId } }),
    refetchInterval: (q) => (q.state.data?.report?.status === "processing" ? 3000 : false),
  });

  async function addActions(
    key: string,
    opp: {
      id: string;
      rank: number | null;
      title: string;
      goal: string | null;
      theme?: string | null;
      owner_role?: string | null;
    },
    actions: string[],
    clinicId: string | null,
  ) {
    const targetClinic = clinicId ?? pickedClinic;
    if (!targetClinic) {
      toast.error("Pick a clinic first to file these action items.");
      return;
    }
    setBusy(key);
    try {
      const res = await addTasksFn({
        data: {
          reportId,
          opportunityId: opp.id,
          clinicId: targetClinic,
          theme: opp.title,
          priority: (opp.rank ?? 3) <= 2 ? "High" : "Medium",
          description: `From PX priority #${opp.rank}: ${opp.title}. Goal: ${opp.goal ?? ""}`,
          ownerRole: opp.owner_role ?? undefined,
          actions,
        },
      });
      setAdded((prev) => ({ ...prev, [key]: true }));
      qc.invalidateQueries({ queryKey: ["scope"] });
      if (res.created === 0) {
        toast("Already in the action items list");
      } else {
        toast.success(
          res.created === 1 ? "Added to action items" : `${res.created} action items added`,
          {
            action: {
              label: "View",
              onClick: () => navigate({ to: "/tasks", search: { report: reportId } }),
            },
          },
        );
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't add action item");
    } finally {
      setBusy(null);
    }
  }


  if (isLoading || !data) {
    return (
      <div className="py-20 text-center text-muted-foreground">
        <Loader2 className="mx-auto h-6 w-6 animate-spin" />
      </div>
    );
  }

  const { report, sections, providers, priority, opportunities, coaching } = data;

  if (report.status === "processing") {
    return (
      <div className="mx-auto max-w-3xl py-20 text-center">
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
        <h1 className="mt-6 text-2xl font-semibold">Analyzing your scorecard…</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Extracting scores, running the opportunity engine, and generating action plans. This
          typically takes 30–60 seconds.
        </p>
      </div>
    );
  }

  if (report.status === "error") {
    return (
      <div className="mx-auto max-w-3xl py-20 text-center">
        <AlertCircle className="mx-auto h-8 w-8 text-destructive" />
        <h1 className="mt-6 text-2xl font-semibold">Couldn't process this report</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {report.error_message ?? "Unknown error"}
        </p>
        <Button className="mt-6" onClick={() => navigate({ to: "/px" })}>
          Back to reports
        </Button>
      </div>
    );
  }

  const insights =
    (report.insights as {
      drivers?: string;
      focus_this_month?: string;
      risk_if_no_action?: string;
    } | null) ?? {};

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs tracking-widest text-muted-foreground uppercase">
            {report.facility_name ?? "Facility"} · {report.service_line ?? ""}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{report.site_name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{report.time_frame ?? ""}</p>
        </div>
        <div className="flex items-baseline gap-6 rounded-xl border border-border bg-card px-6 py-4">
          <div>
            <p className="text-xs tracking-widest text-muted-foreground uppercase">Top box</p>
            <p className="text-3xl font-semibold">{Number(report.overall_top_box).toFixed(1)}%</p>
          </div>
          <div>
            <p className="text-xs tracking-widest text-muted-foreground uppercase">Percentile</p>
            <p
              className={cn(
                "text-3xl font-semibold",
                percentileColor(report.overall_percentile).split(" ")[1],
              )}
            >
              {report.overall_percentile}
              <span className="text-base">th</span>
            </p>
          </div>
          <div>
            <p className="text-xs tracking-widest text-muted-foreground uppercase">Responses</p>
            <p className="text-3xl font-semibold">{report.n}</p>
          </div>
        </div>
      </div>

      <Tabs defaultValue="overview" className="mt-8">
        <TabsList className="flex w-full flex-wrap justify-start">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="priorities">Priorities</TabsTrigger>
          <TabsTrigger value="plans">Action Plans</TabsTrigger>
          <TabsTrigger value="providers">Providers</TabsTrigger>
          <TabsTrigger value="coaching">Coaching</TabsTrigger>
          <TabsTrigger value="insights">Insights</TabsTrigger>
        </TabsList>

        {/* OVERVIEW */}
        <TabsContent value="overview" className="mt-6 space-y-6">
          <section className="rounded-xl border border-border bg-card p-6">
            <h2 className="text-sm font-medium tracking-widest text-muted-foreground uppercase">
              Executive summary
            </h2>
            <p className="mt-3 text-base leading-relaxed text-foreground">{report.exec_summary}</p>
          </section>

          <section>
            <h2 className="mb-3 text-sm font-medium tracking-widest text-muted-foreground uppercase">
              Section performance
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {sections.map((s) => (
                <div
                  key={s.id}
                  className={cn("rounded-lg border bg-card p-4", percentileColor(s.percentile))}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium">{s.name}</p>
                    <span className="text-2xl font-semibold">
                      {s.percentile}
                      <span className="text-xs">th</span>
                    </span>
                  </div>
                  <p className="mt-1 text-xs opacity-80">
                    {Number(s.top_box).toFixed(1)}% top box · n={s.n}
                  </p>
                </div>
              ))}
            </div>
          </section>
        </TabsContent>

        {/* PRIORITIES */}
        <TabsContent value="priorities" className="mt-6 space-y-3">
          <p className="text-sm text-muted-foreground">
            Top {opportunities.length} priorities, ranked by impact.
          </p>
          {opportunities.map((o) => (
            <div key={o.id} className="rounded-xl border border-border bg-card p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">#{o.rank}</Badge>
                    <Badge>{o.opp_type.replace("_", " ")}</Badge>
                  </div>
                  <h3 className="mt-2 text-lg font-semibold">{o.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{o.goal}</p>
                </div>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button size="sm" variant="ghost">
                        Why this?
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">{o.reason}</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
                <span>
                  Current: <strong className="text-foreground">{o.current_value}</strong>
                </span>
                <span>
                  → Target: <strong className="text-foreground">{o.target_value}</strong>
                </span>
              </div>
            </div>
          ))}
        </TabsContent>

        {/* ACTION PLANS */}
        <TabsContent value="plans" className="mt-6 space-y-4">
          {!report.clinic_id && (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-border bg-muted/30 p-4 text-sm">
              <span className="text-muted-foreground">
                This report isn't linked to a clinic. Choose where action items should be filed:
              </span>
              <Select value={pickedClinic} onValueChange={setPickedClinic}>
                <SelectTrigger className="w-56">
                  <SelectValue placeholder="Select clinic" />
                </SelectTrigger>
                <SelectContent>
                  {clinics.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {opportunities.map((o) => {
            const actions =
              (o.actions as Array<{ description: string; owner_role: string }> | null) ?? [];
            const drivers = (o.drivers as string[] | null) ?? [];
            const allKey = `${o.id}:all`;
            return (
              <div key={o.id} className="rounded-xl border border-border bg-card p-6">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">#{o.rank}</Badge>
                    <h3 className="font-semibold">{o.title}</h3>
                  </div>
                  {actions.length > 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy === allKey}
                      onClick={() =>
                        addActions(
                          allKey,
                          o,
                          actions.map((a) => a.description),
                          report.clinic_id,
                        )
                      }
                    >
                      {busy === allKey ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <ListPlus className="h-4 w-4" />
                      )}
                      Add all to action items
                    </Button>
                  )}
                </div>

                <p className="mt-2 text-sm">
                  <strong>Goal:</strong> {o.goal}
                </p>
                {drivers.length > 0 && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    <strong className="text-foreground">Drivers:</strong> {drivers.join(", ")}
                  </p>
                )}
                <div className="mt-4">
                  <p className="mb-2 text-xs font-medium tracking-widest text-muted-foreground uppercase">
                    Recommended actions
                  </p>
                  <ul className="space-y-2">
                    {actions.map((a, i) => {
                      const key = `${o.id}:${i}`;
                      const done = added[key] || added[allKey];
                      return (
                        <li
                          key={i}
                          className="flex items-start justify-between gap-3 rounded-md border border-border bg-background p-3 text-sm"
                        >
                          <span>{a.description}</span>
                          <div className="flex shrink-0 items-center gap-2">
                            <Badge variant="secondary">{a.owner_role}</Badge>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    size="icon"
                                    variant={done ? "ghost" : "outline"}
                                    className="h-7 w-7"
                                    disabled={done || busy === key}
                                    aria-label="Add to action items"
                                    onClick={() =>
                                      addActions(
                                        key,
                                        { ...o, owner_role: a.owner_role },
                                        [a.description],
                                        report.clinic_id,
                                      )
                                    }
                                  >
                                    {busy === key ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : done ? (
                                      <Check className="h-4 w-4 text-success" />
                                    ) : (
                                      <Plus className="h-4 w-4" />
                                    )}
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  {done ? "Added to action items" : "Add to action items"}
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>
                        </li>
                      );
                    })}
                  </ul>

                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  {[
                    { d: 30, t: o.timeline_30 },
                    { d: 60, t: o.timeline_60 },
                    { d: 90, t: o.timeline_90 },
                  ].map((m) => (
                    <div key={m.d} className="rounded-md bg-muted/40 p-3">
                      <p className="text-xs font-semibold text-primary uppercase">{m.d} days</p>
                      <p className="mt-1 text-sm">{m.t}</p>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </TabsContent>

        {/* PROVIDERS */}
        <TabsContent value="providers" className="mt-6">
          <div className="grid gap-2">
            {providers.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-4"
              >
                <div className="flex items-center gap-3">
                  {p.tier === "top" && <TrendingUp className="h-5 w-5 text-success" />}
                  {p.tier === "coaching" && <TrendingDown className="h-5 w-5 text-destructive" />}
                  {p.tier === "mid" && <Minus className="h-5 w-5 text-muted-foreground" />}
                  <div>
                    <p className="font-medium">{p.name}</p>
                    <p className="text-xs text-muted-foreground">
                      n={p.n} · {Number(p.top_box).toFixed(1)}% top box
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {p.tier === "top" && (
                    <Badge className="bg-success text-success-foreground">Top performer</Badge>
                  )}
                  {p.tier === "coaching" && <Badge variant="destructive">Coaching needed</Badge>}
                  <span
                    className={cn(
                      "rounded-md border px-3 py-1 text-lg font-semibold",
                      percentileColor(p.percentile),
                    )}
                  >
                    {p.percentile}
                    <span className="text-xs">th</span>
                  </span>
                </div>
              </div>
            ))}
          </div>
        </TabsContent>

        {/* COACHING */}
        <TabsContent value="coaching" className="mt-6 space-y-4">
          {coaching.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No providers in coaching tier — nice work.
            </p>
          ) : (
            coaching.map((c) => (
              <div key={c.id} className="rounded-xl border border-border bg-card p-6">
                <h3 className="font-semibold">{c.provider_name}</h3>
                <p className="mt-2 text-sm">
                  <strong>Gap:</strong> {c.gap_summary}
                </p>
                <p className="mt-1 text-sm">
                  <strong>Shadowing:</strong> {c.shadow_recommendation}
                </p>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div>
                    <p className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
                      Communication scripts
                    </p>
                    <ul className="mt-2 space-y-2 text-sm">
                      {((c.scripts as string[] | null) ?? []).map((s, i) => (
                        <li key={i} className="rounded-md bg-muted/40 p-2">
                          {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
                      Monthly checkpoints
                    </p>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                      {((c.checkpoints as string[] | null) ?? []).map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            ))
          )}
        </TabsContent>

        {/* INSIGHTS */}
        <TabsContent value="insights" className="mt-6 space-y-4">
          {[
            { title: "What's driving patient experience here?", body: insights.drivers },
            { title: "What should leaders focus on this month?", body: insights.focus_this_month },
            { title: "Biggest risk if no action is taken?", body: insights.risk_if_no_action },
          ].map((q) => (
            <div key={q.title} className="rounded-xl border border-border bg-card p-6">
              <h3 className="font-semibold">{q.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{q.body}</p>
            </div>
          ))}

          <details className="rounded-xl border border-border bg-card p-6">
            <summary className="cursor-pointer text-sm font-medium">
              Priority Index (high-correlation drivers)
            </summary>
            <div className="mt-4 grid gap-2">
              {priority.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-3 text-sm">
                  <span>
                    #{p.rank} · {p.question}
                  </span>
                  <span className="shrink-0 text-muted-foreground">
                    corr {Number(p.correlation).toFixed(2)} · {p.percentile}th
                  </span>
                </div>
              ))}
            </div>
          </details>
        </TabsContent>
      </Tabs>

      {report.status !== "ready" && (
        <Button onClick={() => refetch()} variant="ghost" size="sm" className="mt-4">
          Refresh
        </Button>
      )}
    </div>
  );
}
