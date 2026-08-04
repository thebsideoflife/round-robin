import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { AppData, Person } from "@/data/types";
import {
  mapClinics,
  mapPeople,
  mapRound,
  mapTask,
  type AssignmentRow,
  type ClinicRow,
  type ProfileRow,
  type RoundRow,
  type RoleRow,
  type TaskRow,
} from "./mappers";

// The single read that feeds the entire client store. RLS auto-filters clinics,
// rounds and tasks to what the signed-in user may see; people/roles are fetched
// with the admin client (after auth verification) and trimmed to the user's scope.
export const getScope = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { loadScope } = await import("./scope.server");
    return loadScope(context.supabase, context.userId);
  });

// Admin: create a clinic and optionally assign leaders in one call.
export const createClinic = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      name: string;
      specialty?: string;
      location?: string;
      region?: string;
      division?: string;
      staffCount?: number;
      providerCount?: number;
      managerId?: string;
      directorId?: string;
      executiveDirectorId?: string;
    }) =>
      z
        .object({
          name: z.string().trim().min(1).max(200),
          specialty: z.string().trim().max(120).optional(),
          location: z.string().trim().max(200).optional(),
          region: z.string().trim().max(120).optional(),
          division: z.string().trim().max(120).optional(),
          staffCount: z.number().int().min(0).optional(),
          providerCount: z.number().int().min(0).optional(),
          managerId: z.string().uuid().optional(),
          directorId: z.string().uuid().optional(),
          executiveDirectorId: z.string().uuid().optional(),
        })
        .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabase } = context;

    const { data: clinic, error } = await supabase
      .from("clinics")
      .insert({
        name: data.name,
        specialty: data.specialty ?? null,
        location: data.location ?? null,
        region: data.region ?? null,
        division: data.division ?? null,
        staff_count: data.staffCount ?? 0,
        provider_count: data.providerCount ?? 0,
      })
      .select("id")
      .single();
    if (error || !clinic) throw new Error(error?.message ?? "Failed to create clinic");
    const clinicId = clinic.id;

    type AssignRow = {
      clinic_id: string;
      user_id: string;
      role: "manager" | "director" | "executive_director";
    };
    const rows: AssignRow[] = [
      data.managerId && {
        clinic_id: clinicId,
        user_id: data.managerId,
        role: "manager" as const,
      },
      data.directorId && {
        clinic_id: clinicId,
        user_id: data.directorId,
        role: "director" as const,
      },
      data.executiveDirectorId && {
        clinic_id: clinicId,
        user_id: data.executiveDirectorId,
        role: "executive_director" as const,
      },
    ].filter((r): r is AssignRow => !!r);
    if (rows.length) {
      const { error: aErr } = await supabase
        .from("clinic_assignments")
        .insert(rows as never);
      if (aErr) throw new Error(aErr.message);
    }
    return { clinicId };
  });

export const updateClinic = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      id: string;
      name?: string;
      specialty?: string;
      location?: string;
      region?: string;
      division?: string;
      staffCount?: number;
      providerCount?: number;
      managerId?: string | null;
      directorId?: string | null;
      executiveDirectorId?: string | null;
    }) =>
      z
        .object({
          id: z.string().uuid(),
          name: z.string().trim().max(200).optional(),
          specialty: z.string().trim().max(120).optional(),
          location: z.string().trim().max(200).optional(),
          region: z.string().trim().max(120).optional(),
          division: z.string().trim().max(120).optional(),
          staffCount: z.number().int().min(0).optional(),
          providerCount: z.number().int().min(0).optional(),
          managerId: z.string().uuid().nullable().optional(),
          directorId: z.string().uuid().nullable().optional(),
          executiveDirectorId: z.string().uuid().nullable().optional(),
        })
        .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabase } = context;

    const patch: Record<string, unknown> = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.specialty !== undefined) patch.specialty = data.specialty;
    if (data.location !== undefined) patch.location = data.location;
    if (data.region !== undefined) patch.region = data.region;
    if (data.division !== undefined) patch.division = data.division;
    if (data.staffCount !== undefined) patch.staff_count = data.staffCount;
    if (data.providerCount !== undefined) patch.provider_count = data.providerCount;
    if (Object.keys(patch).length) {
      const { error } = await supabase
        .from("clinics")
        .update(patch as never)
        .eq("id", data.id);
      if (error) throw new Error(error.message);
    }

    // Replace assignments for the roles that were provided.
    const roleMap = [
      ["manager", data.managerId],
      ["director", data.directorId],
      ["executive_director", data.executiveDirectorId],
    ] as const;
    for (const [role, uid] of roleMap) {
      if (uid === undefined) continue;
      await supabase.from("clinic_assignments").delete().eq("clinic_id", data.id).eq("role", role);
      if (uid) {
        const { error } = await supabase
          .from("clinic_assignments")
          .insert({ clinic_id: data.id, user_id: uid, role });
        if (error) throw new Error(error.message);
      }
    }
    return { ok: true };
  });

export const deleteClinic = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) =>
    z.object({ id: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase.from("clinics").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Admin-only guard.
async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin role required");
}
