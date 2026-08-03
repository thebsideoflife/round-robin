import type { Clinic, Round, Task } from "@/data/types";
import { daysBetween, isOpenStatus, isOverdue } from "./time";

export interface ThemeTrend {
  theme: string;
  mentions: number;
  clinics: number;
  clinicNames: string[];
  openTasks: number;
  executiveEscalations: number;
  statement: string;
}

export function themeTrends(
  clinics: Clinic[],
  rounds: Round[],
  tasks: Task[],
  windowDays = 30,
): ThemeTrend[] {
  const clinicName = new Map(clinics.map((c) => [c.id, c.name]));
  const byTheme = new Map<string, { mentions: number; clinics: Set<string>; open: number; exec: number }>();

  const bump = (theme: string, clinicId: string, open = false, exec = false) => {
    const cur = byTheme.get(theme) ?? { mentions: 0, clinics: new Set<string>(), open: 0, exec: 0 };
    cur.mentions += 1;
    cur.clinics.add(clinicId);
    if (open) cur.open += 1;
    if (exec) cur.exec += 1;
    byTheme.set(theme, cur);
  };

  rounds
    .filter((r) => daysBetween(r.date) <= windowDays)
    .forEach((r) => r.themes.forEach((t) => bump(t, r.clinicId)));

  tasks
    .filter((t) => daysBetween(t.createdAt) <= windowDays)
    .forEach((t) => bump(t.theme, t.clinicId, isOpenStatus(t), t.escalation === "Executive Review"));

  return [...byTheme.entries()]
    .map(([theme, v]) => ({
      theme,
      mentions: v.mentions,
      clinics: v.clinics.size,
      clinicNames: [...v.clinics].map((id) => clinicName.get(id) ?? id),
      openTasks: v.open,
      executiveEscalations: v.exec,
      statement: `${theme} has been mentioned ${v.mentions} times across ${v.clinics.size} clinic${
        v.clinics.size === 1 ? "" : "s"
      } in the last ${windowDays} days.`,
    }))
    .sort((a, b) => b.mentions - a.mentions);
}

export interface EngagementRow {
  managerId: string;
  managerName: string;
  clinicsAssigned: number;
  clinicsRounded30: number;
  rounds30: number;
  openTasks: number;
  overdueTasks: number;
  engagementScore: number;
}

export function engagement(
  managers: { id: string; name: string }[],
  clinics: Clinic[],
  rounds: Round[],
  tasks: Task[],
): EngagementRow[] {
  return managers
    .map((m) => {
      const mClinics = clinics.filter((c) => c.managerId === m.id);
      const ids = new Set(mClinics.map((c) => c.id));
      const r30 = rounds.filter((r) => ids.has(r.clinicId) && daysBetween(r.date) <= 30);
      const rounded = new Set(r30.map((r) => r.clinicId));
      const mTasks = tasks.filter((t) => ids.has(t.clinicId));
      const open = mTasks.filter(isOpenStatus).length;
      const overdue = mTasks.filter(isOverdue).length;
      const coverage = mClinics.length ? rounded.size / mClinics.length : 0;
      const cadence = mClinics.length ? Math.min(1, r30.length / (mClinics.length * 2)) : 0;
      const overduePenalty = Math.min(0.25, overdue * 0.03);
      const score = Math.max(
        0,
        Math.round((coverage * 0.6 + cadence * 0.4 - overduePenalty) * 100),
      );
      return {
        managerId: m.id,
        managerName: m.name,
        clinicsAssigned: mClinics.length,
        clinicsRounded30: rounded.size,
        rounds30: r30.length,
        openTasks: open,
        overdueTasks: overdue,
        engagementScore: score,
      };
    })
    .sort((a, b) => b.engagementScore - a.engagementScore);
}

export function escalationAging(tasks: Task[]) {
  const open = tasks.filter(isOpenStatus);
  const buckets = [
    { label: "0-14 days", min: 0, max: 14 },
    { label: "15-30 days", min: 15, max: 30 },
    { label: "31-60 days", min: 31, max: 60 },
    { label: "60+ days", min: 61, max: 100000 },
  ];
  return buckets.map((b) => ({
    label: b.label,
    count: open.filter((t) => {
      const age = daysBetween(t.createdAt);
      return age >= b.min && age <= b.max;
    }).length,
  }));
}
