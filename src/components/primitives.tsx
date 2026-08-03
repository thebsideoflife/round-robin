import { Link, type LinkProps } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Shared layout primitives.
 *
 * Before this file, the same "metric tile", "list of rows with a chevron" and
 * "horizontal filter chips" markup was hand-rolled in nine route files with
 * small inconsistencies in spacing, truncation and tap-target size. Everything
 * now composes from here, which is most of the de-duplication work.
 */

/* ------------------------------------------------------------------ */

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-[1.625rem] leading-tight font-semibold tracking-tight">{title}</h2>
        {description ? (
          <p className="mt-1.5 text-[0.9375rem] text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function SectionHeading({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-3">
      <div className="min-w-0">
        <h3 className="truncate text-[1.0625rem] font-semibold">{title}</h3>
        {description ? (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */

export type Tone = "default" | "success" | "warning" | "critical" | "primary" | "signal";

const TONE_TEXT: Record<Tone, string> = {
  default: "text-foreground",
  success: "text-success",
  warning: "text-warning-foreground",
  critical: "text-critical",
  primary: "text-primary",
  signal: "text-signal-deep",
};

/**
 * One number with a label. Tapping it can filter another view, which is how
 * the old standalone Escalations and Weekly pages were absorbed.
 */
export function Metric({
  label,
  value,
  hint,
  tone = "default",
  to,
  search,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: Tone;
  to?: LinkProps["to"];
  search?: Record<string, string | undefined>;
}) {
  const body = (
    <>
      <p className="line-clamp-2 text-[0.8125rem] font-medium text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-[2rem] leading-none font-semibold tabular-nums", TONE_TEXT[tone])}>
        {value}
      </p>
      {hint ? <p className="mt-1.5 truncate text-xs text-muted-foreground">{hint}</p> : null}
    </>
  );

  const classes =
    "flex min-h-[6rem] flex-col justify-between rounded-2xl border border-border bg-card p-4 shadow-card";

  if (to) {
    return (
      <Link
        {...({ to, search } as LinkProps)}
        className={cn(classes, "press hover:bg-accent/40")}
      >
        {body}
      </Link>
    );
  }
  return <div className={classes}>{body}</div>;
}

/** Metrics wrap 2-up on phones and 4-up from tablet onwards. */
export function MetricGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">{children}</div>;
}

/* ------------------------------------------------------------------ */

/** A tappable row: title, supporting line, and something on the right. */
export function Row({
  title,
  subtitle,
  right,
  to,
  params,
  search,
  onClick,
  leading,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
  to?: LinkProps["to"];
  params?: Record<string, string>;
  search?: Record<string, string | undefined>;
  onClick?: () => void;
  leading?: ReactNode;
}) {
  const inner = (
    <>
      {leading ? <span className="shrink-0">{leading}</span> : null}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[1.0625rem] font-medium leading-snug">{title}</span>
        {subtitle ? (
          <span className="mt-1 block truncate text-sm text-muted-foreground">{subtitle}</span>
        ) : null}
      </span>
      {right ? <span className="shrink-0">{right}</span> : null}
      {to || onClick ? (
        <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground/40" />
      ) : null}
    </>
  );

  const classes =
    "press flex min-h-[4rem] w-full items-center gap-3.5 px-4 py-3.5 text-start transition-colors";

  if (to) {
    return (
      <Link
        {...({ to, params, search } as LinkProps)}
        className={cn(classes, "hover:bg-accent/40")}
      >
        {inner}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cn(classes, "hover:bg-accent/40")}>
        {inner}
      </button>
    );
  }
  return <div className={classes}>{inner}</div>;
}

/** Card that holds a divided list of Rows. */
export function ListCard({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("gap-0 divide-y divide-border overflow-hidden rounded-2xl p-0", className)}>
      {children}
    </Card>
  );
}

/* ------------------------------------------------------------------ */

/**
 * Horizontally scrolling filter chips. Replaces the shadcn Tabs bar that
 * overflowed and clipped its own triggers below ~380px.
 */
export function FilterRail<T extends string>({
  options,
  value,
  onChange,
  counts,
  label = "Filter",
}: {
  options: readonly T[];
  value: T;
  onChange: (next: T) => void;
  counts?: Partial<Record<T, number>>;
  label?: string;
}) {
  return (
    <div className="scroll-rail -mx-4 px-4 py-1" role="tablist" aria-label={label}>
      {options.map((opt) => {
        const active = opt === value;
        const count = counts?.[opt];
        return (
          <button
            key={opt}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt)}
            className={cn(
              "press flex h-11 items-center gap-1.5 rounded-full border px-4 text-[0.9375rem] font-medium whitespace-nowrap",
              active
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:bg-accent/50",
            )}
          >
            {opt}
            {typeof count === "number" ? (
              <span
                className={cn(
                  "rounded-full px-1.5 text-[11px] tabular-nums",
                  active ? "bg-primary-foreground/20" : "bg-muted",
                )}
              >
                {count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <Card className="items-center gap-2 px-6 py-12 text-center">
      <p className="text-[1.0625rem] font-medium">{title}</p>
      {description ? (
        <p className="max-w-[34ch] text-[0.9375rem] leading-relaxed text-muted-foreground">{description}</p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </Card>
  );
}

/** Skeleton used while the scope query resolves. */
export function LoadingBlock({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="space-y-3" role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-[5.25rem] animate-pulse rounded-xl bg-muted" />
        ))}
      </div>
      <div className="h-40 animate-pulse rounded-xl bg-muted" />
      <div className="h-40 animate-pulse rounded-xl bg-muted" />
    </div>
  );
}
