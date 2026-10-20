import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Admin operations, implemented WITHOUT a service-role key.
 *
 * The original users.functions.ts leaned on `supabaseAdmin.auth.admin.*`,
 * which needs SUPABASE_SERVICE_ROLE_KEY. Keeping admin operations inside
 * SECURITY DEFINER functions means the service-role key never has to be held
 * by the web tier at all.
 *
 * Everything here goes through SECURITY DEFINER RPCs that do their own
 * `has_role(auth.uid(), 'admin')` check, so authorization lives in the
 * database rather than in this file.
 */

const RoleSchema = z.enum([
  "admin",
  "cao",
  "executive_director",
  "director",
  "manager",
  "coordinator",
]);
export type AppRole = z.infer<typeof RoleSchema>;

const ClinicRoleSchema = z.enum(["coordinator", "manager", "director", "executive_director"]);

export interface DirectoryUser {
  userId: string;
  email: string;
  fullName: string;
  title: string;
  avatarUrl: string | null;
  roles: AppRole[];
  isPending: boolean;
  createdAt: string;
  lastSignInAt: string | null;
  clinicIds: string[];
}

/** Everyone in the workspace, with roles, pending state and clinic assignments. */
export const listDirectory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DirectoryUser[]> => {
    const { data, error } = await context.supabase.rpc("admin_list_users");
    if (error) throw new Error(error.message);
    return (data ?? []).map(
      (r: {
        user_id: string;
        email: string | null;
        full_name: string | null;
        title: string | null;
        avatar_url: string | null;
        roles: AppRole[] | null;
        is_pending: boolean;
        created_at: string;
        last_sign_in_at: string | null;
        clinic_ids: string[] | null;
      }) => ({
        userId: r.user_id,
        email: r.email ?? "",
        fullName: r.full_name ?? "",
        title: r.title ?? "",
        avatarUrl: r.avatar_url ?? null,
        roles: r.roles ?? [],
        isPending: r.is_pending,
        createdAt: r.created_at,
        lastSignInAt: r.last_sign_in_at,
        clinicIds: r.clinic_ids ?? [],
      }),
    );
  });

/** Set a person's single role. The RPC refuses to remove the last admin. */
export const setUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ userId: z.string().uuid(), role: RoleSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("admin_set_role", {
      _user_id: data.userId,
      _role: data.role,
    });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/** Attach or detach a person from a clinic at a given tier. */
export const setClinicAssignment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        clinicId: z.string().uuid(),
        role: ClinicRoleSchema,
        attach: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("admin_set_clinic_assignment", {
      _user_id: data.userId,
      _clinic_id: data.clinicId,
      _role: data.role,
      _attach: data.attach,
    });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/**
 * Invite someone by email.
 *
 * We cannot create an auth user directly without a service-role key, so this
 * writes an invitation row instead. When that person signs up, the existing
 * `handle_new_auth_user` trigger matches the pending invitation and assigns
 * the role automatically — no admin approval step needed.
 */
export const inviteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ email: z.string().email().max(200), role: RoleSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const email = data.email.trim().toLowerCase();

    // Already has an account? Just set the role.
    const { data: existing } = await context.supabase.rpc("admin_list_users");
    const match = (existing ?? []).find(
      (u: { email: string | null; user_id: string }) => (u.email ?? "").toLowerCase() === email,
    );
    if (match) {
      const { error } = await context.supabase.rpc("admin_set_role", {
        _user_id: match.user_id,
        _role: data.role,
      });
      if (error) throw new Error(error.message);
      return { ok: true as const, mode: "role_updated" as const, email };
    }

    // A random token; only its hash is stored, matching the existing schema.
    const raw = crypto.randomUUID() + crypto.randomUUID();
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
    const tokenHash = [...new Uint8Array(digest)]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    await context.supabase.from("invitations").delete().eq("email", email).eq("status", "pending");
    const { error } = await context.supabase.from("invitations").insert({
      email,
      role: data.role,
      token_hash: tokenHash,
      invited_by: context.userId,
    });
    if (error) throw new Error(error.message);

    return { ok: true as const, mode: "invited" as const, email };
  });

/** Pending invitations, so the admin screen can show who hasn't signed up yet. */
export const listInvitations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("invitations")
      .select("id, email, role, status, created_at, expires_at")
      .eq("status", "pending")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const revokeInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("invitations")
      .update({ status: "revoked" })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/** Create a clinic from the admin screen. */
export const createClinicRecord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        name: z.string().min(2).max(120),
        specialty: z.string().max(80).optional(),
        location: z.string().max(160).optional(),
        region: z.string().max(80).optional(),
        division: z.string().max(80).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("clinics")
      .insert({
        name: data.name.trim(),
        specialty: data.specialty || null,
        location: data.location || null,
        region: data.region || null,
        division: data.division || null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id as string };
  });

/** Edit someone's display name, title or photo. Admins only (or yourself). */
export const updateProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        fullName: z.string().max(120).optional(),
        title: z.string().max(160).optional(),
        // "" clears the photo; undefined leaves it untouched.
        avatarUrl: z.string().max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("admin_update_profile", {
      _user_id: data.userId,
      _full_name: data.fullName ?? null,
      _title: data.title ?? null,
      _avatar_url: data.avatarUrl ?? null,
    });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/**
 * Set a temporary password.
 *
 * Ends every existing session for that account and flags it so the app forces
 * a change at next sign-in — otherwise a handover could leave the previous
 * holder signed in on another device.
 */
export const setTemporaryPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        password: z
          .string()
          .min(10, "Use at least 10 characters")
          .max(72, "Bcrypt truncates beyond 72 characters"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("admin_set_password", {
      _user_id: data.userId,
      _password: data.password,
    });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/**
 * Send a password reset email instead of handing one over.
 *
 * Preferable to setTemporaryPassword when the person has a working inbox —
 * nobody has to speak a password out loud or put it in a chat message.
 */
export const sendPasswordReset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ email: z.string().email(), redirectTo: z.string().url().optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Only administrators can send password resets");

    const { error } = await context.supabase.auth.resetPasswordForEmail(data.email, {
      redirectTo: data.redirectTo,
    });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
