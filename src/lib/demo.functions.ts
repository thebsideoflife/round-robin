import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function isAdmin(context: { supabase: { rpc: Function }; userId: string }) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  return !error && data === true;
}

// Load a fully-populated demo environment (org, rounds, tasks, wins, PX report).
// Idempotent: clears any existing demo data first. Admin-only.
export const loadDemoData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!(await isAdmin(context)))
      throw new Error("Only administrators can manage the demo environment.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { seedDemoData } = await import("./demo-seed.server");
    const result = await seedDemoData(supabaseAdmin);
    return result;
  });

// Wipe every demo row, leaving real accounts and data untouched. Admin-only.
export const clearDemoData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!(await isAdmin(context)))
      throw new Error("Only administrators can manage the demo environment.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { clearDemoData: clear } = await import("./demo-seed.server");
    const result = await clear(supabaseAdmin);
    return result;
  });

// Report whether demo data is currently loaded (drives the page button state).
export const getDemoStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!(await isAdmin(context)))
      return { loaded: false, users: 0, clinics: 0, tasks: 0, rounds: 0 };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getDemoStatus: status } = await import("./demo-seed.server");
    return status(supabaseAdmin);
  });
