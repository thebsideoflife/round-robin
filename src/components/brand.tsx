import { cn } from "@/lib/utils";

/**
 * Round Robin brand assets.
 *
 * These are the supplied vector artwork, not a redraw. Each file is the same
 * SVG with a cropped viewBox — no paths were edited — so the mark, the lockup
 * and the wordmark are guaranteed to stay identical to the master.
 *
 * Vector means the 16px favicon and the 232px sign-in lockup are the same
 * source, and neither is resampled.
 */

export function Mark({
  size = 36,
  className,
  priority,
}: {
  size?: number;
  className?: string;
  priority?: boolean;
}) {
  return (
    <img
      src="/brand/round-robin-mark.svg"
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      className={cn("shrink-0 select-none object-contain", className)}
      style={{ width: size, height: size }}
    />
  );
}

/** Full stacked lockup: bird mark, wordmark and tagline. */
export function Lockup({ width = 220, className }: { width?: number; className?: string }) {
  return (
    <img
      src="/brand/round-robin-lockup.svg"
      width={width}
      height={Math.round((width * 1125) / 1077)}
      alt="Round Robin — Ambulatory Operational Intelligence"
      loading="eager"
      decoding="async"
      className={cn("select-none object-contain", className)}
      style={{ width }}
    />
  );
}

/** Horizontal lockup for the app bar and desktop rail. */
export function BrandLine({
  size = 36,
  showTagline = true,
  className,
}: {
  size?: number;
  showTagline?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("flex min-w-0 items-center gap-2.5", className)}>
      <Mark size={size} priority />
      <span className="min-w-0 leading-tight">
        <span className="block truncate text-[1.0625rem] font-semibold tracking-tight">
          <span className="font-normal">round</span> <span className="text-primary">robin</span>
        </span>
        {showTagline ? (
          <span className="block truncate text-[11px] text-muted-foreground">
            Ambulatory Operational Intelligence
          </span>
        ) : null}
      </span>
    </span>
  );
}
