import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";

/**
 * One-click demo access.
 *
 * Lets you send a bare URL that drops someone straight into the app with no
 * signup, no invite and no credentials to type.
 *
 * The demo password lives in SERVER environment only and is never shipped in
 * the client bundle — this function signs in on the server and hands back the
 * session, which the browser then adopts. That is the whole reason this is a
 * server function rather than a `VITE_` variable.
 *
 * Off unless DEMO_MODE=1. Keep it off on anything holding real data.
 */

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 30;
let hits: number[] = [];

function rateLimited(): boolean {
  const now = Date.now();
  hits = hits.filter((t) => now - t < WINDOW_MS);
  if (hits.length >= MAX_PER_WINDOW) return true;
  hits.push(now);
  return false;
}

type Result =
  | { ok: true; accessToken: string; refreshToken: string; label: string }
  | { ok: false; error: string };

export const startDemoSession = createServerFn({ method: "POST" }).handler(
  async (): Promise<Result> => {
    if (process.env.DEMO_MODE !== "1") {
      return { ok: false, error: "Demo access is disabled." };
    }
    if (rateLimited()) {
      return { ok: false, error: "Too many demo sessions right now. Try again shortly." };
    }

    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_PUBLISHABLE_KEY;
    const email = process.env.DEMO_EMAIL;
    const password = process.env.DEMO_PASSWORD;

    if (!url || !key || !email || !password) {
      console.error("[demo] DEMO_MODE=1 but DEMO_EMAIL/DEMO_PASSWORD are not set");
      return { ok: false, error: "Demo access isn't configured." };
    }

    const supabase = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.session) {
      console.error("[demo] sign-in failed:", error?.message);
      return { ok: false, error: "The demo account could not sign in." };
    }

    console.info(`[demo] session issued for ${email}`);
    return {
      ok: true,
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      label: data.user?.user_metadata?.full_name ?? email,
    };
  },
);
