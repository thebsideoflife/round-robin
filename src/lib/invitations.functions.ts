import { createServerFn } from "@tanstack/react-start";
import { getRequestHost, getRequestHeader } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { createHash, randomBytes } from "node:crypto";

const EmailSchema = z.string().trim().toLowerCase().email().max(255);
const RoleSchema = z.enum([
  "admin",
  "cao",
  "executive_director",
  "director",
  "manager",
  "coordinator",
]);
type AppRole = z.infer<typeof RoleSchema>;

function hashToken(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin role required");
}

function buildInviteUrl(token: string): string {
  const forwardedProto = getRequestHeader("x-forwarded-proto") ?? "https";
  const host = getRequestHost();
  return `${forwardedProto}://${host}/accept-invite?token=${token}`;
}

export const createInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { email: string; role: AppRole }) =>
    z.object({ email: EmailSchema, role: RoleSchema }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);

    await context.supabase
      .from("invitations")
      .update({ status: "revoked" })
      .eq("email", data.email)
      .eq("status", "pending");

    const rawToken = randomBytes(32).toString("base64url");
    const token_hash = hashToken(rawToken);

    const { data: inserted, error } = await context.supabase
      .from("invitations")
      .insert({
        email: data.email,
        role: data.role,
        token_hash,
        invited_by: context.userId,
      })
      .select("id, email, role, expires_at, created_at, status")
      .single();

    if (error) throw new Error(error.message);

    return {
      invitation: inserted,
      inviteUrl: buildInviteUrl(rawToken),
    };
  });

export const resendInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) =>
    z.object({ id: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);

    const { data: existing, error: fetchErr } = await context.supabase
      .from("invitations")
      .select("id, email, role")
      .eq("id", data.id)
      .single();
    if (fetchErr || !existing) throw new Error("Invitation not found");

    const rawToken = randomBytes(32).toString("base64url");
    const token_hash = hashToken(rawToken);

    const { error } = await context.supabase
      .from("invitations")
      .update({
        token_hash,
        status: "pending",
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        accepted_at: null,
        accepted_user_id: null,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    return { inviteUrl: buildInviteUrl(rawToken) };
  });

export const revokeInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) =>
    z.object({ id: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase
      .from("invitations")
      .update({ status: "revoked" })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) =>
    z.object({ id: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase
      .from("invitations")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listInvitations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data, error } = await context.supabase
      .from("invitations")
      .select("id, email, role, status, expires_at, created_at, accepted_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return { invitations: data ?? [] };
  });

// Public: given a raw token, verify it and return the invite details for the
// accept-invite page.
export const lookupInvitation = createServerFn({ method: "POST" })
  .inputValidator((data: { token: string }) =>
    z.object({ token: z.string().min(10).max(200) }).parse(data),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const token_hash = hashToken(data.token);

    const { data: row, error } = await supabaseAdmin
      .from("invitations")
      .select("id, email, role, status, expires_at")
      .eq("token_hash", token_hash)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!row) return { valid: false as const, reason: "not_found" as const };

    if (row.status !== "pending") {
      return {
        valid: false as const,
        reason: row.status as "accepted" | "revoked" | "expired",
      };
    }
    if (new Date(row.expires_at).getTime() < Date.now()) {
      return { valid: false as const, reason: "expired" as const };
    }
    return {
      valid: true as const,
      email: row.email as string,
      role: row.role as AppRole,
    };
  });

// Public: an invitee sets a password and accepts. Verifies the token, creates or
// reuses the auth account, grants the invited role, and marks the invite accepted.
export const acceptInvitation = createServerFn({ method: "POST" })
  .inputValidator(
    (data: { token: string; password: string }) =>
      z
        .object({
          token: z.string().min(10).max(200),
          password: z.string().min(8).max(128),
        })
        .parse(data),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const token_hash = hashToken(data.token);

    const { data: row, error: findErr } = await supabaseAdmin
      .from("invitations")
      .select("id, email, role, status, expires_at")
      .eq("token_hash", token_hash)
      .maybeSingle();
    if (findErr) throw new Error(findErr.message);
    if (!row) throw new Error("Invitation not found");
    if (row.status !== "pending") throw new Error("This invitation is no longer valid");
    if (new Date(row.expires_at).getTime() < Date.now())
      throw new Error("This invitation has expired");

    const target = row.email.toLowerCase();

    // Find an existing auth user by email (paginated admin list).
    let userId: string | undefined;
    for (let page = 1; page <= 20; page++) {
      const { data: pageData, error: listErr } = await supabaseAdmin.auth.admin.listUsers({
        page,
        perPage: 1000,
      });
      if (listErr) throw new Error(listErr.message);
      const users = pageData?.users ?? [];
      const match = users.find((u: { email?: string }) => (u.email ?? "").toLowerCase() === target);
      if (match) {
        userId = match.id;
        const { error: updErr } = await supabaseAdmin.auth.admin.updateUserById(match.id, {
          password: data.password,
          email_confirm: true,
          user_metadata: { must_reset_password: false },
        });
        if (updErr) throw new Error(updErr.message);
        break;
      }
      if (users.length < 1000) break;
    }

    if (!userId) {
      const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email: row.email,
        password: data.password,
        email_confirm: true,
        user_metadata: { must_reset_password: false, full_name: "" },
      });
      if (createErr || !created?.user) throw new Error(createErr?.message ?? "Failed to create account");
      userId = created.user.id;
    }

    await supabaseAdmin.from("user_roles").delete().eq("user_id", userId);
    const { error: roleErr } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: userId, role: row.role });
    if (roleErr) throw new Error(roleErr.message);
    await supabaseAdmin.from("pending_users").delete().eq("user_id", userId);
    await supabaseAdmin
      .from("invitations")
      .update({
        status: "accepted",
        accepted_at: new Date().toISOString(),
        accepted_user_id: userId,
      })
      .eq("id", row.id);

    return { ok: true, email: row.email as string };
  });
