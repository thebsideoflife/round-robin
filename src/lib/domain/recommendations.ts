import type { Clinic, Round, Task } from "@/data/types";
import { daysBetween, isOpenStatus, isOverdue } from "./time";
import { clinicHealth } from "./health";

export type FocusGroup = "Providers" | "Clinical Staff" | "Front Office Staff";

export interface Recommendation {
  clinic: Clinic;
  score: number;
  reasons: string[];
  focus: FocusGroup;
  focusReason: string;
  health: number;
  band: "green" | "yellow" | "red";
}

const ROLE_TO_FOCUS: Record<string, FocusGroup> = {
  Provider: "Providers",
  "Clinical Staff": "Clinical Staff",
  "Front Office Staff": "Front Office Staff",
};

function focusFor(clinic: Clinic, rounds: Round[]): { focus: FocusGroup; reason: string } {
  const groups: { role: string; focus: FocusGroup }[] = [
    { role: "Provider", focus: "Providers" },
    { role: "Clinical Staff", focus: "Clinical Staff" },
    { role: "Front Office Staff", focus: "Front Office Staff" },
  ];
  let best = groups[0];
  let bestDays = -1;
  let never = false;
  groups.forEach((g) => {
    const last = rounds
      .filter((r) => r.clinicId === clinic.id && r.individualRole === g.role)
      .map((r) => new Date(r.date).getTime())
      .sort((a, b) => b - a)[0];
    const d = last ? daysBetween(new Date(last)) : 999;
    if (d > bestDays) {
      bestDays = d;
      best = g;
      never = !last;
    }
  });
  return {
    focus: best.focus,
    reason: never
      ? `${best.focus} have not been rounded with on record`
      : `${best.focus} not rounded with in ${bestDays} days`,
  };
}

export function recommendations(
  clinics: Clinic[],
  rounds: Round[],
  tasks: Task[],
): Recommendation[] {
  return clinics
    .map((clinic) => {
      const cTasks = tasks.filter((t) => t.clinicId === clinic.id);
      const open = cTasks.filter(isOpenStatus);
      const overdue = cTasks.filter(isOverdue);
      const execEsc = open.filter((t) => t.escalation === "Executive Review");
      const dirEsc = open.filter((t) => t.escalation === "Director Review");
      const aging = open.filter((t) => daysBetween(t.createdAt) > 45);
      const health = clinicHealth(clinic, rounds, tasks);

      const themeCounts = new Map<string, number>();
      cTasks.forEach((t) => themeCounts.set(t.theme, (themeCounts.get(t.theme) ?? 0) + 1));
      const repeated = [...themeCounts.entries()].filter(([, n]) => n >= 3);

      const reasons: string[] = [];
      let score = 0;

      const sinceRound = health.lastRoundDays;
      if (sinceRound === null) {
        score += 40;
        reasons.push("No rounding on record");
      } else {
        score += Math.min(40, Math.round(sinceRound * 0.9));
        reasons.push(`${sinceRound} days since last round`);
      }

      if (open.length) {
        score += Math.min(20, open.length * 2);
        reasons.push(`${open.length} open tasks`);
      }
      if (execEsc.length) {
        score += execEsc.length * 9;
        reasons.push(`${execEsc.length} executive escalation${execEsc.length > 1 ? "s" : ""}`);
      }
      if (dirEsc.length) {
        score += dirEsc.length * 4;
        reasons.push(`${dirEsc.length} director escalation${dirEsc.length > 1 ? "s" : ""}`);
      }
      if (aging.length) {
        score += Math.min(15, aging.length * 4);
        reasons.push(`${aging.length} issues aging past 45 days`);
      }
      if (overdue.length) {
        score += Math.min(12, overdue.length * 3);
        reasons.push(`${overdue.length} overdue tasks`);
      }
      repeated.forEach(([theme, n]) => {
        score += 6;
        reasons.push(`Repeated ${theme.toLowerCase()} concerns (${n})`);
      });
      if (health.band === "red") {
        score += 10;
        reasons.push("Health score in the red band");
      } else if (health.band === "yellow") {
        score += 4;
        reasons.push("Health score declining");
      }

      const f = focusFor(clinic, rounds);
      if (!reasons.includes(f.reason)) reasons.push(f.reason);

      return {
        clinic,
        score: Math.max(1, Math.min(100, Math.round(score))),
        reasons: reasons.slice(0, 5),
        focus: f.focus,
        focusReason: f.reason,
        health: health.score,
        band: health.band,
      };
    })
    .sort((a, b) => b.score - a.score);
}

export interface GroupRecommendation {
  label: string;
  group: FocusGroup;
  clinicName: string;
  clinicId: string;
  daysSince: number | null;
  score: number;
}

export function groupRecommendations(
  clinics: Clinic[],
  rounds: Round[],
  group: "Provider" | "Clinical Staff" | "Front Office Staff",
): GroupRecommendation[] {
  return clinics
    .map((clinic) => {
      const last = rounds
        .filter((r) => r.clinicId === clinic.id && r.individualRole === group)
        .map((r) => new Date(r.date).getTime())
        .sort((a, b) => b - a)[0];
      const days = last ? daysBetween(new Date(last)) : null;
      return {
        label: `${clinic.name} — ${ROLE_TO_FOCUS[group]}`,
        group: ROLE_TO_FOCUS[group],
        clinicName: clinic.name,
        clinicId: clinic.id,
        daysSince: days,
        score: days === null ? 100 : Math.min(100, days * 2),
      };
    })
    .sort((a, b) => b.score - a.score);
}
