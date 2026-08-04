import { useCallback, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Mark } from "@/components/brand";
import { useStore } from "@/lib/store";
import { metricsFor } from "@/lib/domain/org";
import { askRobin } from "@/lib/robin.functions";
import { cn } from "@/lib/utils";

/**
 * Robin — a small assistant over the data already on screen.
 *
 * Deliberately narrow: it gets a numeric summary of the person's own scope,
 * never raw round notes or staff names, so asking it a question can't send a
 * private conversation to a model provider.
 */

const SUGGESTIONS = [
  "Which clinics need attention?",
  "What's waiting on me?",
  "Where haven't we rounded?",
  "What are staff saying about staffing?",
  "How is my team doing?",
];

interface Turn {
  role: "you" | "robin";
  text: string;
}

export function RobinChat({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { scope } = useStore();
  const ask = useServerFn(askRobin);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  // Robin reads the database itself, through the same RLS-scoped query the
  // app uses — so nothing here has to be assembled or sent from the browser.
  const summary = metricsFor(scope.clinics, scope.rounds, scope.tasks);

  const send = useCallback(
    async (question: string) => {
      const text = question.trim();
      if (!text || busy) return;
      setQ("");
      setTurns((t) => [...t, { role: "you", text }]);
      setBusy(true);
      try {
        const res = await ask({
          data: {
            question: text,
            // Last few turns so follow-ups like "and which of those is worst?" work.
            history: turns.slice(-6).map((t) => ({
              role: t.role === "you" ? ("user" as const) : ("assistant" as const),
              content: t.text,
            })),
          },
        });
        setTurns((t) => [
          ...t,
          { role: "robin", text: "error" in res ? res.error : res.answer },
        ]);
      } catch {
        setTurns((t) => [...t, { role: "robin", text: "Something went wrong. Try again?" }]);
      } finally {
        setBusy(false);
        requestAnimationFrame(() => endRef.current?.scrollIntoView({ behavior: "smooth" }));
      }
    },
    [ask, busy, turns],
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="flex h-[86dvh] flex-col gap-0 rounded-t-3xl p-0 sm:max-w-lg">
        <SheetHeader className="flex-row items-center gap-3 border-b border-border p-4">
          <Mark size={40} priority />
          <div className="min-w-0 flex-1 text-start">
            <SheetTitle className="text-[1.0625rem]">Robin</SheetTitle>
            <SheetDescription className="text-sm">
              I read your clinics, rounds and action items — only what you can see.
            </SheetDescription>
          </div>
          <Button variant="ghost" size="icon" aria-label="Close" onClick={() => onOpenChange(false)}>
            <X className="h-5 w-5" />
          </Button>
        </SheetHeader>

        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {turns.length === 0 ? (
            <div className="space-y-4 py-2">
              <p className="text-[0.9375rem] text-muted-foreground">
                {summary.clinicCount} clinic{summary.clinicCount === 1 ? "" : "s"} · average health{" "}
                {summary.avgHealth}. Ask me anything about them.
              </p>
              <div className="flex flex-wrap gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => void send(s)}
                    className="press rounded-full border border-border bg-card px-3.5 py-2 text-sm text-muted-foreground hover:bg-accent/50"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {turns.map((t, i) => (
            <div
              key={i}
              className={cn("flex gap-2.5", t.role === "you" ? "justify-end" : "items-start")}
            >
              {t.role === "robin" ? <Mark size={28} className="mt-0.5" /> : null}
              <p
                className={cn(
                  "max-w-[80%] rounded-2xl px-3.5 py-2.5 text-[0.9375rem] leading-relaxed",
                  t.role === "you"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-foreground",
                )}
              >
                {t.text}
              </p>
            </div>
          ))}

          {busy ? (
            <div className="flex items-center gap-2.5">
              <Mark size={28} />
              <span className="flex items-center gap-2 rounded-2xl bg-muted px-3.5 py-2.5 text-sm text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Looking…
              </span>
            </div>
          ) : null}
          <div ref={endRef} />
        </div>

        <form
          className="flex items-center gap-2 border-t border-border p-3"
          onSubmit={(e) => {
            e.preventDefault();
            void send(q);
          }}
        >
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Ask Robin…"
            className="h-12 text-base"
            aria-label="Ask Robin a question"
          />
          <Button type="submit" size="icon" className="tap-target shrink-0" disabled={busy || !q.trim()}>
            <Send className="h-4 w-4" />
            <span className="sr-only">Send</span>
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}

/** Floating launcher — the bird, bottom-left so it never fights the round button. */
export function RobinLauncher({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Ask Robin about your data"
      className="press fixed start-4 z-40 grid h-13 w-13 place-items-center rounded-full border border-border bg-card shadow-raised lg:hidden"
      style={{
        bottom: "calc(var(--tabbar-h) + env(safe-area-inset-bottom, 0px) + 0.75rem)",
        height: "3.25rem",
        width: "3.25rem",
      }}
    >
      <Mark size={34} priority />
    </button>
  );
}
