import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const RoleSchema = z.enum([
  "admin",
  "cao",
  "executive_director",
  "director",
  "manager",
]);
export type AppRole = z.infer<typeof RoleSchema>;

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin role required");
}

async function findAuthUserByEmail(supabaseAdmin: any, email: string) {
  const target = email.trim().toLowerCase();
  const perPage = 1000;
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage,
    });
    if (error) throw new Error(error.message);
    const users = data?.users ?? [];
    const match = users.find((u: any) => (u.email ?? "").toLowerCase() === target);
    if (match) return match;
    if (users.length < perPage) return null;
  }
  return null;
}

async function listAllAuthUsers(supabaseAdmin: any) {
  const perPage = 1000;
  const all: any[] = [];
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage,
    });
    if (error) throw new Error(error.message);
    const users = data?.users ?? [];
    all.push(...users);
    if (users.length < perPage) break;
  }
  return all;
}

// Called by the _authenticated gate to decide whether to route to the app or
// the awaiting-approval page. Also returns the profile + roles the store needs.
export const getMyAccessStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("get_me");
    if (error) throw new Error(error.message);
    const me = (data ?? [])[0];
    let roles: string[] = me?.roles ?? [];

    // Bootstrap: if nobody in the workspace has a role yet, make the first
    // signed-in user the administrator so the org can be built from the app.
    // Runs as a SECURITY DEFINER function rather than through a service-role
    // client, because your Supabase project does not issue a service-role key.
    if (roles.length === 0) {
      const { data: bootstrapped } = await context.supabase.rpc("bootstrap_first_admin");
      if (bootstrapped === true) roles = ["admin"];
    }

    return {
      hasAccess: roles.length > 0,
      roles,
      isAdmin: roles.includes("admin"),
      email: me?.email ?? null,
      fullName: me?.full_name ?? "",
      title: me?.title ?? "",
    };
  });

export const updateMyProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { fullName: string; title: string }) =>
    z
      .object({
        fullName: z.string().trim().max(120),
        title: z.string().trim().max(120),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("profiles")
      .update({ full_name: data.fullName, title: data.title })
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listMembers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: roles, error: rolesErr } = await supabaseAdmin
      .from("user_roles")
      .select("user_id, role, created_at")
      .order("created_at", { ascending: false });
    if (rolesErr) throw new Error(rolesErr.message);

    const { data: pending } = await supabaseAdmin
      .from("pending_users")
      .select("user_id");
    const pendingIds = new Set((pending ?? []).map((p: { user_id: string }) => p.user_id));

    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("user_id, full_name, title");

    const authUsers = await listAllAuthUsers(supabaseAdmin);

    const rolesByUser = new Map<string, string[]>();
    for (const r of roles ?? []) {
      const arr = rolesByUser.get(r.user_id);
      if (arr) arr.push(r.role);
      else rolesByUser.set(r.user_id, [r.role]);
    }
    const nameByUser = new Map<string, string>();
    for (const p of profiles ?? []) nameByUser.set(p.user_id, p.full_name);

    const members = authUsers
      .filter((u) => !pendingIds.has(u.id))
      .map((u) => ({
        user_id: u.id,
        roles: rolesByUser.get(u.id) ?? [],
        email: u.email ?? null,
        full_name: nameByUser.get(u.id) ?? "",
        last_sign_in_at: u.last_sign_in_at ?? null,
      }))
      .sort((a, b) => (b.roles.length > 0 ? 1 : 0) - (a.roles.length > 0 ? 1 : 0));

    return { members };
  });

export const listPendingUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data, error } = await context.supabase
      .from("pending_users")
      .select("user_id, email, created_at, requested_via")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { pending: data ?? [] };
  });

export const changeUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { userId: string; role: AppRole }) =>
    z.object({ userId: z.string().uuid(), role: RoleSchema }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (data.userId === context.userId && data.role !== "admin") {
      throw new Error("You cannot remove your own admin role");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId);
    const { error } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: data.userId, role: data.role });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deactivateUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { userId: string }) =>
    z.object({ userId: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (data.userId === context.userId) throw new Error("You cannot deactivate yourself");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId);
    return { ok: true };
  });

export const deleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { userId: string }) =>
    z.object({ userId: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (data.userId === context.userId) throw new Error("You cannot delete yourself");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId);
    await supabaseAdmin.from("pending_users").delete().eq("user_id", data.userId);
    await supabaseAdmin.from("team_members").delete().eq("user_id", data.userId);
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const approvePendingUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { userId: string; role: AppRole }) =>
    z.object({ userId: z.string().uuid(), role: RoleSchema }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: roleErr } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: data.userId, role: data.role });
    if (roleErr) throw new Error(roleErr.message);
    await supabaseAdmin.from("pending_users").delete().eq("user_id", data.userId);
    return { ok: true };
  });

export const denyPendingUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { userId: string }) =>
    z.object({ userId: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("pending_users").delete().eq("user_id", data.userId);
    await supabaseAdmin.auth.admin.deleteUser(data.userId);
    return { ok: true };
  });

export const createUserWithPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: { email: string; temporaryPassword: string; role: AppRole; fullName?: string }) =>
      z
        .object({
          email: z.string().trim().email().max(255),
          temporaryPassword: z.string().min(8).max(128),
          role: RoleSchema,
          fullName: z.string().trim().max(120).optional(),
        })
        .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const existing = await findAuthUserByEmail(supabaseAdmin, data.email);
    let userId: string;
    let reused = false;

    if (existing) {
      const { data: existingRoles, error: rolesErr } = await supabaseAdmin
        .from("user_roles")
        .select("role")
        .eq("user_id", existing.id);
      if (rolesErr) throw new Error(rolesErr.message);
      if ((existingRoles ?? []).length > 0) {
        throw new Error(
          "A user with this email is already active. Delete them first from the Members table.",
        );
      }
      const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(existing.id, {
        password: data.temporaryPassword,
        email_confirm: true,
        user_metadata: { must_reset_password: true, created_by_admin: true },
      });
      if (updateErr) throw new Error(updateErr.message);
      userId = existing.id;
      reused = true;
    } else {
      const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email: data.email,
        password: data.temporaryPassword,
        email_confirm: true,
        user_metadata: {
          must_reset_password: true,
          created_by_admin: true,
          full_name: data.fullName,
        },
      });
      if (createErr || !created?.user) {
        throw new Error(createErr?.message ?? "Failed to create user");
      }
      userId = created.user.id;
    }

    await supabaseAdmin.from("pending_users").delete().eq("user_id", userId);
    if (data.fullName) {
      await supabaseAdmin
        .from("profiles")
        .upsert({ user_id: userId, full_name: data.fullName });
    }
    await supabaseAdmin.from("user_roles").delete().eq("user_id", userId);
    const { error: roleErr } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: userId, role: data.role });
    if (roleErr) throw new Error(roleErr.message);

    return { userId, email: data.email, reused };
  });
