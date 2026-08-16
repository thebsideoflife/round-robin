import type { EscalationLevel, RoleKey, TaskPriority } from "@/data/types";

/**
 * Organisational policy in one place.
 *
 * These are business decisions, not implementation details, so they live
 * together rather than scattered through the composer and the task screens.
 * Anything here that becomes contentious is a candidate for the per-division
 * settings table.
 */

/**
 * How long someone has, by priority. Agreed with the team:
 * critical is a this-week problem, low priority is a this-month problem.
 */
export const DUE_DAYS_BY_PRIORITY: Record<TaskPriority, number> = {
  Critical: 3,
  High: 7,
  Medium: 14,
  Low: 30,
};

export function defaultDueDays(priority: TaskPriority): number {
  return DUE_DAYS_BY_PRIORITY[priority] ?? 14;
}

export function defaultDueDate(priority: TaskPriority, from: Date = new Date()): Date {
  return new Date(from.getTime() + defaultDueDays(priority) * 86400000);
}

/**
 * Who may mark something Critical.
 *
 * Restricted to manager and above because Critical shortens the clock to three
 * days and pulls the item to the top of everyone's list — it only works as a
 * signal if it stays scarce.
 */
export function canSetCritical(role: RoleKey): boolean {
  return role === "manager" || role === "director" || role === "executive_director" || role === "cao";
}

export function allowedPriorities(role: RoleKey): TaskPriority[] {
  const all: TaskPriority[] = ["Low", "Medium", "High", "Critical"];
  return canSetCritical(role) ? all : all.filter((p) => p !== "Critical");
}

/* ------------------------------------------------------------------ */
/* Escalation settings                                                 */
/* ------------------------------------------------------------------ */

/**
 * Thresholds that decide when an issue moves up a tier.
 *
 * Previously hardcoded. Now loaded per division so an Executive Director can
 * tune their own area — a division running 60-day cycles shouldn't inherit a
 * 45-day escalation built for someone else.
 */
export interface EscalationSettings {
  division: string | null;
  directorDays: number;
  executiveDays: number;
  safetyDirectorDays: number;
  safetyExecutiveDays: number;
  repeatSameClinic: number;
  spreadClinics: number;
  enterpriseClinics: number;
  excludedThemes: string[];
}

export const DEFAULT_ESCALATION_SETTINGS: EscalationSettings = {
  division: null,
  directorDays: 45,
  executiveDays: 100,
  safetyDirectorDays: 21,
  safetyExecutiveDays: 60,
  repeatSameClinic: 3,
  spreadClinics: 3,
  enterpriseClinics: 6,
  excludedThemes: [],
};

/** The division's settings, falling back to the system default. */
export function settingsFor(
  all: EscalationSettings[],
  division: string | null | undefined,
): EscalationSettings {
  const forDivision = division ? all.find((s) => s.division === division) : undefined;
  return forDivision ?? all.find((s) => s.division === null) ?? DEFAULT_ESCALATION_SETTINGS;
}

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

/**
 * Closing is a claim, not a conclusion.
 *
 * The owner marks the work done and the item moves to Pending validation,
 * where it stays visible — including in the next round at that clinic — until
 * somebody confirms it. Confirmation can happen any time; it doesn't have to
 * wait for a formal round.
 */
export const VALIDATION_COPY = {
  closeAction: "Mark as done",
  closeHint: "It stays on the list until someone confirms it.",
  awaiting: "Waiting for confirmation",
  confirmAction: "Confirm it's fixed",
  rejectAction: "Still a problem",
} as const;

/**
 * How long the person who closed an item must wait before confirming it
 * themselves.
 *
 * Anyone else can confirm immediately. This window exists so single-manager
 * clinics — where nobody else realistically inspects the work — don't strand
 * items in Pending validation forever, while still giving a second pair of
 * eyes a genuine chance first.
 */
export const SELF_VALIDATION_WAIT_DAYS = 15;

export interface ValidationRight {
  allowed: boolean;
  /** Set when the viewer is the closer and still inside the waiting period. */
  waitDaysRemaining?: number;
  reason?: string;
}

/** Whether this person may confirm, and if not, why not. */
export function canValidate(
  task: { closedBy?: string; closedAt?: string },
  viewerId: string,
  now: Date = new Date(),
): ValidationRight {
  if (!task.closedBy) return { allowed: false, reason: "Nothing to confirm yet." };
  if (task.closedBy !== viewerId) return { allowed: true };

  const closedAt = task.closedAt ? new Date(task.closedAt) : now;
  const daysWaited = Math.floor((now.getTime() - closedAt.getTime()) / 86400000);
  const remaining = SELF_VALIDATION_WAIT_DAYS - daysWaited;
  if (remaining <= 0) return { allowed: true };

  return {
    allowed: false,
    waitDaysRemaining: remaining,
    reason: `You closed this. Someone else can confirm it now, or you can in ${remaining} day${remaining === 1 ? "" : "s"}.`,
  };
}

/** Escalation tiers in order, for anything that needs to walk them. */
export const TIERS: EscalationLevel[] = [
  "Manager Resolve",
  "Director Review",
  "Executive Review",
];
