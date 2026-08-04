import { cn } from "@/lib/utils";
import type { ThemeTrend } from "@/lib/domain/trends";

/**
 * Ranked themes, without a chart library.
 *
 * The vertical bar chart it replaces had axes, gridlines and rotated labels —
 * a lot of ink to say "staffing is mentioned most". This is the same data as
 * a ranked list: the bar carries magnitude, position carries rank, colour
 * carries whether it has already escalated, and the label sits where you read
 * it rather than rotated 35 degrees under an axis.
 *
 * Two bars per row. The solid one is mentions; the faint one behind it is how
 * many clinics are affected, so a theme that's loud in one place looks
 * different from one that's quietly everywhere.
 */
export function ThemeRanking({
  trends,
  onSelect,
  limit = 8,
}: {
  trends: ThemeTrend[];
  onSelect?: (theme: string) => void;
  limit?: number;
}) {
  const shown = trends.slice(0, limit);
  if (!shown.length) return null;

  const maxMentions = Math.max(...shown.map((t) => t.mentions), 1);
  const maxClinics = Math.max(...shown.map((t) => t.clinics), 1);

  return (
    <div className="space-y-1">
      {shown.map((t, i) => {
        const hot = t.executiveEscalations > 0;
        const mentionPct = (t.mentions / maxMentions) * 100;
        const clinicPct = (t.clinics / maxClinics) * 100;

        return (
          <button
            key={t.theme}
            type="button"
            onClick={onSelect ? () => onSelect(t.theme) : undefined}
            disabled={!onSelect}
            className={cn(
              "group w-full rounded-xl px-3 py-3 text-start transition-colors",
              onSelect && "hover:bg-accent/40",
            )}
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="flex min-w-0 items-baseline gap-2.5">
                <span className="w-4 shrink-0 text-[0.8125rem] font-medium text-muted-foreground tabular-nums">
                  {i + 1}
                </span>
                <span className="truncate text-[1.0625rem] font-medium">{t.theme}</span>
                {hot ? (
                  <span className="shrink-0 rounded-full bg-signal-soft px-2 py-0.5 text-[11px] font-medium text-signal-deep">
                    escalating
                  </span>
                ) : null}
              </span>
              <span className="shrink-0 text-[1.0625rem] font-semibold tabular-nums">
                {t.mentions}
              </span>
            </div>

            <div className="mt-2 ms-6.5 space-y-1" style={{ marginInlineStart: "1.625rem" }}>
              {/* clinic spread — faint, sits behind conceptually */}
              <span className="block h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <span
                  className="block h-full rounded-full bg-primary/25 transition-[width] duration-500"
                  style={{ width: `${clinicPct}%` }}
                />
              </span>
              {/* mentions — the headline number */}
              <span className="block h-2.5 w-full overflow-hidden rounded-full bg-muted">
                <span
                  className="block h-full rounded-full transition-[width] duration-500"
                  style={{
                    width: `${mentionPct}%`,
                    background: hot ? "var(--signal)" : "var(--primary)",
                  }}
                />
              </span>
              <span className="block pt-0.5 text-[0.8125rem] text-muted-foreground">
                {t.clinics} clinic{t.clinics === 1 ? "" : "s"}
                {t.openTasks ? ` · ${t.openTasks} open` : ""}
                {t.clinicNames.length ? ` · ${t.clinicNames.slice(0, 2).join(", ")}` : ""}
                {t.clinicNames.length > 2 ? ` +${t.clinicNames.length - 2}` : ""}
              </span>
            </div>
          </button>
        );
      })}

      <p className="px-3 pt-2 text-[0.8125rem] text-muted-foreground">
        Solid bar is mentions, faint bar is how many clinics it spans. Orange means it has already
        reached executive review.
      </p>
    </div>
  );
}
