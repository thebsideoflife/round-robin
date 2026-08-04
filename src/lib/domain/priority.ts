import type { Task } from "@/data/types";
import { daysBetween, isOpenStatus, isOverdue } from "./time";

/**
 * One ordering rule, used by every list that shows action items.
 *
 * The product's whole claim is that nothing important gets lost, so a safety
 * issue must never sit below a routine item just because its due date is
 * further out. Lower rank sorts first.
 */
export function urgencyRank(t: Task): number {
  if (!isOpenStatus(t)) return 900;
  let rank = 500;
  if (t.safetyRelated) rank -= 300;
  if (t.priority === "Critical") rank -= 200;
  else if (t.priority === "High") rank -= 60;
  if (isOverdue(t)) rank -= 120;
  if (t.escalation === "Executive Review") rank -= 40;
  else if (t.escalation === "Director Review") rank -= 20;
  return rank;
}

/** True when something needs to be visibly pinned to the top of a view. */
export function isCritical(t: Task): boolean {
  return isOpenStatus(t) && (t.safetyRelated || t.priority === "Critical");
}

/**
 * Critical first, then by how overdue, then by due date.
 * Closed items fall to the bottom, most recently closed first.
 */
export function byUrgency(a: Task, b: Task): number {
  const r = urgencyRank(a) - urgencyRank(b);
  if (r !== 0) return r;
  if (!isOpenStatus(a) && !isOpenStatus(b)) {
    return +new Date(b.closedAt ?? b.createdAt) - +new Date(a.closedAt ?? a.createdAt);
  }
  const overdueDiff = daysBetween(b.dueDate) - daysBetween(a.dueDate);
  if (overdueDiff !== 0) return overdueDiff;
  return +new Date(a.dueDate) - +new Date(b.dueDate);
}

/** Split a list so callers can render a pinned block above the rest. */
export function splitCritical(tasks: Task[]): { critical: Task[]; rest: Task[] } {
  const sorted = [...tasks].sort(byUrgency);
  return {
    critical: sorted.filter(isCritical),
    rest: sorted.filter((t) => !isCritical(t)),
  };
}
