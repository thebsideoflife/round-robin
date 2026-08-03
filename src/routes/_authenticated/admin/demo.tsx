import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SectionHeading } from "@/components/stat-card";
import {
  getDemoStatus,
  loadDemoData,
  clearDemoData,
} from "@/lib/demo.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/demo")({
  head: () => ({
    meta: [
      { title: "Demo environment — Round Robin" },
      {
        name: "description",
        content:
          "Load or reset a fully-populated demo environment for showing Round Robin to clinic leadership.",
      },
    ],
  }),
  component: DemoEnvPage,
});

function DemoEnvPage() {
  const fetchStatus = useServerFn(getDemoStatus);
  const runLoad = useServerFn(loadDemoData);
  const runClear = useServerFn(clearDemoData);
  const qc = useQueryClient();
  const [busy, setBusy] = useState<"load" | "clear" | null>(null);

  const { data: status, refetch } = useQuery({
    queryKey: ["demo-status"],
    queryFn: () => fetchStatus(),
  });

  const loaded = status?.loaded;

  async function handleLoad() {
    setBusy("load");
    try {
      const res = await runLoad();
      toast.success(
        `Demo environment loaded — ${res.clinics} clinics, ${res.users} people, ${res.tasks} action items.`,
      );
      await refetch();
      qc.invalidateQueries({ queryKey: ["scope"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load demo data");
    } finally {
      setBusy(null);
    }
  }

  async function handleClear() {
    setBusy("clear");
    try {
      await runClear();
      toast.success("Demo environment cleared. The workspace is empty again.");
      await refetch();
      qc.invalidateQueries({ queryKey: ["scope"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to clear demo data");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-8">
      <SectionHeading
        title="Demo environment"
        description="Load a realistic, fully-populated organization so every dashboard, escalation, theme and win is visible — then reset it when you're done."
      />

      <Card className="space-y-5 p-6">
        <div className="grid gap-4 sm:grid-cols-4">
          <Stat label="Demo people" value={status?.users ?? 0} />
          <Stat label="Clinics" value={status?.clinics ?? 0} />
          <Stat label="Rounds" value={status?.rounds ?? 0} />
          <Stat label="Action items" value={status?.tasks ?? 0} />
        </div>

        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-900 dark:text-amber-200">
          <p className="font-medium">Best for a separate demo copy</p>
          <p className="mt-1 text-amber-800/90 dark:text-amber-200/80">
            For a clean walkthrough, point .env at a second Supabase project, sign in
            as admin there, and click <strong>Load demo data</strong> there. This
            keeps your real workspace empty. <strong>Clear demo data</strong> only
            removes rows it created — your admin account and any real data are never
            touched.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button onClick={handleLoad} disabled={busy !== null}>
            {busy === "load" ? "Loading…" : loaded ? "Reload demo data" : "Load demo data"}
          </Button>
          <Button
            variant="outline"
            onClick={handleClear}
            disabled={busy !== null || !loaded}
          >
            {busy === "clear" ? "Clearing…" : "Clear demo data"}
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          Demo team members are created as real accounts (password{" "}
          <code className="rounded bg-muted px-1 py-0.5">DemoRnR!2026</code>) tagged
          with a demo email domain so they can be safely removed. They never need to
          sign in for an admin-only walkthrough.
        </p>
      </Card>

      <Card className="space-y-4 p-6">
        <h2 className="text-base font-semibold">What the demo includes</h2>
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
          <li>13 clinics across 3 divisions and 8 regions, with a full leadership ladder (3 Executive Directors, 5 Directors, 13 Managers).</li>
          <li>~45 rounding encounters with themes, findings and shout-out wins.</li>
          <li>~70 action items spread across the stepwise escalation ladder (Manager → Director → Executive), with varied statuses and ages that trigger the 45- and 100-day thresholds.</li>
          <li>A completed Patient Experience report with sections, providers, a priority index, opportunities and a coaching plan — plus action items linked from those opportunities.</li>
          <li>Role-specific dashboards, theme drilldowns, clinic health scores, recommendations and trends all populated.</li>
        </ul>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}
