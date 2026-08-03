import type { Task } from "@/data/types";

/**
 * Date and status helpers, extracted so the org graph and the permission
 * layer can share them without importing each other.
 */
export const DAY = 86400000;

/** Real wall-clock time. Isolated here so tests can stub one place. */
const now = () => new Date();

export const daysBetween = (a: Date | string, b: Date | string = now()) =>
  Math.round((new Date(b).getTime() - new Date(a).getTime()) / DAY);

export const isOpenStatus = (t: Task) => t.status !== "Closed";
export const isOverdue = (t: Task) => isOpenStatus(t) && new Date(t.dueDate) < now();

/** Human-readable close date for a closed action item. */
export const closedOn = (t: Task) =>
  t.closedAt ? new Date(t.closedAt).toLocaleDateString() : undefined;
