/**
 * Org graph — the single source of truth for "who sees what" and
 * "who does this belong to".
 *
 * The app has two directions of travel and they used to be tangled together
 * across permissions.ts, escalation.ts and four separate dashboard components:
 *
 *   TOP-DOWN   a leader looks at their org, sees rolled-up numbers per direct
 *              report, and drills into any branch. Accountability flows down.
 *
 *   BOTTOM-UP  an issue found while rounding is owned by the manager, and if it
 *              cannot be resolved there it routes to the named director, then
 *              the named executive director for that specific clinic.
 *              Escalation flows up a real chain of people, not a label.
 *
 * Both directions read from one graph built once per scope load.
 */
import type {
  AppData,
  Clinic,
  EscalationLevel,
  Person,
  RoleKey,
  Round,
  Task,
} from "@/data/types";
import { daysBetween, isOpenStatus, isOverdue } from "./time";
import { bandFor, clinicHealth } from "./health";

export const ROLE_RANK: Record<RoleKey, number> = {
  manager: 0,
  director: 1,
  executive_director: 2,
  cao: 3,
};

/** Which clinic field names the accountable person at each escalation tier. */
const TIER_OWNER_FIELD: Record<EscalationLevel, keyof Clinic> = {
  "Manager Resolve": "managerId",
  "Director Review": "directorId",
  "Executive Review": "executiveDirectorId",
};

const TIER_ROLE: Record<EscalationLevel, RoleKey> = {
  "Manager Resolve": "manager",
  "Director Review": "director",
  "Executive Review": "executive_director",
};

export interface OrgGraph {
  people: Person[];
  clinics: Clinic[];
  person: (id: string | undefined) => Person | undefined;
  clinic: (id: string | undefined) => Clinic | undefined;
  /** People who report directly to this person, highest role first. */
  directReports: (id: string) => Person[];
  /** Everyone underneath this person, at any depth. */
  subtree: (id: string) => Person[];
  /** The chain of people above this person, nearest first. */
  chainUp: (id: string) => Person[];
  /** Clinics this person is personally named on, at their own tier. */
  clinicsOwnedBy: (person: Person) => Clinic[];
  /** Clinics this person can see: their own plus everything below them. */
  clinicsInScope: (person: Person) => Clinic[];
}

/**
 * Graphs are rebuilt whenever the dataset object identity changes. The store
 * loads AppData once per query, so in practice this is built once per fetch
 * even though several call sites ask for it independently.
 */
const graphCache = new WeakMap<AppData, OrgGraph>();

export function buildOrgGraph(data: AppData): OrgGraph {
  const cached = graphCache.get(data);
  if (cached) return cached;
  const graph = buildOrgGraphUncached(data);
  graphCache.set(data, graph);
  return graph;
}

