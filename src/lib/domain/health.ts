import type { Clinic, Round, Task } from "@/data/types";
import { daysBetween, isOpenStatus, isOverdue } from "./time";

export interface HealthBreakdown {
  score: number;
  band: "green" | "yellow" | "red";
  factors: { label: string; delta: number }[];
  lastRoundDays: number | null;
  openTasks: number;
  overdueTasks: number;
  resolutionRate: number;
}

export function bandFor(score: number): "green" | "yellow" | "red" {
  if (score >= 80) return "green";
  if (score >= 60) return "yellow";
  return "red";
}

export function clinicHealth(clinic: Clinic, rounds: Round[], tasks: Task[]): HealthBreakdown {
  const cRounds = rounds.filter((r) => r.clinicId === clinic.id);
  const cTasks = tasks.filter((t) => t.clinicId === clinic.id);

  const lastRound = cRounds
    .map((r) => new Date(r.date).getTime())
    .sort((a, b) => b - a)[0];
  const lastRoundDays = lastRound ? daysBetween(new Date(lastRound)) : null;

  const open = cTasks.filter(isOpenStatus);
  const closed = cTasks.filter((t) => t.status === "Closed");
  const overdue = cTasks.filter(isOverdue);
  const execEsc = open.filter((t) => t.escalation === "Executive Review");
  const dirEsc = open.filter((t) => t.escalation === "Director Review");
  const aging = open.filter((t) => daysBetween(t.createdAt) > 45);
  const resolutionRate = cTasks.length ? closed.length / cTasks.length : 1;

  const themeCounts = new Map<string, number>();
  cTasks.forEach((t) => themeCounts.set(t.theme, (themeCounts.get(t.theme) ?? 0) + 1));
  const repeats = [...themeCounts.values()].filter((n) => n >= 3).length;

  const factors: { label: string; delta: number }[] = [];
  let score = 70;

  if (lastRoundDays === null) {
    factors.push({ label: "No rounding on record", delta: -25 });
    score -= 25;
  } else if (lastRoundDays <= 14) {
    factors.push({ label: `Rounded ${lastRoundDays}d ago`, delta: +14 });
    score += 14;
  } else if (lastRoundDays <= 30) {
    factors.push({ label: `Rounded ${lastRoundDays}d ago`, delta: +4 });
    score += 4;
  } else {
    const penalty = Math.min(24, Math.round((lastRoundDays - 30) / 2) + 6);
    factors.push({ label: `${lastRoundDays} days since last round`, delta: -penalty });
    score -= penalty;
  }

  const resDelta = Math.round((resolutionRate - 0.5) * 30);
  factors.push({
    label: `${Math.round(resolutionRate * 100)}% task resolution rate`,
    delta: resDelta,
  });
  score += resDelta;

  if (overdue.length) {
    const d = -Math.min(20, overdue.length * 4);
    factors.push({ label: `${overdue.length} overdue tasks`, delta: d });
    score += d;
  }
  if (execEsc.length) {
    const d = -Math.min(18, execEsc.length * 6);
    factors.push({ label: `${execEsc.length} executive escalations`, delta: d });
    score += d;
  }
  if (dirEsc.length) {
    const d = -Math.min(10, dirEsc.length * 2);
    factors.push({ label: `${dirEsc.length} director escalations`, delta: d });
    score += d;
  }
  if (aging.length) {
    const d = -Math.min(12, aging.length * 3);
    factors.push({ label: `${aging.length} issues aging past 45 days`, delta: d });
    score += d;
  }
  if (repeats) {
    const d = -repeats * 4;
    factors.push({ label: `${repeats} repeated concern themes`, delta: d });
    score += d;
  }
  if (open.length === 0 && cTasks.length > 0) {
    factors.push({ label: "No open issues", delta: +8 });
    score += 8;
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  return {
    score,
    band: bandFor(score),
    factors,
    lastRoundDays,
    openTasks: open.length,
    overdueTasks: overdue.length,
    resolutionRate,
  };
}
