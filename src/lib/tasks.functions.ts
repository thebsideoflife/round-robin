import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { EscalationLevel, Task, TaskPriority, TaskStatus } from "@/data/types";
import {
  escalationToDb,
  priorityToDb,
  taskStatusToDb,
} from "./mappers";

const PrioritySchema = z.enum(["Low", "Medium", "High", "Critical"]);
const StatusSchema = z.enum([
  "Open",
  "In Progress",
  "Pending Validation",
  "Closed",
  "Reopened",
]);
const EscSchema = z.enum(["Manager Resolve", "Director Review", "Executive Review"]);

// Create an action item. Mirrors the in-memory addTask(Omit<Task, "id"|"validationHistory">).
export const createTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      title: string;
      description: string;
      clinicId: string;
      roundId?: string;
      ownerId: string;
      priority: TaskPriority;
      dueDate: string;
      status: TaskStatus;
      escalation: EscalationLevel;
      theme: string;
      safetyRelated: boolean;
    }) =>
      z
        .object({
          title: z.string().min(1),
          description: z.string().default(""),
          clinicId: z.string().uuid(),
          roundId: z.string().optional(),
          ownerId: z.string().uuid(),
          priority: PrioritySchema,
          dueDate: z.string(),
          status: StatusSchema,
          escalation: EscSchema,
          theme: z.string(),
          safetyRelated: z.boolean().default(false),
        })
        .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const payload = {
      clinic_id: data.clinicId,
      source: data.roundId ? "round_finding" : "manual",
      source_id: data.roundId ?? null,
      name: data.title,
      description: data.description,
      theme: data.theme,
      owner_id: data.ownerId,
      due_date: data.dueDate || null,
      status: taskStatusToDb(data.status),
      escalation_level: escalationToDb(data.escalation),
      priority: priorityToDb(data.priority),
      safety_related: data.safetyRelated,
    };

    const { data: row, error } = await supabase
      .from("tasks")
      .insert(payload as never)
      .select("id, created_at, closed_at")
      .single();
    if (error || !row) throw new Error(error?.message ?? "Failed to create task");

    await supabase.from("task_events").insert({
      task_id: row.id,
      event_type: "created",
      to_status: taskStatusToDb(data.status),
      to_level: escalationToDb(data.escalation),
      actor_id: context.userId,
    });

    const task: Task = {
      id: row.id,
      title: data.title,
      description: data.description,
      clinicId: data.clinicId,
      roundId: data.roundId,
      ownerId: data.ownerId,
      priority: data.priority,
      dueDate: data.dueDate,
      status: data.status,
      escalation: data.escalation,
      theme: data.theme,
      safetyRelated: data.safetyRelated,
      createdAt: row.created_at,
      closedAt: row.closed_at ?? undefined,
      validationHistory: [],
    };
    return { task };
  });

export const updateTaskStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      id: string;
      status: TaskStatus;
      note?: string;
      roundId?: string;
    }) =>
      z
        .object({
          id: z.string().uuid(),
          status: StatusSchema,
          note: z.string().optional(),
          roundId: z.string().optional(),
        })
        .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const closedAt =
      data.status === "Closed" ? new Date().toISOString() : null;
    const patch: Record<string, unknown> = {
      status: taskStatusToDb(data.status),
    };
    if (closedAt) patch.closed_at = closedAt;
    else if (data.status !== "Closed") patch.closed_at = null;

    const { error } = await supabase
      .from("tasks")
      .update(patch as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    await supabase.from("task_events").insert({
      task_id: data.id,
      event_type: data.status === "Closed" ? "close" : data.status === "Reopened" ? "reopen" : "status_change",
      to_status: taskStatusToDb(data.status),
      actor_id: context.userId,
      note: data.note ?? null,
    });
    return { ok: true };
  });

