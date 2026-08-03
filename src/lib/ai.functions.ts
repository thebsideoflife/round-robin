import { createServerFn } from "@tanstack/react-start";
import { generateText, NoObjectGeneratedError, Output } from "ai";
import { z } from "zod";
import {
  AI_NOT_CONFIGURED,
  asStrings,
  createAiProvider,
  gatewayErrorMessage,
  getAiConfig,
  parseJsonFallback,
} from "./ai-gateway.server";

const summarySchema = z.object({
  executiveSummary: z.string(),
  keyBarriers: z.array(z.string()),
  suggestedActions: z.array(z.string()),
});

const trendSchema = z.object({
  headline: z.string(),
  insights: z.array(z.string()),
  emergingRisks: z.array(z.string()),
});

export const summarizeRound = createServerFn({ method: "POST" })
  .inputValidator((input: { notes: string; clinic: string; role: string }) =>
    z.object({ notes: z.string().min(1), clinic: z.string(), role: z.string() }).parse(input),
  )
  .handler(async ({ data }) => {
    const config = getAiConfig();
    if (!config) return { error: AI_NOT_CONFIGURED };
    const gateway = createAiProvider(config);
    const prompt = `You support ambulatory clinic leadership rounding. Summarize the rounding conversation below.
Clinic: ${data.clinic}
Person rounded with (role): ${data.role}
Notes and answers:
"""
${data.notes}
"""
Respond in json with keys executiveSummary (at most 3 sentences, written for a Director), keyBarriers (at most 4 short phrases) and suggestedActions (at most 4 concrete actions a practice manager could own). Be specific and operational. Do not invent facts that are not implied by the notes.`;
    try {
      const { output } = await generateText({
        model: gateway(config.model),
        output: Output.object({ schema: summarySchema }),
        prompt,
      });
      return {
        summary: {
          executiveSummary: output.executiveSummary,
          keyBarriers: output.keyBarriers.slice(0, 4),
          suggestedActions: output.suggestedActions.slice(0, 4),
        },
      };
    } catch (error) {
      if (NoObjectGeneratedError.isInstance(error)) {
        const parsed = parseJsonFallback<Record<string, unknown>>(error.text);
        if (parsed && typeof parsed.executiveSummary === "string") {
          return {
            summary: {
              executiveSummary: parsed.executiveSummary,
              keyBarriers: asStrings(parsed.keyBarriers, 4),
              suggestedActions: asStrings(parsed.suggestedActions, 4),
            },
          };
        }
        console.error("summarizeRound unreadable output:", error.text?.slice(0, 500));
        return { error: "AI returned an unreadable summary. Try again." as const };
      }
      console.error("summarizeRound failed:", error);
      return { error: gatewayErrorMessage(error) };
    }
  });

export const analyzeTrends = createServerFn({ method: "POST" })
  .inputValidator((input: { context: string; scopeLabel: string }) =>
    z.object({ context: z.string().min(1), scopeLabel: z.string() }).parse(input),
  )
  .handler(async ({ data }) => {
    const config = getAiConfig();
    if (!config) return { error: AI_NOT_CONFIGURED };
    const gateway = createAiProvider(config);
    const prompt = `You analyze leadership rounding data for an ambulatory healthcare organization.
Scope: ${data.scopeLabel}
Aggregated rounding and issue data:
"""
${data.context}
"""
Identify repeated concerns, multi-clinic issues, and escalation patterns. Respond in json with keys headline (one sentence), insights (at most 5 single-sentence items citing counts and clinic spread, e.g. "Referral management has been mentioned 14 times across 5 clinics in the last 30 days.") and emergingRisks (at most 3 risks leadership should act on). Only use the numbers provided.`;
    try {
      const { output } = await generateText({
        model: gateway(config.model),
        output: Output.object({ schema: trendSchema }),
        prompt,
      });
      return {
        trends: {
          headline: output.headline,
          insights: output.insights.slice(0, 5),
          emergingRisks: output.emergingRisks.slice(0, 3),
        },
      };
    } catch (error) {
      if (NoObjectGeneratedError.isInstance(error)) {
        const parsed = parseJsonFallback<Record<string, unknown>>(error.text);
        if (parsed && typeof parsed.headline === "string") {
          return {
            trends: {
              headline: parsed.headline,
              insights: asStrings(parsed.insights, 5),
              emergingRisks: asStrings(parsed.emergingRisks, 3),
            },
          };
        }
        console.error("analyzeTrends unreadable output:", error.text?.slice(0, 500));
        return { error: "AI returned an unreadable analysis. Try again." as const };
      }
      console.error("analyzeTrends failed:", error);
      return { error: gatewayErrorMessage(error) };
    }
  });
