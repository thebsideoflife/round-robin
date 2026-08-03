import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

/** Minutes of inactivity before the session is ended. */
const IDLE_MINUTES = Number(import.meta.env.VITE_IDLE_TIMEOUT_MINUTES ?? 20);
const WARN_SECONDS = 60;

const ACTIVITY_EVENTS = [
  "pointerdown",
  "keydown",
  "touchstart",
  "wheel",
  "visibilitychange",
] as const;

/**
 * Automatic sign-out after a period of inactivity.
 *
 * Leadership rounding happens on shared and unattended devices — a phone left
 * on a nurses' station, a tablet passed between managers. An idle timeout is
 * a standard HIPAA technical safeguard (§164.312(a)(2)(iii), automatic
 * logoff) and costs nothing to add now.
 *
 * Tuned via VITE_IDLE_TIMEOUT_MINUTES; set to 0 to disable during development.
 */
export function useIdleLogout(onWarn?: (secondsLeft: number) => void) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warnRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!IDLE_MINUTES || IDLE_MINUTES <= 0) return;
    if (typeof window === "undefined") return;

    const idleMs = IDLE_MINUTES * 60_000;

    const clear = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (warnRef.current) clearTimeout(warnRef.current);
    };

    const schedule = () => {
      clear();
      warnRef.current = setTimeout(
        () => onWarn?.(WARN_SECONDS),
        Math.max(0, idleMs - WARN_SECONDS * 1000),
      );
      timerRef.current = setTimeout(async () => {
        await supabase.auth.signOut();
        // Full reload rather than a client navigation so nothing stays in
        // memory for the next person to pick up the device.
        window.location.assign("/auth?reason=timeout");
      }, idleMs);
    };

    schedule();
    ACTIVITY_EVENTS.forEach((e) =>
      window.addEventListener(e, schedule, { passive: true }),
    );

    return () => {
      clear();
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, schedule));
    };
  }, [onWarn]);
}
