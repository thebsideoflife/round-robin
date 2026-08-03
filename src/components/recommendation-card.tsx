import { Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { HealthPill } from "@/components/status";
import { Progress } from "@/components/ui/progress";
import type { Recommendation } from "@/lib/domain/recommendations";

export function RecommendationCard({ rec }: { rec: Recommendation }) {
  return (
    <Card className="gap-3 p-4">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
        <div className="min-w-0">
          <Link
            to="/clinics/$clinicId"
            params={{ clinicId: rec.clinic.id }}
            className="truncate text-base font-semibold hover:underline"
          >
            {rec.clinic.name}
          </Link>
          <p className="truncate text-xs text-muted-foreground">
            {rec.clinic.region} · {rec.clinic.division}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="text-xl font-semibold tabular-nums text-primary">{rec.score}</span>
          <HealthPill score={rec.health} band={rec.band} />
        </div>
      </div>
      <Progress value={rec.score} className="h-1.5" />
      <ul className="space-y-1 text-sm text-muted-foreground">
        {rec.reasons.map((r) => (
          <li key={r} className="flex gap-2">
            <span className="text-primary">•</span>
            <span className="min-w-0">{r}</span>
          </li>
        ))}
      </ul>
      <p className="text-sm font-medium">
        Focus: <span className="text-primary">{rec.focus}</span>
      </p>
      <Link
        to="/rounds/new"
        search={{ clinicId: rec.clinic.id }}
        className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
      >
        Start round
      </Link>
    </Card>
  );
}
