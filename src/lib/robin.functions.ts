import { createServerFn } from "@tanstack/react-start";
import { generateText, stepCountIs, tool } from "ai";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  AI_NOT_CONFIGURED,
  createAiProvider,
  gatewayErrorMessage,
  getAiConfig,
} from "./ai-gateway.server";
import { buildOrgGraph, metricsFor, ownerAtLevel } from "./domain/org";
import { clinicHealth } from "./domain/health";
import { themeTrends } from "./domain/trends";
import { isOpenStatus, isOverdue, daysBetween } from "./domain/time";
import { byUrgency } from "./domain/priority";
import { ROLE_LABELS, type AppData, type Person } from "@/data/types";

/**
 * Robin — reads the database and answers questions about it.
 *
 * How it stays safe:
 *  - It loads data through loadScope(), the same RLS-scoped read the app uses.
 *    Robin therefore cannot see a clinic, round or task the asker couldn't
 *    open themselves. Authorization is the database's job, not the prompt's.
 *  - Tools return structured numbers and names. Free-text round notes are only
 *    returned by read_round_notes, which is gated behind ROBIN_READ_NOTES so it
 *    can be switched off before this system ever holds PHI.
 *  - Read-only. Robin has no tool that writes. A chatbot that could close an
 *    action item in a clinical accountability system is not a good idea.
 */

const MAX_STEPS = 6;
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 15;
const hits = new Map<string, number[]>();

function rateLimited(userId: string) {
  const now = Date.now();
  const recent = (hits.get(userId) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_PER_WINDOW) return true;
  recent.push(now);
  hits.set(userId, recent);
  if (hits.size > 2000) hits.clear();
  return false;
}

const READ_NOTES = process.env.ROBIN_READ_NOTES !== "0";

