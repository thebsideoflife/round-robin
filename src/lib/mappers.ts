// Maps database rows to the UI domain types in src/data/types.ts so the existing
// dashboards and domain logic (health, escalation, recommendations) work
// unchanged against real data. Imported only by server functions.
import type {
  Clinic,
  EscalationLevel,
  Person,
  RoleKey,
  Round,
  RoundAnswers,
  RoundedRole,
  Task,
  TaskPriority,
  TaskStatus,
  WinCategory,
} from "@/data/types";

export interface ClinicRow {
  id: string;
  name: string;
  specialty: string | null;
  location: string | null;
  region: string | null;
  division: string | null;
  provider_count: number | null;
  staff_count: number | null;
}

export interface AssignmentRow {
  clinic_id: string;
  user_id: string;
  role: "coordinator" | "manager" | "director" | "executive_director";
}

export interface ProfileRow {
  user_id: string;
  full_name: string | null;
  title: string | null;
}

export interface RoleRow {
  user_id: string;
  role: string;
}

const ROLE_RANK: Record<string, RoleKey> = {
  cao: "cao",
  executive_director: "executive_director",
  director: "director",
  manager: "manager",
  coordinator: "coordinator",
};

function primaryRole(roles: string[]): RoleKey {
  for (const r of ["cao", "executive_director", "director", "manager", "coordinator"]) {
    if (roles.includes(r)) return ROLE_RANK[r];
  }
  return "manager";
}

export function mapPeople(
  userIds: string[],
  profiles: ProfileRow[],
  roleRows: RoleRow[],
  assignments: AssignmentRow[],
): Person[] {
  const profileMap = new Map(profiles.map((p) => [p.user_id, p]));
  const rolesByUser = new Map<string, string[]>();
  for (const r of roleRows) {
    const arr = rolesByUser.get(r.user_id);
    if (arr) arr.push(r.role);
    else rolesByUser.set(r.user_id, [r.role]);
  }

  // managerId: a coordinator reports to the manager co-assigned to one of their
  // clinics; a manager reports to the director co-assigned to one of theirs; a
  // director reports to the executive co-assigned to one of theirs.
  const managerForCoordinator = new Map<string, string>();
  const directorForManager = new Map<string, string>();
  const execForDirector = new Map<string, string>();
  for (const a of assignments) {
    if (a.role === "coordinator") {
      const mgr = assignments.find(
        (x) => x.clinic_id === a.clinic_id && x.role === "manager",
      );
      if (mgr && !managerForCoordinator.has(a.user_id))
        managerForCoordinator.set(a.user_id, mgr.user_id);
    }
    if (a.role === "manager") {
      const dir = assignments.find(
        (x) => x.clinic_id === a.clinic_id && x.role === "director",
      );
      if (dir && !directorForManager.has(a.user_id))
        directorForManager.set(a.user_id, dir.user_id);
    }
    if (a.role === "director") {
      const exec = assignments.find(
        (x) => x.clinic_id === a.clinic_id && x.role === "executive_director",
      );
      if (exec && !execForDirector.has(a.user_id))
        execForDirector.set(a.user_id, exec.user_id);
    }
  }

  return userIds.map((id) => {
    const p = profileMap.get(id);
    const roles = rolesByUser.get(id) ?? [];
    const role = primaryRole(roles);
    const name = p?.full_name?.trim() || p?.user_id.slice(0, 8) || "Unknown";
    return {
      id,
      name,
      title: p?.title || roleLabel(role),
      role,
      managerId:
        role === "coordinator"
          ? managerForCoordinator.get(id)
          : role === "manager"
          ? directorForManager.get(id)
          : role === "director"
            ? execForDirector.get(id)
            : undefined,
    } satisfies Person;
  });
}

function roleLabel(role: RoleKey) {
  switch (role) {
    case "cao":
      return "Chief Ambulatory Officer";
    case "executive_director":
      return "Executive Director";
    case "director":
      return "Director";
    case "manager":
      return "Manager";
    case "coordinator":
      return "Office Coordinator";
  }
}

export function mapClinics(
  rows: ClinicRow[],
  assignments: AssignmentRow[],
): Clinic[] {
  return rows.map((r) => {
    const find = (role: AssignmentRow["role"]) =>
      assignments.find((a) => a.clinic_id === r.id && a.role === role)?.user_id;
    return {
      id: r.id,
      name: r.name,
      specialty: r.specialty ?? "",
      site: r.location ?? "",
      region: r.region ?? "",
      division: r.division ?? "",
      coordinatorId: find("coordinator"),
      managerId: find("manager") ?? "",
      directorId: find("director") ?? "",
      executiveDirectorId: find("executive_director") ?? "",
      providerCount: r.provider_count ?? 0,
      staffCount: r.staff_count ?? 0,
    } satisfies Clinic;
  });
}

