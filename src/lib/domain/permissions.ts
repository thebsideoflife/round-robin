import type { AppData, Clinic, EscalationLevel, Person, RoleKey, Round, Task } from "@/data/types";
import { buildOrgGraph, type OrgGraph } from "./org";

// Re-exported so existing call sites keep working; the implementations now
// live in ./time.ts so that org.ts can share them without a circular import.
export { DAY, daysBetween, isOpenStatus, isOverdue, closedOn } from "./time";

/**
 * Clinics the acting person is allowed to see.
 *
 * Resolved through the org graph rather than a per-role field match, so a
 * director still sees a clinic that names one of their managers even if the
 * clinic's own director_id has drifted out of date.
 */
export function visibleClinics(data: AppData, person: Person): Clinic[] {
  return buildOrgGraph(data).clinicsInScope(person);
}

export function directReports(data: AppData, person: Person): Person[] {
  return buildOrgGraph(data).directReports(person.id);
}

/** All people below this person in the hierarchy. */
export function descendants(data: AppData, person: Person): Person[] {
  return buildOrgGraph(data).subtree(person.id);
}

export function managersFor(data: AppData, person: Person): Person[] {
  if (person.role === "manager") return [person];
  return descendants(data, person).filter((p) => p.role === "manager");
}

export interface Scope {
  clinics: Clinic[];
  clinicIds: Set<string>;
  rounds: Round[];
  tasks: Task[];
  managers: Person[];
  /** The org graph for this dataset — shared by every consumer of the scope. */
  graph: OrgGraph;
}

export function buildScope(data: AppData, person: Person): Scope {
  const graph = buildOrgGraph(data);
  const clinics = graph.clinicsInScope(person);
  const clinicIds = new Set(clinics.map((c) => c.id));
  const below = graph.subtree(person.id);
  return {
    clinics,
    clinicIds,
    rounds: data.rounds.filter((r) => clinicIds.has(r.clinicId)),
    tasks: data.tasks.filter((t) => clinicIds.has(t.clinicId)),
    managers:
      person.role === "manager" ? [person] : below.filter((p) => p.role === "manager"),
    graph,
  };
}

export const ESCALATION_ORDER: EscalationLevel[] = [
  "Manager Resolve",
  "Director Review",
  "Executive Review",
];

export function escalationVisibleTo(role: RoleKey, level: EscalationLevel) {
  // Coordinators work the clinic floor alongside their manager, so they see
  // every open item for their clinics, the same as the manager does.
  if (role === "manager" || role === "coordinator") return true;
  if (role === "director") return level !== "Manager Resolve";
  return level === "Executive Review" || level === "Director Review";
}