function buildOrgGraphUncached(data: AppData): OrgGraph {
  const peopleById = new Map(data.people.map((p) => [p.id, p]));
  const clinicsById = new Map(data.clinics.map((c) => [c.id, c]));

  const childrenById = new Map<string, Person[]>();
  for (const p of data.people) {
    if (!p.managerId) continue;
    const list = childrenById.get(p.managerId);
    if (list) list.push(p);
    else childrenById.set(p.managerId, [p]);
  }
  for (const list of childrenById.values()) {
    list.sort(
      (a, b) => ROLE_RANK[b.role] - ROLE_RANK[a.role] || a.name.localeCompare(b.name),
    );
  }

  const subtreeCache = new Map<string, Person[]>();
  const subtree = (id: string): Person[] => {
    const cached = subtreeCache.get(id);
    if (cached) return cached;
    const out: Person[] = [];
    const seen = new Set<string>([id]); // guards against a cyclic managerId
    const stack = [...(childrenById.get(id) ?? [])];
    while (stack.length) {
      const next = stack.pop()!;
      if (seen.has(next.id)) continue;
      seen.add(next.id);
      out.push(next);
      stack.push(...(childrenById.get(next.id) ?? []));
    }
    subtreeCache.set(id, out);
    return out;
  };

  const chainUp = (id: string): Person[] => {
    const out: Person[] = [];
    const seen = new Set<string>([id]);
    let cur = peopleById.get(id);
    while (cur?.managerId && !seen.has(cur.managerId)) {
      seen.add(cur.managerId);
      const parent = peopleById.get(cur.managerId);
      if (!parent) break;
      out.push(parent);
      cur = parent;
    }
    return out;
  };

  const clinicsOwnedBy = (person: Person): Clinic[] => {
    if (person.role === "cao") return data.clinics;
    const field = (
      person.role === "manager"
        ? "managerId"
        : person.role === "director"
          ? "directorId"
          : "executiveDirectorId"
    ) as keyof Clinic;
    return data.clinics.filter((c) => c[field] === person.id);
  };

  const clinicsInScope = (person: Person): Clinic[] => {
    if (person.role === "cao") return data.clinics;
    const ids = new Set<string>([person.id, ...subtree(person.id).map((p) => p.id)]);
    return data.clinics.filter(
      (c) => ids.has(c.managerId) || ids.has(c.directorId) || ids.has(c.executiveDirectorId),
    );
  };

  return {
    people: data.people,
    clinics: data.clinics,
    person: (id) => (id ? peopleById.get(id) : undefined),
    clinic: (id) => (id ? clinicsById.get(id) : undefined),
    directReports: (id) => childrenById.get(id) ?? [],
    subtree,
    chainUp,
    clinicsOwnedBy,
    clinicsInScope,
  };
}

/* ------------------------------------------------------------------ */
/* TOP-DOWN: rollup and drilldown                                      */
/* ------------------------------------------------------------------ */

export interface RollupMetrics {
  clinicCount: number;
  rounds30: number;
  /** Clinics with no round in the last 30 days. */
  roundingGaps: number;
  openTasks: number;
  overdueTasks: number;
  escalatedTasks: number;
  safetyTasks: number;
  closedRate: number;
  avgHealth: number;
  band: "green" | "yellow" | "red";
  lastRoundDays: number | null;
}

export function metricsFor(clinics: Clinic[], rounds: Round[], tasks: Task[]): RollupMetrics {
  const clinicIds = new Set(clinics.map((c) => c.id));
  const scopedRounds = rounds.filter((r) => clinicIds.has(r.clinicId));
  const scopedTasks = tasks.filter((t) => clinicIds.has(t.clinicId));
  const open = scopedTasks.filter(isOpenStatus);

  const rounds30 = scopedRounds.filter((r) => daysBetween(r.date) <= 30);
  const roundedRecently = new Set(rounds30.map((r) => r.clinicId));

  const healths = clinics.map((c) => clinicHealth(c, scopedRounds, scopedTasks).score);
  const avgHealth = healths.length
    ? Math.round(healths.reduce((a, b) => a + b, 0) / healths.length)
    : 0;

  const lastRoundDays = scopedRounds.length
    ? Math.min(...scopedRounds.map((r) => daysBetween(r.date)))
    : null;

  return {
    clinicCount: clinics.length,
    rounds30: rounds30.length,
    roundingGaps: clinics.filter((c) => !roundedRecently.has(c.id)).length,
    openTasks: open.length,
    overdueTasks: scopedTasks.filter(isOverdue).length,
    escalatedTasks: open.filter((t) => t.escalation !== "Manager Resolve").length,
    safetyTasks: open.filter((t) => t.safetyRelated).length,
    closedRate: scopedTasks.length
      ? scopedTasks.filter((t) => t.status === "Closed").length / scopedTasks.length
      : 1,
    avgHealth,
    band: healths.length ? bandFor(avgHealth) : "green",
    lastRoundDays,
  };
}

export interface OrgBranch {
  person: Person;
  /** Rolled-up numbers for this person and everyone below them. */
  metrics: RollupMetrics;
  clinics: Clinic[];
  /** True when this branch has people beneath it worth drilling into. */
  hasChildren: boolean;
}

/**
 * One level of the org, from `person` downward. Feeds the drilldown table:
 * a CAO sees executive directors, clicks one, sees their directors, and so on
 * until they reach managers and then individual clinics.
 */
