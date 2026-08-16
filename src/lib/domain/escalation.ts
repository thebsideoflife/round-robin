import type { EscalationLevel, Task, TaskPriority } from "@/data/types";
import { daysBetween, isOpenStatus } from "./time";
import { DEFAULT_ESCALATION_SETTINGS, type EscalationSettings } from "./policy";

export interface EscalationSuggestion {
  level: EscalationLevel;
  reasons: string[];
}

export interface SuggestionInput {
  priority: TaskPriority;
  safetyRelated: boolean;
  theme: string;
  createdAt: string;
  clinicId: string;
  allTasks: Task[];
  /** Division thresholds. Falls back to the system defaults when absent. */
  settings?: EscalationSettings;
}

export function suggestEscalation(input: SuggestionInput): EscalationSuggestion {
  const reasons: string[] = [];
  let rank = 0; // 0 manager, 1 director, 2 executive

  const cfg = input.settings ?? DEFAULT_ESCALATION_SETTINGS;
  const age = daysBetween(input.createdAt);
  const urgent = input.safetyRelated || input.priority === "Critical";

  // Some themes are handled in another system entirely and shouldn't climb
  // this ladder. Safety always overrides an exclusion.
  if (!input.safetyRelated && cfg.excludedThemes.includes(input.theme)) {
    return {
      level: "Manager Resolve",
      reasons: [`${input.theme} is excluded from automatic escalation for this division`],
    };
  }

  const sameThemeSameClinic = input.allTasks.filter(
    (t) => t.theme === input.theme && t.clinicId === input.clinicId && isOpenStatus(t),
  ).length;
  const clinicsWithTheme = new Set(
    input.allTasks.filter((t) => t.theme === input.theme && isOpenStatus(t)).map((t) => t.clinicId),
  ).size;

  // --- Director Review triggers: manager-level work that stalled or spread ---
  if (age > cfg.directorDays) {
    reasons.push(`Open ${age} days without manager-level resolution`);
    rank = Math.max(rank, 1);
  }
  if (urgent && age > cfg.safetyDirectorDays) {
    reasons.push(
      `${input.safetyRelated ? "Safety concern" : "Critical issue"} still open after ${age} days`,
    );
    rank = Math.max(rank, 1);
  }
  if (sameThemeSameClinic >= cfg.repeatSameClinic) {
    reasons.push(`${input.theme} open ${sameThemeSameClinic} times at this clinic`);
    rank = Math.max(rank, 1);
  }
  if (clinicsWithTheme >= cfg.spreadClinics) {
    reasons.push(`${input.theme} open across ${clinicsWithTheme} clinics`);
    rank = Math.max(rank, 1);
  }

  // --- Executive Review triggers: enterprise-level only ---
  if (urgent && age > cfg.safetyExecutiveDays) {
    reasons.push(
      `${input.safetyRelated ? "Safety concern" : "Critical issue"} unresolved past 60 days`,
    );
    rank = 2;
  }
  if (age > cfg.executiveDays) {
    reasons.push(`Open ${age} days across two escalation tiers`);
    rank = 2;
  }


  if (clinicsWithTheme >= cfg.enterpriseClinics) {
    reasons.push(`Enterprise pattern: ${input.theme} open across ${clinicsWithTheme} clinics`);
    rank = 2;
  }

  if (!reasons.length) {
    reasons.push(
      urgent
        ? `${input.safetyRelated ? "Safety concern" : "Critical issue"} — manager owns immediate follow-up`
        : "New issue — manager resolves before escalation",
    );
  }

  const level: EscalationLevel =
    rank === 2 ? "Executive Review" : rank === 1 ? "Director Review" : "Manager Resolve";
  return { level, reasons };
}

const LADDER: EscalationLevel[] = ["Manager Resolve", "Director Review", "Executive Review"];

/** One tier up from the current level, or null at the top. */
export function nextEscalationLevel(current: EscalationLevel): EscalationLevel | null {
  const i = LADDER.indexOf(current);
  return i < LADDER.length - 1 ? LADDER[i + 1] : null;
}

/** Current level plus one step in either direction — no tier skipping. */
export function allowedEscalationLevels(current: EscalationLevel): EscalationLevel[] {
  const i = LADDER.indexOf(current);
  return LADDER.filter((_, idx) => Math.abs(idx - i) <= 1);
}


export const ALLOWED_NEXT: Record<Task["status"], Task["status"][]> = {
  Open: ["In Progress", "Closed"],
  "In Progress": ["Pending Validation", "Open", "Closed"],
  "Pending Validation": ["Closed", "Reopened", "In Progress"],
  Reopened: ["In Progress", "Closed"],
  Closed: ["Reopened"],
};

export function canTransition(from: Task["status"], to: Task["status"]) {
  return ALLOWED_NEXT[from].includes(to);
}
