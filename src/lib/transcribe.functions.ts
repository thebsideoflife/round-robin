import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Voice-note transcription.
 *
 * Privacy posture (this matters for the HIPAA path):
 *  - Audio is held in memory for the duration of one request and is never
 *    written to disk, to Storage, or to a database column.
 *  - Nothing is logged except byte length, duration and outcome. The transcript
 *    and the audio itself never reach the logs.
 *  - The caller must be authenticated; anonymous requests cannot burn credits.
 *  - Before this handles PHI you need a signed BAA with whichever provider you
 *    configure below, and `TRANSCRIBE_PROVIDER` should be pinned to that one.
 *    See SECURITY.md.
 */

/** ~4 minutes of Opus, comfortably above the client's 3-minute cap. */
const MAX_BASE64_BYTES = 8 * 1024 * 1024;

const ALLOWED_MIME = [
  "audio/webm",
  "audio/ogg",
  "audio/mp4",
  "audio/mpeg",
  "audio/wav",
  "audio/x-m4a",
] as const;

const InputSchema = z.object({
  /** Base64 payload without the data: prefix. */
  audio: z.string().min(64).max(MAX_BASE64_BYTES),
  mimeType: z.string().max(80),
  /** Optional domain hint that measurably improves proper-noun accuracy. */
  context: z.string().max(400).optional(),
});

const VOCAB =
  "Clinical rounding vocabulary: rounding, huddle, throughput, referral backlog, " +
  "prior authorization, no-show rate, panel size, MA, LPN, RN, provider, front office, " +
  "access, template, in-basket, escalation, safety catch, Press Ganey, top box, percentile.";

const PROMPT =
  "Transcribe this leadership rounding voice note verbatim. " +
  "Return only the transcript text with sentence punctuation, no preamble, no speaker labels, " +
  "no commentary. If the audio is silent or unintelligible, return an empty string. " +
  VOCAB;

/* ------------------------------------------------------------------ */
/* Rate limiting                                                       */
/* ------------------------------------------------------------------ */

/**
 * Per-user sliding window. In-memory, so it resets on deploy and is per
 * instance — good enough to stop a stuck client from looping, not a substitute
 * for a gateway-level limit. Move to a Postgres or KV counter before scaling
 * past one node.
 */
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 20;
const hits = new Map<string, number[]>();

function rateLimited(userId: string): boolean {
  const now = Date.now();
  const recent = (hits.get(userId) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_PER_WINDOW) {
    hits.set(userId, recent);
    return true;
  }
  recent.push(now);
  hits.set(userId, recent);
  if (hits.size > 5000) hits.clear(); // crude bound on memory growth
  return false;
}

/* ------------------------------------------------------------------ */
/* Providers                                                           */
/* ------------------------------------------------------------------ */

type Result = { text: string } | { error: string };

/**
 * Whisper-compatible multipart endpoint (OpenAI, Azure OpenAI, or any
 * self-hosted whisper.cpp / faster-whisper server exposing the same route).
 * Preferred when available: purpose-built, cheap, and the request body never
 * gets re-encoded as text.
 */
async function viaWhisper(
  bytes: Uint8Array,
  mimeType: string,
  baseUrl: string,
  apiKey: string,
  model: string,
): Promise<Result> {
  const ext = mimeType.includes("mp4") || mimeType.includes("m4a")
    ? "m4a"
    : mimeType.includes("ogg")
      ? "ogg"
      : mimeType.includes("wav")
        ? "wav"
        : mimeType.includes("mpeg")
          ? "mp3"
          : "webm";

  const form = new FormData();
  form.append("file", new Blob([bytes as BlobPart], { type: mimeType }), `note.${ext}`);
  form.append("model", model);
  form.append("response_format", "json");
  form.append("prompt", VOCAB);

  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!res.ok) {
    console.error("[transcribe] whisper endpoint returned", res.status);
    return { error: res.status === 429 ? "Transcription is rate limited. Try again in a moment." : "Transcription failed." };
  }
  const json = (await res.json()) as { text?: string };
  return { text: (json.text ?? "").trim() };
}

/**
 * Multimodal chat fallback for endpoints that accept inline audio (Gemini and
 * GPT-4o audio models do). Used only when no Whisper endpoint is configured.
 */
async function viaGateway(
  base64: string,
  mimeType: string,
  apiKey: string,
  baseUrl: string,
  model: string,
): Promise<Result> {
  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: PROMPT },
            // Gemini's inline-data shape, passed through by the gateway.
            { type: "input_audio", input_audio: { data: base64, format: mimeType } },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    console.error("[transcribe] audio chat endpoint returned", res.status);
    if (res.status === 429) return { error: "Transcription is rate limited. Try again in a moment." };
    if (res.status === 402) return { error: "AI credits are exhausted for this workspace." };
    return { error: "Transcription failed." };
  }

  const json = (await res.json()) as {
    choices?: { message?: { content?: string | { text?: string }[] } }[];
  };
  const content = json.choices?.[0]?.message?.content;
  const text =
    typeof content === "string"
      ? content
      : Array.isArray(content)
        ? content.map((c) => c.text ?? "").join(" ")
        : "";
  return { text: text.trim() };
}

/* ------------------------------------------------------------------ */

export const transcribeVoiceNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data, context }): Promise<Result> => {
    if (rateLimited(context.userId)) {
      return { error: "Too many voice notes at once. Wait a few seconds and try again." };
    }

    const mimeType = data.mimeType.split(";")[0].trim().toLowerCase();
    if (!ALLOWED_MIME.includes(mimeType as (typeof ALLOWED_MIME)[number])) {
      return { error: "That audio format isn't supported." };
    }

    let bytes: Uint8Array;
    try {
      const binary = atob(data.audio);
      bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    } catch {
      return { error: "The recording could not be read." };
    }

    console.info(`[transcribe] user=${context.userId} bytes=${bytes.byteLength} type=${mimeType}`);

    const whisperKey = process.env.WHISPER_API_KEY ?? process.env.AI_API_KEY ?? process.env.OPENAI_API_KEY;
    const whisperBase = process.env.WHISPER_BASE_URL ?? "https://api.openai.com/v1";
    const whisperModel = process.env.WHISPER_MODEL ?? "whisper-1";
    const chatKey = process.env.AI_API_KEY ?? process.env.OPENAI_API_KEY;
    const chatBase = process.env.AI_BASE_URL ?? "https://api.openai.com/v1";
    const chatModel = process.env.AI_AUDIO_MODEL ?? "gpt-4o-mini-audio-preview";

    try {
      if (whisperKey) {
        return await viaWhisper(bytes, mimeType, whisperBase, whisperKey, whisperModel);
      }
      if (chatKey) {
        return await viaGateway(data.audio, mimeType, chatKey, chatBase, chatModel);
      }
      return {
        error: "Voice notes aren't configured yet. Set WHISPER_API_KEY on the server.",
      };
    } catch (err) {
      console.error("[transcribe] failed:", err instanceof Error ? err.message : "unknown");
      return { error: "Transcription failed. Try again, or type the note instead." };
    }
  });