export const updateTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      id: string;
      title?: string;
      description?: string;
      priority?: TaskPriority;
      dueDate?: string;
      theme?: string;
      ownerId?: string;
    }) =>
      z
        .object({
          id: z.string().uuid(),
          title: z.string().optional(),
          description: z.string().optional(),
          priority: PrioritySchema.optional(),
          dueDate: z.string().optional(),
          theme: z.string().optional(),
          ownerId: z.string().uuid().optional(),
        })
        .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const patch: Record<string, unknown> = {};
    if (data.title !== undefined) patch.name = data.title;
    if (data.description !== undefined) patch.description = data.description;
    if (data.priority !== undefined) patch.priority = priorityToDb(data.priority);
    if (data.dueDate !== undefined) patch.due_date = data.dueDate || null;
    if (data.theme !== undefined) patch.theme = data.theme;
    if (data.ownerId !== undefined) patch.owner_id = data.ownerId;
    if (!Object.keys(patch).length) return { ok: true };
    const { error } = await supabase
      .from("tasks")
      .update(patch as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setEscalation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      id: string;
      level: EscalationLevel;
      overridden?: boolean;
      reason?: string;
    }) =>
      z
        .object({
          id: z.string().uuid(),
          level: EscSchema,
          overridden: z.boolean().optional(),
          reason: z.string().optional(),
        })
        .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const from = await supabase
      .from("tasks")
      .select("escalation_level")
      .eq("id", data.id)
      .single();
    const { error } = await supabase
      .from("tasks")
      .update({ escalation_level: escalationToDb(data.level) } as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await supabase.from("task_events").insert({
      task_id: data.id,
      event_type: "escalation",
      from_level: from.data?.escalation_level ?? null,
      to_level: escalationToDb(data.level),
      actor_id: context.userId,
      note: data.reason ?? null,
    });
    return { ok: true };
  });

// Create action items from a PX opportunity's recommended actions.
export const createTasksFromOpportunity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      reportId: string;
      opportunityId: string;
      clinicId?: string;
      theme?: string;
      priority?: TaskPriority;
      description?: string;
      ownerRole?: string;
      actions: string[];
    }) =>
      z
        .object({
          reportId: z.string().uuid(),
          opportunityId: z.string().uuid(),
          clinicId: z.string().uuid().optional(),
          theme: z.string().optional(),
          priority: PrioritySchema.optional(),
          description: z.string().optional(),
          ownerRole: z.string().optional(),
          actions: z.array(z.string().min(1)).min(1),
        })
        .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: report, error: rErr } = await supabase
      .from("reports")
      .select("id, clinic_id")
      .eq("id", data.reportId)
      .single();
    if (rErr || !report) throw new Error(rErr?.message ?? "Report not found");

    const clinicId = data.clinicId ?? report.clinic_id;
    if (!clinicId) throw new Error("NO_CLINIC");

    // Skip actions already added for this opportunity.
    const { data: existing } = await supabase
      .from("tasks")
      .select("name")
      .eq("source_id", data.opportunityId);
    const taken = new Set((existing ?? []).map((t: { name: string }) => t.name));

    const due = new Date();
    due.setDate(due.getDate() + 30);
    const dueDate = due.toISOString().slice(0, 10);

    const fresh = data.actions
      .map((a) => a.trim())
      .filter((a) => a && !taken.has(a.slice(0, 180)));
    if (!fresh.length) return { created: 0, skipped: data.actions.length };

    const rows = fresh.map((a) => ({
      clinic_id: clinicId,
      source: "px_opportunity",
      source_id: data.opportunityId,
      report_id: data.reportId,
      name: a.slice(0, 180),
      description: data.description ?? "",
      theme: data.theme ?? "Patient Experience",
      owner_role: data.ownerRole ?? null,
      owner_id: userId,
      due_date: dueDate,
      status: "open",
      escalation_level: "manager",
      priority: priorityToDb(data.priority ?? "Medium"),
      safety_related: false,
    }));

    const { data: inserted, error } = await supabase
      .from("tasks")
      .insert(rows as never)
      .select("id");
    if (error) throw new Error(error.message);

    if (inserted?.length) {
      await supabase.from("task_events").insert(
        inserted.map((t: { id: string }) => ({
          task_id: t.id,
          event_type: "created",
          to_status: "open",
          to_level: "manager",
          actor_id: userId,
        })) as never,
      );
    }

    return {
      created: inserted?.length ?? 0,
      skipped: data.actions.length - fresh.length,
    };
  });
