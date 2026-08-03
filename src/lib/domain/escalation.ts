import type { EscalationLevel, Task, TaskPriority } from "@/data/types";
import { daysBetween, isOpenStatus } from "./time";

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
}

export function suggestEscalation(input: SuggestionInput): EscalationSuggestion {
  const reasons: string[] = [];
  let rank = 0; // 0 manager, 1 director, 2 executive

  const age = daysBetween(input.createdAt);
  const urgent = input.safetyRelated || input.priority === "Critical";

  const sameThemeSameClinic = input.allTasks.filter(
    (t) => t.theme === input.theme && t.clinicId === input.clinicId && isOpenStatus(t),
  ).length;
  const clinicsWithTheme = new Set(
    input.allTasks.filter((t) => t.theme === input.theme && isOpenStatus(t)).map((t) => t.clinicId),
  ).size;

  // --- Director Review triggers: manager-level work that stalled or spread ---
  if (age > 45) {
    reasons.push(`Open ${age} days without manager-level resolution`);
    rank = Math.max(rank, 1);
  }
  if (urgent && age > 21) {
    reasons.push(
      `${input.safetyRelated ? "Safety concern" : "Critical issue"} still open after ${age} days`,
    );
    rank = Math.max(rank, 1);
  }
  if (sameThemeSameClinic >= 3) {
    reasons.push(`${input.theme} open ${sameThemeSameClinic} times at this clinic`);
    rank = Math.max(rank, 1);
  }
  if (clinicsWithTheme >= 3) {
    reasons.push(`${input.theme} open across ${clinicsWithTheme} clinics`);
    rank = Math.max(rank, 1);
  }

  // --- Executive Review triggers: enterprise-level only ---
  if (urgent && age > 60) {
    reasons.push(
      `${input.safetyRelated ? "Safety concern" : "Critical issue"} unresolved past 60 days`,
    );
    rank = 2;
  }
  if (age > 100) {
    reasons.push(`Open ${age} days across two escalation tiers`);
    rank = 2;
  }


  if (clinicsWithTheme >= 6) {
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
