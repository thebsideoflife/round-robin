import { cn } from "@/lib/utils";
import type { HealthBreakdown } from "@/lib/domain/health";

/**
 * Health as a ring rather than a number in a pill.
 *
 * A bare "62" tells you nothing about how far from good it is. A ring shows
 * the gap at a glance, and the colour carries the band, so the number becomes
 * confirmation rather than the thing you have to interpret.
 */

const BAND_STROKE: Record<HealthBreakdown["band"], string> = {
  green: "var(--success)",
  yellow: "var(--signal)",
  red: "var(--critical)",
};
const BAND_TEXT: Record<HealthBreakdown["band"], string> = {
  green: "text-success",
  yellow: "text-signal-deep",
  red: "text-critical",
};
const BAND_WORD: Record<HealthBreakdown["band"], string> = {
  green: "On track",
  yellow: "Needs attention",
  red: "At risk",
};

export function HealthRing({
  score,
  band,
  size = 56,
  showLabel = false,
  className,
}: {
  score: number;
  band: HealthBreakdown["band"];
  size?: number;
  showLabel?: boolean;
  className?: string;
}) {
  const stroke = Math.max(4, Math.round(size * 0.11));
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const filled = Math.max(0, Math.min(100, score)) / 100;

  return (
    <span className={cn("inline-flex flex-col items-center gap-1", className)}>
      <span className="relative inline-grid place-items-center" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          role="img"
          aria-label={`Health score ${score} out of 100, ${BAND_WORD[band].toLowerCase()}`}
          className="-rotate-90"
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="var(--muted)"
            strokeWidth={stroke}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={BAND_STROKE[band]}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${circumference * filled} ${circumference}`}
            className="transition-[stroke-dasharray] duration-500"
          />
        </svg>
        <span
          className={cn("absolute font-semibold tabular-nums", BAND_TEXT[band])}
          style={{ fontSize: Math.round(size * 0.32) }}
        >
          {score}
        </span>
      </span>
      {showLabel ? (
        <span className={cn("text-[11px] font-medium", BAND_TEXT[band])}>{BAND_WORD[band]}</span>
      ) : null}
    </span>
  );
}

/**
 * What is actually moving the score.
 *
 * clinicHealth() already returns signed factors; this renders them as a
 * diverging bar chart around a centre line so "rounded 9 days ago" reads as
 * clearly positive and "3 overdue tasks" as clearly negative. Sorted by
 * magnitude, because the biggest lever is the only one worth acting on.
 */
export function HealthBreakdownChart({ health }: { health: HealthBreakdown }) {
  const factors = [...health.factors].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  const max = Math.max(10, ...factors.map((f) => Math.abs(f.delta)));

  return (
    <div className="space-y-2.5">
      {factors.map((f) => {
        const pct = (Math.abs(f.delta) / max) * 50;
        const positive = f.delta >= 0;
        return (
          <div key={f.label} className="grid grid-cols-[minmax(0,1fr)_5.5rem] items-center gap-3">
            <span className="truncate text-sm">{f.label}</span>
            <span className="relative flex h-5 items-center">
              {/* centre line: everything left of it hurts, right of it helps */}
              <span className="absolute inset-y-0 left-1/2 w-px bg-border" />
              <span
                className={cn(
                  "absolute h-2.5 rounded-full",
                  positive ? "left-1/2 bg-success" : "right-1/2 bg-critical",
                )}
                style={{ width: `${pct}%` }}
              />
              <span
                className={cn(
                  "absolute text-[11px] font-medium tabular-nums",
                  positive ? "right-0 text-success" : "left-0 text-critical",
                )}
              >
                {positive ? "+" : ""}
                {f.delta}
              </span>
            </span>
          </div>
        );
      })}
      {factors.length === 0 ? (
        <p className="text-sm text-muted-foreground">Not enough activity to score this clinic yet.</p>
      ) : null}
    </div>
  );
}

/** Compact inline dot — for dense lists and select options. */
export function HealthDot({ band, className }: { band: HealthBreakdown["band"]; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block h-2.5 w-2.5 shrink-0 rounded-full", className)}
      style={{ background: BAND_STROKE[band] }}
    />
  );
}

export { BAND_WORD };