const STATUS_MAP: Record<string, TaskStatus> = {
  open: "Open",
  in_progress: "In Progress",
  pending_validation: "Pending Validation",
  closed: "Closed",
  reopened: "Reopened",
};
const ESC_MAP: Record<string, EscalationLevel> = {
  manager: "Manager Resolve",
  director: "Director Review",
  executive: "Executive Review",
};
const PRIO_MAP: Record<string, TaskPriority> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

export interface TaskRow {
  id: string;
  clinic_id: string;
  source: string;
  source_id: string | null;
  report_id?: string | null;
  name: string;
  description: string | null;
  theme: string;
  owner_id: string | null;
  due_date: string | null;
  status: string;
  escalation_level: string;
  priority: string;
  safety_related: boolean | null;
  closed_at: string | null;
  closed_by?: string | null;
  validated_by?: string | null;
  validated_at?: string | null;
  department_id?: string | null;
  assignment_note?: string | null;
  created_at: string;
}

export function mapTask(r: TaskRow): Task {
  return {
    id: r.id,
    title: r.name,
    description: r.description ?? "",
    clinicId: r.clinic_id,
    roundId: r.source === "round_finding" ? r.source_id ?? undefined : undefined,
    source: r.source,
    reportId: r.report_id ?? undefined,
    ownerId: r.owner_id ?? "",
    priority: PRIO_MAP[r.priority] ?? "Medium",
    dueDate: r.due_date ? new Date(r.due_date).toISOString() : "",
    status: STATUS_MAP[r.status] ?? "Open",
    escalation: ESC_MAP[r.escalation_level] ?? "Manager Resolve",
    theme: r.theme,
    safetyRelated: !!r.safety_related,
    createdAt: r.created_at,
    closedAt: r.closed_at ?? undefined,
    closedBy: r.closed_by ?? undefined,
    validatedBy: r.validated_by ?? undefined,
    validatedAt: r.validated_at ?? undefined,
    departmentId: r.department_id ?? undefined,
    assignmentNote: r.assignment_note ?? undefined,
    validationHistory: [],
  };
}

export interface RoundRow {
  id: string;
  clinic_id: string;
  leader_id: string;
  round_date: string;
  status: string;
  individual: string | null;
  individual_role: string | null;
  notes: string | null;
  answers: Record<string, string> | null;
  themes: string[] | null;
  safety_flag: boolean | null;
  ai_summary: string | null;
  created_at: string;
  round_wins: { win_text: string; recognized_person: string | null; category: string | null }[];
}

function mapRole(r: string | null): RoundedRole {
  if (r === "Provider") return "Provider";
  if (r === "Clinical Staff") return "Clinical Staff";
  if (r === "Front Office Staff") return "Front Office Staff";
  return "Clinical Staff";
}

export function mapRound(r: RoundRow): Round {
  const a: RoundAnswers = {
    workingWell: r.answers?.workingWell ?? "",
    barriers: r.answers?.barriers ?? "",
    accessChallenges: r.answers?.accessChallenges ?? "",
    workflowConcerns: r.answers?.workflowConcerns ?? "",
    safetyConcerns: r.answers?.safetyConcerns ?? "",
    leadershipSupport: r.answers?.leadershipSupport ?? "",
    additionalComments: r.answers?.additionalComments ?? "",
  };
  const win = r.round_wins?.[0];
  return {
    id: r.id,
    clinicId: r.clinic_id,
    date: r.round_date,
    managerId: r.leader_id,
    individual: r.individual ?? "",
    individualRole: mapRole(r.individual_role),
    notes: r.notes ?? "",
    answers: a,
    themes: r.themes ?? [],
    safetyFlag: !!r.safety_flag,
    win: win
      ? {
          text: win.win_text,
          recognized: win.recognized_person ?? undefined,
          category: (win.category as WinCategory) ?? "Recognition",
        }
      : undefined,
  };
}

// Reverse maps for writing ------------------------------------------------

export function taskStatusToDb(s: TaskStatus): string {
  return (
    {
      Open: "open",
      "In Progress": "in_progress",
      "Pending Validation": "pending_validation",
      Closed: "closed",
      Reopened: "reopened",
    } as Record<TaskStatus, string>
  )[s];
}

export function escalationToDb(e: EscalationLevel): string {
  return (
    {
      "Manager Resolve": "manager",
      "Director Review": "director",
      "Executive Review": "executive",
    } as Record<EscalationLevel, string>
  )[e];
}

export function priorityToDb(p: TaskPriority): string {
  return (
    {
      Low: "low",
      Medium: "medium",
      High: "high",
      Critical: "critical",
    } as Record<TaskPriority, string>
  )[p];
}
