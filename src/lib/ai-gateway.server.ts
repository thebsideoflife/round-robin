import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

/**
 * Vendor-neutral AI provider.
 *
 * Previously hardwired to https://ai.gateway.vendor.dev. Now it talks to any
 * OpenAI-compatible endpoint, configured by environment:
 *
 *   AI_BASE_URL   default https://api.openai.com/v1
 *   AI_API_KEY    required for AI features (falls back to OPENAI_API_KEY)
 *   AI_MODEL      default gemini-3-flash-preview
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
  const apiKey = process.env.AI_API_KEY ?? process.env.GEMINI_API_KEY ?? process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  return {
    baseURL: process.env.AI_BASE_URL ?? "https://generativelanguage.googleapis.com/v1beta/openai/",
    apiKey,
    model: process.env.AI_MODEL ?? "gemini-3-flash-preview",
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

/**
 * Turn a provider error into something a person can act on.
 *
 * During setup the useful information is almost always in the provider's own
 * response body — a wrong model name, a key without access to it, a region
 * restriction. Swallowing that into "try again" makes configuration guesswork,
 * so the provider's message is surfaced when we have one.
 */
export function gatewayErrorMessage(error: unknown) {
  const err = error as { message?: string; statusCode?: number; responseBody?: string; data?: unknown };
  const message = err?.message ?? String(error);
  const body = typeof err?.responseBody === "string" ? err.responseBody : "";
  const blob = `${message} ${body}`;

  if (/429|RESOURCE_EXHAUSTED|rate.?limit/i.test(blob))
    return "The AI provider is rate limiting us. Wait a moment and try again.";
  if (/quota|billing|402/i.test(blob)) return "The AI account is out of quota or credit.";
  if (/401|403|API key not valid|PERMISSION_DENIED|UNAUTHENTICATED/i.test(blob))
    return "The AI key was rejected. Check AI_API_KEY is a valid Gemini key.";
  if (/404|not found|NOT_FOUND|is not supported|unknown model/i.test(blob))
    return `The model "${process.env.AI_MODEL ?? "gemini-3-flash-preview"}" isn't available to this key. Set AI_MODEL to one your key can use.`;

  // Pull the provider's own message out of a JSON error body when present.
  const detail = (() => {
    try {
      const parsed = JSON.parse(body) as { error?: { message?: string } };
      return parsed?.error?.message;
    } catch {
      return undefined;
    }
  })();

  const shown = (detail ?? message ?? "").slice(0, 220);
  return shown ? `AI request failed: ${shown}` : "AI request failed. Please try again.";
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
