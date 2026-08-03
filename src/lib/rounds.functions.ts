import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { Round, RoundAnswers, RoundedRole, WinCategory } from "@/data/types";
import { mapRound } from "./mappers";

const AnswersSchema = z.object({
  workingWell: z.string().default(""),
  barriers: z.string().default(""),
  accessChallenges: z.string().default(""),
  workflowConcerns: z.string().default(""),
  safetyConcerns: z.string().default(""),
  leadershipSupport: z.string().default(""),
  additionalComments: z.string().default(""),
});

const WinSchema = z
  .object({
    text: z.string().min(1),
    recognized: z.string().optional(),
    category: z.string().default("Recognition"),
  })
  .optional();

// Create a structured round, persisting themes as findings and an optional win.
export const createRound = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      clinicId: string;
      date: string;
      managerId: string;
      individual: string;
      individualRole: string;
      notes: string;
      answers: RoundAnswers;
      themes: string[];
      safetyFlag: boolean;
      win?: { text: string; recognized?: string; category: WinCategory };
    }) =>
      z
        .object({
          clinicId: z.string().uuid(),
          date: z.string(),
          managerId: z.string().uuid(),
          individual: z.string(),
          individualRole: z.string(),
          notes: z.string(),
          answers: AnswersSchema,
          themes: z.array(z.string()).default([]),
          safetyFlag: z.boolean().default(false),
          win: WinSchema,
        })
        .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const leaderId = data.managerId || userId;

    const { data: row, error } = await supabase
      .from("rounds")
      .insert({
        clinic_id: data.clinicId,
        leader_id: leaderId,
        round_date: data.date,
        individual: data.individual,
        individual_role: data.individualRole,
        notes: data.notes,
        answers: data.answers as never,
        themes: data.themes,
        safety_flag: data.safetyFlag,
      })
      .select(
        "id, clinic_id, leader_id, round_date, status, individual, individual_role, notes, answers, themes, safety_flag, ai_summary, created_at, round_wins(win_text, recognized_person, category)",
      )
      .single();
    if (error || !row) throw new Error(error?.message ?? "Failed to create round");

    // Persist themes as findings for drill-down.
    if (data.themes.length) {
      await supabase.from("round_findings").insert(
        data.themes.map((theme) => ({
          round_id: row.id,
          theme,
          severity: data.safetyFlag ? "high" : "moderate",
          finding_text: data.notes || theme,
        })),
      );
    }
    // Persist the win.
    if (data.win) {
      await supabase.from("round_wins").insert({
        round_id: row.id,
        win_text: data.win.text,
        recognized_person: data.win.recognized ?? null,
        category: data.win.category,
      });
      // Re-select to include the win.
      const { data: fresh } = await supabase
        .from("rounds")
        .select(
          "id, clinic_id, leader_id, round_date, status, individual, individual_role, notes, answers, themes, safety_flag, ai_summary, created_at, round_wins(win_text, recognized_person, category)",
        )
        .eq("id", row.id)
        .single();
      if (fresh) return { round: mapRound(fresh as Parameters<typeof mapRound>[0]) };
    }

    return { round: mapRound(row as Parameters<typeof mapRound>[0]) };
  });

// Close a round and optionally attach an AI-generated executive summary.
export const closeRound = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: { roundId: string; aiSummary?: string }) =>
      z
        .object({ roundId: z.string().uuid(), aiSummary: z.string().optional() })
        .parse(data),
  )
  .handler(async ({ data, context }) => {
    const patch: Record<string, unknown> = { status: "closed" };
    if (data.aiSummary) patch.ai_summary = data.aiSummary;
    const { error } = await context.supabase
      .from("rounds")
      .update(patch as never)
      .eq("id", data.roundId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Ensure a role string maps cleanly.
export function coerceRole(r: string): RoundedRole {
  if (r === "Provider") return "Provider";
  if (r === "Front Office Staff") return "Front Office Staff";
  return "Clinical Staff";
}

export type { Round };
