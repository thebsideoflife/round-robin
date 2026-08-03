import { useCallback, useEffect, useState } from "react";
import { Download, RefreshCw, Share, X } from "lucide-react";
import { Button } from "@/components/ui/button";

/* ------------------------------------------------------------------ */
/* Service worker registration + update detection                      */
/* ------------------------------------------------------------------ */

let waitingWorker: ServiceWorker | null = null;
const updateListeners = new Set<(available: boolean) => void>();

function announceUpdate(available: boolean) {
  updateListeners.forEach((fn) => fn(available));
}

/**
 * Registers the service worker and watches for a newer build.
 *
 * This is what makes "push an update to the field" work: a deploy produces a
 * new sw.js, the browser picks it up on next launch or after 60 minutes, and
 * users get an in-app prompt instead of needing to reinstall anything.
 */
export function registerServiceWorker() {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;
  if (import.meta.env.DEV) return; // never intercept the dev server

  window.addEventListener("load", async () => {
    try {
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });

      if (reg.waiting) {
        waitingWorker = reg.waiting;
        announceUpdate(true);
      }

      reg.addEventListener("updatefound", () => {
        const installing = reg.installing;
        if (!installing) return;
        installing.addEventListener("statechange", () => {
          // "installed" with an existing controller means a newer build is ready.
          if (installing.state === "installed" && navigator.serviceWorker.controller) {
            waitingWorker = installing;
            announceUpdate(true);
          }
        });
      });

      // Re-check hourly for long-lived sessions on a shared clinic device.
      setInterval(() => void reg.update(), 60 * 60 * 1000);
    } catch {
      // A failed registration must never break the app.
    }
  });

  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });
}

export function UpdateBanner() {
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    updateListeners.add(setAvailable);
    return () => {
      updateListeners.delete(setAvailable);
    };
  }, []);

  const apply = useCallback(() => {
    waitingWorker?.postMessage("SKIP_WAITING");
    setAvailable(false);
  }, []);

  if (!available) return null;

  return (
    <div
      role="status"
      className="flex items-center gap-3 border-b border-primary/20 bg-primary-soft px-4 py-2.5 text-sm"
    >
      <RefreshCw className="h-4 w-4 shrink-0 text-primary" />
      <span className="min-w-0 flex-1">A new version is ready.</span>
      <Button size="sm" onClick={apply} className="h-8 shrink-0">
        Update
      </Button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Install prompt                                                      */
/* ------------------------------------------------------------------ */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "rr.install.dismissed";

const isStandalone = () =>
  typeof window !== "undefined" &&
  (window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari reports installed apps here rather than via display-mode.
    (window.navigator as { standalone?: boolean }).standalone === true);

const isIos = () =>
  typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent);

/**
 * Nudges managers to install the app to their home screen. Chrome/Android gets
 * the native prompt; iOS Safari has no such API, so it gets the Share-sheet
 * instructions instead. Dismissal is remembered for 30 days.
 */
export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHint, setShowIosHint] = useState(false);

  useEffect(() => {
    if (isStandalone()) return;

    const dismissedAt = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
    if (Date.now() - dismissedAt < 30 * 24 * 60 * 60 * 1000) return;

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);

    // iOS never fires beforeinstallprompt, so surface the manual path.
    if (isIos()) {
      const timer = setTimeout(() => setShowIosHint(true), 4000);
      return () => {
        clearTimeout(timer);
        window.removeEventListener("beforeinstallprompt", onPrompt);
      };
    }

    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setDeferred(null);
    setShowIosHint(false);
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    dismiss();
  };

  if (!deferred && !showIosHint) return null;

  return (
    <div
      className="pb-safe fixed inset-x-0 bottom-0 z-50 px-3 lg:hidden"
      style={{ paddingBottom: "calc(var(--tabbar-h) + env(safe-area-inset-bottom, 0px) + 0.75rem)" }}
    >
      <div className="flex items-start gap-3 rounded-2xl border border-border bg-card p-3 shadow-raised">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
          {deferred ? <Download className="h-5 w-5" /> : <Share className="h-5 w-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Add Round Robin to your home screen</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {deferred
              ? "Full screen, launches instantly, and the mic works the same."
              : "Tap Share, then “Add to Home Screen”."}
          </p>
          {deferred ? (
            <Button size="sm" className="mt-2 h-8" onClick={install}>
              Install
            </Button>
          ) : null}
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="tap-target -m-1 grid shrink-0 place-items-center text-muted-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