export function branchesUnder(
  graph: OrgGraph,
  person: Person,
  rounds: Round[],
  tasks: Task[],
): OrgBranch[] {
  return graph
    .directReports(person.id)
    .map((child) => {
      const clinics = graph.clinicsInScope(child);
      return {
        person: child,
        clinics,
        metrics: metricsFor(clinics, rounds, tasks),
        hasChildren: graph.directReports(child.id).length > 0,
      };
    })
    .sort((a, b) => a.metrics.avgHealth - b.metrics.avgHealth);
}

/* ------------------------------------------------------------------ */
/* BOTTOM-UP: ownership and escalation routing                         */
/* ------------------------------------------------------------------ */

export interface EscalationStop {
  level: EscalationLevel;
  person?: Person;
  /** Whether the issue has actually reached this tier yet. */
  reached: boolean;
  /** Whether this is where the issue currently sits. */
  current: boolean;
}

const LADDER: EscalationLevel[] = [
  "Manager Resolve",
  "Director Review",
  "Executive Review",
];

/** The named person accountable for a task at a given tier. */
export function ownerAtLevel(
  graph: OrgGraph,
  task: Task,
  level: EscalationLevel,
): Person | undefined {
  const clinic = graph.clinic(task.clinicId);
  if (!clinic) return undefined;
  const direct = graph.person(clinic[TIER_OWNER_FIELD[level]] as string);
  if (direct) return direct;
  // Fall back to the nearest person of the right role above the manager.
  const wanted = TIER_ROLE[level];
  return graph.chainUp(clinic.managerId).find((p) => p.role === wanted);
}

/**
 * The full escalation path for one issue: who owns it now, who it goes to next,
 * and who it has already passed through. This is what the task detail screen
 * renders instead of a bare "Director Review" label.
 */
export function escalationPath(graph: OrgGraph, task: Task): EscalationStop[] {
  const currentIndex = LADDER.indexOf(task.escalation);
  return LADDER.map((level, i) => ({
    level,
    person: ownerAtLevel(graph, task, level),
    reached: i <= currentIndex,
    current: i === currentIndex,
  }));
}

export interface AssignmentCandidate {
  person: Person;
  /** Why this person is offered, e.g. "Manager · Cardiology North". */
  reason: string;
  /** Recommended default for the task's current escalation tier. */
  recommended: boolean;
}

/**
 * Who a task at this clinic can be assigned to, ordered so the accountable
 * person for the current tier is first. Replaces the old free-form owner
 * picker that listed every person in scope with no ranking.
 */
export function assignmentCandidates(
  graph: OrgGraph,
  clinicId: string,
  level: EscalationLevel = "Manager Resolve",
): AssignmentCandidate[] {
  const clinic = graph.clinic(clinicId);
  if (!clinic) return [];

  const recommendedId = clinic[TIER_OWNER_FIELD[level]] as string | undefined;
  const seen = new Set<string>();
  const out: AssignmentCandidate[] = [];

  const push = (id: string | undefined, reason: string) => {
    if (!id || seen.has(id)) return;
    const person = graph.person(id);
    if (!person) return;
    seen.add(id);
    out.push({ person, reason, recommended: id === recommendedId });
  };

  push(clinic.managerId, `Manager · ${clinic.name}`);
  push(clinic.directorId, `Director · ${clinic.division ?? "division"}`);
  push(clinic.executiveDirectorId, `Executive Director · ${clinic.region ?? "region"}`);
  for (const p of graph.chainUp(clinic.managerId)) {
    push(p.id, `${p.title || p.role} · escalation chain`);
  }

  return out.sort((a, b) => Number(b.recommended) - Number(a.recommended));
}

/** True when the acting person is allowed to change ownership or tier. */
export function canReassign(actor: Person, task: Task, graph: OrgGraph): boolean {
  if (actor.role === "cao") return true;
  const clinic = graph.clinic(task.clinicId);
  if (!clinic) return false;
  const ids = new Set([actor.id, ...graph.subtree(actor.id).map((p) => p.id)]);
  return (
    ids.has(clinic.managerId) || ids.has(clinic.directorId) || ids.has(clinic.executiveDirectorId)
  );
}