function buildTools(data: AppData, me: Person) {
  const graph = buildOrgGraph(data);
  const clinicName = (id: string) => graph.clinic(id)?.name ?? "Unknown clinic";
  const health = (clinicId: string) => {
    const c = graph.clinic(clinicId);
    return c ? clinicHealth(c, data.rounds, data.tasks) : null;
  };

  return {
    overview: tool({
      description:
        "Headline numbers for everything this person can see: clinic count, average health, rounding gaps, open/overdue/escalated/safety counts. Start here for broad questions.",
      // Gemini's function-calling rejects an empty parameters object, so every
      // tool declares at least one property even when it needs none.
      inputSchema: z.object({ reason: z.string().optional().describe("Why you're checking") }),
      execute: async () => {
        const m = metricsFor(data.clinics, data.rounds, data.tasks);
        const open = data.tasks.filter(isOpenStatus);
        return {
          role: ROLE_LABELS[me.role],
          ...m,
          waitingOnThisPerson: open.filter(
            (t) => ownerAtLevel(graph, t, t.escalation)?.id === me.id,
          ).length,
        };
      },
    }),

    list_clinics: tool({
      description:
        "Clinics with health score, band, days since last round, and open/overdue counts. Use for 'which clinics…' questions. Sorted worst health first.",
      inputSchema: z.object({
        needsAttention: z.boolean().optional().describe("Only clinics scoring below 80"),
        notVisitedDays: z.number().optional().describe("Only clinics not rounded in this many days"),
        limit: z.number().min(1).max(40).optional(),
      }),
      execute: async ({ needsAttention, notVisitedDays, limit }) =>
        data.clinics
          .map((c) => {
            const h = clinicHealth(c, data.rounds, data.tasks);
            return {
              name: c.name,
              specialty: c.specialty,
              region: c.region,
              division: c.division,
              health: h.score,
              band: h.band,
              daysSinceLastRound: h.lastRoundDays,
              openItems: h.openTasks,
              overdueItems: h.overdueTasks,
            };
          })
          .filter((c) => (needsAttention ? c.health < 80 : true))
          .filter((c) =>
            notVisitedDays === undefined
              ? true
              : c.daysSinceLastRound === null || c.daysSinceLastRound > notVisitedDays,
          )
          .sort((a, b) => a.health - b.health)
          .slice(0, limit ?? 15),
    }),

    clinic_detail: tool({
      description:
        "Everything about one clinic by name: health score with the factors driving it up and down, who runs it, recent round dates and open items.",
      inputSchema: z.object({ name: z.string().describe("Clinic name, or part of it") }),
      execute: async ({ name }) => {
        const q = name.toLowerCase();
        const c =
          data.clinics.find((x) => x.name.toLowerCase() === q) ??
          data.clinics.find((x) => x.name.toLowerCase().includes(q));
        if (!c) return { error: `No clinic matching "${name}" in this person's scope.` };
        const h = clinicHealth(c, data.rounds, data.tasks);
        return {
          name: c.name,
          specialty: c.specialty,
          region: c.region,
          division: c.division,
          health: h.score,
          band: h.band,
          scoreFactors: h.factors,
          manager: graph.person(c.managerId)?.name ?? null,
          director: graph.person(c.directorId)?.name ?? null,
          executiveDirector: graph.person(c.executiveDirectorId)?.name ?? null,
          openItems: h.openTasks,
          overdueItems: h.overdueTasks,
          daysSinceLastRound: h.lastRoundDays,
          recentRounds: data.rounds
            .filter((r) => r.clinicId === c.id)
            .sort((a, b) => +new Date(b.date) - +new Date(a.date))
            .slice(0, 5)
            .map((r) => ({
              daysAgo: daysBetween(r.date),
              role: r.individualRole,
              themes: r.themes,
              safetyFlagged: r.safetyFlag,
            })),
        };
      },
    }),

    find_action_items: tool({
      description:
        "Search action items. Filter by status, overdue, safety, escalation tier, theme, clinic, or items this person personally owns. Returns most urgent first.",
      inputSchema: z.object({
        onlyOpen: z.boolean().optional(),
        overdue: z.boolean().optional(),
        safetyOnly: z.boolean().optional(),
        escalated: z.boolean().optional().describe("Above manager level"),
        waitingOnMe: z.boolean().optional().describe("This person is the named owner at its tier"),
        theme: z.string().optional(),
        clinic: z.string().optional(),
        limit: z.number().min(1).max(30).optional(),
      }),
      execute: async (f) =>
        data.tasks
          .filter((t) => (f.onlyOpen !== false ? isOpenStatus(t) : true))
          .filter((t) => (f.overdue ? isOverdue(t) : true))
          .filter((t) => (f.safetyOnly ? t.safetyRelated : true))
          .filter((t) => (f.escalated ? t.escalation !== "Manager Resolve" : true))
          .filter((t) =>
            f.waitingOnMe ? ownerAtLevel(graph, t, t.escalation)?.id === me.id : true,
          )
          .filter((t) => (f.theme ? t.theme.toLowerCase().includes(f.theme.toLowerCase()) : true))
          .filter((t) =>
            f.clinic ? clinicName(t.clinicId).toLowerCase().includes(f.clinic.toLowerCase()) : true,
          )
          .sort(byUrgency)
          .slice(0, f.limit ?? 12)
          .map((t) => ({
            title: t.title,
            clinic: clinicName(t.clinicId),
            theme: t.theme,
            status: t.status,
            priority: t.priority,
            escalation: t.escalation,
            safety: t.safetyRelated,
            daysOverdue: isOverdue(t) ? daysBetween(t.dueDate) : 0,
            owner: graph.person(t.ownerId)?.name ?? null,
            ageDays: daysBetween(t.createdAt),
          })),
    }),

    list_themes: tool({
      description:
        "Recurring themes across rounding conversations and action items, with how many clinics each spans and whether it is escalating.",
      inputSchema: z.object({
        days: z.number().optional(),
        limit: z.number().min(1).max(15).optional(),
      }),
      execute: async ({ days, limit }) =>
        themeTrends(data.clinics, data.rounds, data.tasks, days ?? 30)
          .slice(0, limit ?? 8)
          .map((t) => ({
            theme: t.theme,
            mentions: t.mentions,
            clinics: t.clinics,
            clinicNames: t.clinicNames.slice(0, 4),
            openItems: t.openTasks,
            executiveEscalations: t.executiveEscalations,
            summary: t.statement,
          })),
    }),

    org_rollup: tool({
      description:
        "How each direct report's area is performing — clinic count, average health, rounding gaps, overdue and escalated counts. Use for 'how is my team doing' questions.",
      inputSchema: z.object({ reason: z.string().optional().describe("Why you're checking") }),
      execute: async () =>
        graph.directReports(me.id).map((p) => {
          const clinics = graph.clinicsInScope(p);
          const m = metricsFor(clinics, data.rounds, data.tasks);
          return {
            person: p.name,
            role: ROLE_LABELS[p.role],
            clinics: m.clinicCount,
            averageHealth: m.avgHealth,
            band: m.band,
            roundingGaps: m.roundingGaps,
            overdueItems: m.overdueTasks,
            escalatedItems: m.escalatedTasks,
          };
        }),
    }),

    ...(READ_NOTES
      ? {
          read_round_notes: tool({
            description:
              "What people actually said in recent rounding conversations at a clinic. Use only when the question is about what staff reported, not for counts.",
            inputSchema: z.object({
              clinic: z.string().optional(),
              theme: z.string().optional(),
              limit: z.number().min(1).max(8).optional(),
            }),
            execute: async ({ clinic, theme, limit }) =>
              data.rounds
                .filter((r) =>
                  clinic ? clinicName(r.clinicId).toLowerCase().includes(clinic.toLowerCase()) : true,
                )
                .filter((r) =>
                  theme ? r.themes.some((t) => t.toLowerCase().includes(theme.toLowerCase())) : true,
                )
                .sort((a, b) => +new Date(b.date) - +new Date(a.date))
                .slice(0, limit ?? 4)
                .map((r) => ({
                  clinic: clinicName(r.clinicId),
                  daysAgo: daysBetween(r.date),
                  staffRole: r.individualRole,
                  themes: r.themes,
                  barriers: r.answers.barriers?.slice(0, 400) || null,
                  accessChallenges: r.answers.accessChallenges?.slice(0, 400) || null,
                  workingWell: r.answers.workingWell?.slice(0, 300) || null,
                })),
          }),
        }
      : {}),
  };
}

