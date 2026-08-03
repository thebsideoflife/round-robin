import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

/**
 * Vendor-neutral AI provider.
 *
 * Previously hardwired to https://ai.gateway.vendor.dev. Now it talks to any
 * OpenAI-compatible endpoint, configured by environment:
 *
 *   AI_BASE_URL   default https://api.openai.com/v1
 *   AI_API_KEY    required for AI features (falls back to OPENAI_API_KEY)
 *   AI_MODEL      default gpt-4o-mini
 *
 * Works unchanged against OpenAI, Azure OpenAI, OpenRouter, Groq, Together,
 * or a self-hosted vLLM — which matters, because whoever you sign a BAA with
 * is the one you must be able to point this at.
 */

export interface AiConfig {
  baseURL: string;
  apiKey: string;
  model: string;
}

/** Returns null when AI isn't configured, so callers degrade instead of throwing. */
export function getAiConfig(): AiConfig | null {
  const apiKey = process.env.AI_API_KEY ?? process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  return {
    baseURL: process.env.AI_BASE_URL ?? "https://api.openai.com/v1",
    apiKey,
    model: process.env.AI_MODEL ?? "gpt-4o-mini",
  };
}

export function createAiProvider(config: AiConfig) {
  return createOpenAICompatible({
    name: "round-robin-ai",
    baseURL: config.baseURL,
    supportsStructuredOutputs: true,
    headers: { Authorization: `Bearer ${config.apiKey}` },
  });
}

export const AI_NOT_CONFIGURED =
  "AI features aren't configured. Set AI_API_KEY on the server to enable summaries." as const;

export function gatewayErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("429")) return "AI is rate limited right now. Try again in a moment.";
  if (message.includes("402") || message.includes("quota"))
    return "The AI account is out of credit.";
  if (message.includes("401") || message.includes("403"))
    return "The AI key was rejected. Check AI_API_KEY.";
  return "AI request failed. Please try again.";
}

/** Recover a JSON object from raw model text (handles code fences and prose wrappers). */
export function parseJsonFallback<T>(text: string | undefined): T | null {
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}

export const asStrings = (value: unknown, max: number) =>
  Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string").slice(0, max)
    : [];
