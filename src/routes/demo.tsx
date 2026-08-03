import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { Lockup } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { startDemoSession } from "@/lib/demo-access.functions";

export const Route = createFileRoute("/demo")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Round Robin — live demo" },
      {
        name: "description",
        content: "Explore Round Robin with a fully populated demo organization. No signup.",
      },
      // A shared demo link should not accumulate search ranking.
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: DemoEntry,
});

/**
 * Public entry point. Exchanges nothing, asks for nothing — calls the server,
 * adopts the returned session, and lands on Today.
 */
function DemoEntry() {
  const navigate = useNavigate();
  const start = useServerFn(startDemoSession);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await start();
        if (cancelled) return;
        if (!res.ok) {
          setError(res.error);
          return;
        }
        const { error: sessErr } = await supabase.auth.setSession({
          access_token: res.accessToken,
          refresh_token: res.refreshToken,
        });
        if (sessErr) {
          setError(sessErr.message);
          return;
        }
        sessionStorage.setItem("rr.demo", "1");
        navigate({ to: "/today", replace: true });
      } catch {
        if (!cancelled) setError("Could not start the demo. Please try again.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate, start]);

  return (
    <div className="min-h-dvh-screen flex items-center justify-center bg-background px-6 py-12">
      <div className="w-full max-w-sm text-center">
        <div className="mb-8 flex justify-center">
          <Lockup width={232} />
        </div>
        {error ? (
          <>
            <p className="text-[1.0625rem] font-medium">Demo unavailable</p>
            <p className="mt-2 text-sm text-muted-foreground">{error}</p>
            <Button className="mt-6" onClick={() => location.reload()}>
              Try again
            </Button>
          </>
        ) : (
          <p className="flex items-center justify-center gap-2.5 text-[0.9375rem] text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Setting up your demo…
          </p>
        )}
      </div>
    </div>
  );
}