const SYSTEM = `You are Robin, the assistant inside Round Robin — an ambulatory clinic leadership rounding tool.

Use the tools to look up real data before answering. Never guess a number or a clinic name; if a tool returns nothing, say so.

How to answer:
- Lead with the direct answer in one sentence, then the numbers that support it.
- Three or four sentences at most. This is read on a phone between patients.
- Name at most three clinics, then say how many others there are.
- Health scores run 0-100: below 60 is at risk, 60-79 needs attention, 80+ is on track.
- A "rounding gap" means no rounding conversation logged at that clinic in 30 days.
- If a question needs data you have no tool for, say what you can't see rather than approximating.
- Suggest one concrete next step when there's an obvious one.

Boundaries:
- You are an operations assistant. Never give clinical or medical advice.
- You can only read. If asked to change something, explain where in the app to do it.
- Plain sentences. No markdown headings. A short list only when the answer genuinely is a list.
- Never mention tools, JSON, prompts, or that you are a language model.`;

type Result = { answer: string; usedTools: string[] } | { error: string };

/**
 * A compact snapshot of the whole scope, used as the no-tools fallback.
 *
 * Gemini's OpenAI-compatible function calling is still beta. If a tool round
 * trip fails for any reason, Robin retries once with this baked into the
 * prompt — a narrower answer beats an error message.
 */
