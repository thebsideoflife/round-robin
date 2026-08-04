import type { SupabaseClient } from "@supabase/supabase-js";
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

/**
 * The one RLS-scoped read of everything this person may see.
 *
 * Shared by getScope (which feeds the client store) and Robin (which answers
 * questions about it), so the assistant can never see a row the app wouldn't
 * show, and the two can't drift apart.
 */
export async function loadScope(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ currentUser: Person; data: AppData; roles: string[]; isAdmin: boolean }> {

    

    const { data: meRows, error: meErr } = await supabase.rpc("get_me");
    if (meErr) throw new Error(meErr.message);
    const me = (meRows ?? [])[0];
    const roles: string[] = me?.roles ?? [];
    const role = roles.includes("cao")
      ? "cao"
      : roles.includes("executive_director")
        ? "executive_director"
        : roles.includes("director")
          ? "director"
          : roles.includes("admin")
            ? "cao"
            : "manager";

    const currentUser: Person = {
      id: userId,
      name: me?.full_name?.trim() || me?.email?.split("@")[0] || "User",
      title: me?.title || "",
      role: role as Person["role"],
    };

    const { data: clinicRows, error: cErr } = await supabase
      .from("clinics")
      .select("id, name, specialty, location, region, division, provider_count, staff_count");
    if (cErr) throw new Error(cErr.message);
    if (!clinicRows?.length) {
      console.info(
        `[getScope] no clinics visible to ${userId} (roles: ${roles.join(",") || "none"}). ` +
          "Either the workspace is empty or this account has no clinic assignments.",
      );
    }
    const clinics = (clinicRows ?? []) as ClinicRow[];
    const clinicIds = clinics.map((c) => c.id);

    const { data: assignmentRows } = await supabase
      .from("clinic_assignments")
      .select("clinic_id, user_id, role")
      .in("clinic_id", clinicIds.length ? clinicIds : ["00000000-0000-0000-0000-000000000000"]);
    const assignments = (assignmentRows ?? []) as AssignmentRow[];

    // Gather every user that appears in this scope.
    const userIdSet = new Set<string>([userId]);
    for (const a of assignments) userIdSet.add(a.user_id);
    const userIds = [...userIdSet];

    // People + roles through the *user-scoped* client. RLS handles the
    // filtering: "Scope read profiles" and "Scope read user_roles" both allow
    // reads for anyone you share a clinic with or supervise.
    //
    // This deliberately does NOT use the service-role client. RLS is the
    // authorization boundary, and reaching for service-role on a read path
    // made the entire store fail to load rather than degrade.
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, full_name, title")
      .in("user_id", userIds);
    const { data: roleRows } = await supabase
      .from("user_roles")
      .select("user_id, role")
      .in("user_id", userIds);

    const people = mapPeople(
      userIds,
      (profiles ?? []) as ProfileRow[],
      (roleRows ?? []) as RoleRow[],
      assignments,
    );

    const { data: roundRows, error: rErr } = await supabase
      .from("rounds")
      .select(
        "id, clinic_id, leader_id, round_date, status, individual, individual_role, notes, answers, themes, safety_flag, ai_summary, created_at, round_wins(win_text, recognized_person, category)",
      )
      .in("clinic_id", clinicIds.length ? clinicIds : ["00000000-0000-0000-0000-000000000000"])
      .order("round_date", { ascending: false });
    if (rErr) throw new Error(rErr.message);
    const rounds = ((roundRows ?? []) as RoundRow[]).map(mapRound);

    const { data: taskRows, error: tErr } = await supabase
      .from("tasks")
      .select(
        "id, clinic_id, source, source_id, report_id, name, description, theme, owner_id, due_date, status, escalation_level, priority, safety_related, closed_at, created_at",
      )
      .in("clinic_id", clinicIds.length ? clinicIds : ["00000000-0000-0000-0000-000000000000"]);
    if (tErr) throw new Error(tErr.message);
    const tasks = ((taskRows ?? []) as TaskRow[]).map(mapTask);

    const data: AppData = {
      people,
      clinics: mapClinics(clinics, assignments),
      rounds,
      tasks,
    };

    return { currentUser, data, roles, isAdmin: roles.includes("admin") };
}
