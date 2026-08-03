import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Mic, Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState, FilterRail, PageHeader } from "@/components/primitives";
import { useStore } from "@/lib/store";
import { daysBetween } from "@/lib/domain/time";

const RANGES = ["7 days", "30 days", "90 days", "All"] as const;
type Range = (typeof RANGES)[number];
const RANGE_DAYS: Record<Range, number> = {
  "7 days": 7,
  "30 days": 30,
  "90 days": 90,
  All: Number.MAX_SAFE_INTEGER,
};

export const Route = createFileRoute("/_authenticated/rounds/")({
  head: () => ({
    meta: [
      { title: "Rounds — Round Robin" },
      {
        name: "description",
        content:
          "Every leadership rounding conversation logged by clinic, staff member and identified theme.",
      },
      { property: "og:title", content: "Rounding log" },
      { property: "og:description", content: "Leadership rounding history across your clinics." },
    ],
  }),
  component: RoundsPage,
});

function RoundsPage() {
  const { scope, clinicById, personById } = useStore();
  const [q, setQ] = useState("");
  const [range, setRange] = useState<Range>("30 days");

  const rounds = [...scope.rounds]
    .filter((r) => daysBetween(r.date) <= RANGE_DAYS[range])
    .sort((a, b) => +new Date(b.date) - +new Date(a.date))
    .filter((r) =>
      `${r.individual} ${r.individualRole} ${clinicById(r.clinicId)?.name ?? ""} ${r.themes.join(" ")}`
        .toLowerCase()
        .includes(q.toLowerCase()),
    );

  return (
    <div className="space-y-4">
      <PageHeader
        title="Rounds"
        description={`${rounds.length} conversation${rounds.length === 1 ? "" : "s"} in this window`}
        action={
          <Button asChild size="sm" className="gap-1.5">
            <Link to="/rounds/new">
              <Mic className="h-4 w-4" />
              <span className="hidden sm:inline">New</span>
            </Link>
          </Button>
        }
      />

      <FilterRail options={RANGES} value={range} onChange={setRange} label="Time range" />

      <div className="relative">
        <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by person, clinic or theme"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="h-12 ps-10 text-base"
          aria-label="Search rounds"
        />
      </div>

      {rounds.length ? (
        <div className="space-y-2.5">
          {rounds.slice(0, 60).map((r) => (
            <Link key={r.id} to="/rounds/$roundId" params={{ roundId: r.id }} className="block">
              <Card className="press gap-2.5 rounded-2xl p-4 transition-colors hover:bg-accent/50">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[1.0625rem] font-semibold">{r.individual}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {r.individualRole} · {clinicById(r.clinicId)?.name} ·{" "}
                      {personById(r.managerId)?.name}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    {daysBetween(r.date)}d
                  </span>
                </div>
                <p className="line-clamp-2 text-sm text-muted-foreground">{r.notes}</p>
                <div className="flex flex-wrap gap-1.5">
                  {r.safetyFlag ? (
                    <Badge className="bg-critical-soft text-critical">Safety</Badge>
                  ) : null}
                  {r.win ? <Badge className="bg-success-soft text-success">Win</Badge> : null}
                  {r.themes.slice(0, 3).map((t) => (
                    <Badge key={t} variant="outline" className="font-normal">
                      {t}
                    </Badge>
                  ))}
                </div>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <EmptyState
          title="No rounds in this window"
          description="Widen the time range, or log your first conversation."
          action={
            <Button asChild className="gap-1.5">
              <Link to="/rounds/new">
                <Mic className="h-4 w-4" />
                Start a round
              </Link>
            </Button>
          }
        />
      )}
    </div>
  );
}