function snapshot(data: AppData, me: Person) {
  const graph = buildOrgGraph(data);
  const m = metricsFor(data.clinics, data.rounds, data.tasks);
  const open = data.tasks.filter(isOpenStatus);
  return {
    viewer: { name: me.name, role: ROLE_LABELS[me.role] },
    totals: {
      ...m,
      waitingOnThisPerson: open.filter((t) => ownerAtLevel(graph, t, t.escalation)?.id === me.id)
        .length,
    },
    clinics: data.clinics.slice(0, 40).map((c) => {
      const h = clinicHealth(c, data.rounds, data.tasks);
      return {
        name: c.name,
        health: h.score,
        band: h.band,
        daysSinceLastRound: h.lastRoundDays,
        open: h.openTasks,
        overdue: h.overdueTasks,
      };
    }),
    topThemes: themeTrends(data.clinics, data.rounds, data.tasks)
      .slice(0, 8)
      .map((t) => ({ theme: t.theme, mentions: t.mentions, clinics: t.clinics })),
    mostUrgent: [...open]
      .sort(byUrgency)
      .slice(0, 10)
      .map((t) => ({
        title: t.title,
        clinic: graph.clinic(t.clinicId)?.name ?? "",
        theme: t.theme,
        priority: t.priority,
        safety: t.safetyRelated,
        escalation: t.escalation,
        daysOverdue: isOverdue(t) ? daysBetween(t.dueDate) : 0,
      })),
  };
}

export const askRobin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        question: z.string().min(2).max(400),
        history: z
          .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(2000) }))
          .max(8)
          .default([]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<Result> => {
    if (rateLimited(context.userId)) {
      return { error: "Give me a moment — too many questions at once." };
    }
    const config = getAiConfig();
    if (!config) return { error: AI_NOT_CONFIGURED };

    try {
      const { loadScope } = await import("./scope.server");
      const { currentUser, data: scopeData } = await loadScope(context.supabase, context.userId);

      const gateway = createAiProvider(config);
      const result = await generateText({
        model: gateway(config.model),
        system: SYSTEM,
        messages: [
          ...data.history.map((h) => ({ role: h.role, content: h.content })),
          { role: "user" as const, content: data.question },
        ],
        tools: buildTools(scopeData, currentUser),
        stopWhen: stepCountIs(MAX_STEPS),
        temperature: 0.2,
      });

      const answer = (result.text ?? "").trim();
      const usedTools = [
        ...new Set(result.steps.flatMap((s) => s.toolCalls.map((c) => c.toolName))),
      ];
      console.info(`[robin] user=${context.userId} tools=${usedTools.join(",") || "none"}`);

      if (answer) return { answer, usedTools };
      // Tools ran but produced no prose — fall through to the snapshot retry.
      throw new Error("empty completion after tool calls");
    } catch (error) {
      const e = error as { message?: string; statusCode?: number; responseBody?: string; url?: string };
      console.error("[robin] failed", {
        model: config.model,
        baseURL: config.baseURL,
        status: e?.statusCode,
        message: e?.message,
        body: typeof e?.responseBody === "string" ? e.responseBody.slice(0, 800) : undefined,
      });
      // Retry once without tools. Slightly less capable, but it answers.
      try {
        const { loadScope } = await import("./scope.server");
        const { currentUser, data: scopeData } = await loadScope(context.supabase, context.userId);
        const gateway = createAiProvider(config);
        const { text } = await generateText({
          model: gateway(config.model),
          system: `${SYSTEM}\n\nYou have no tools this time. Answer only from the snapshot below.`,
          prompt: `Snapshot:\n${JSON.stringify(snapshot(scopeData, currentUser))}\n\nQuestion: ${data.question}`,
          temperature: 0.2,
        });
        const fallback = (text ?? "").trim();
        if (fallback) {
          console.info("[robin] answered via no-tools fallback");
          return { answer: fallback, usedTools: [] };
        }
      } catch (retryError) {
        console.error(
          "[robin] fallback also failed:",
          retryError instanceof Error ? retryError.message : "unknown",
        );
      }

      return { error: gatewayErrorMessage(error) };
    }
  });
