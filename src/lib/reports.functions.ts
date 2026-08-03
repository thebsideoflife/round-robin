import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { generateText, Output } from "ai";
import { AI_NOT_CONFIGURED, createAiProvider, getAiConfig } from "./ai-gateway.server";

// PDF extraction needs a vision-capable model. Override with AI_VISION_MODEL.
const VISION_MODEL = process.env.AI_VISION_MODEL ?? "gpt-4o";

// ---------- Schemas ----------
const ExtractionSchema = z.object({
  site_name: z.string().default("Unknown Site").describe("Site Name from the report header"),
  facility_name: z.string().nullish().default(null),
  service_line: z.string().nullish().default(null),
  time_frame: z.string().nullish().default(null),
  overall: z
    .object({
      n: z.number().nullish().default(null),
      top_box: z.number().default(0).describe("Top box percentage, e.g. 92.13"),
      percentile: z.number().default(0).describe("Overall percentile rank 0-100"),
    })
    .default({ n: null, top_box: 0, percentile: 0 }),
  trends: z
    .array(
      z.object({
        period: z.string().nullish().default(""),
        n: z.number().nullish().default(null),
        top_box: z.number().nullish().default(null),
        percentile: z.number().nullish().default(null),
      }),
    )
    .default([]),
  sections: z
    .array(
      z.object({
        name: z.string(),
        n: z.number().nullish().default(null),
        top_box: z.number().default(0),
        percentile: z.number().default(0),
      }),
    )
    .default([]),
  providers: z
    .array(
      z.object({
        name: z.string(),
        n: z.number().nullish().default(null),
        top_box: z.number().default(0),
        percentile: z.number().default(0),
      }),
    )
    .default([]),
  priority_index: z
    .array(
      z.object({
        rank: z.number().default(0),
        question: z.string(),
        percentile: z.number().default(0),
        correlation: z.number().default(0),
      }),
    )
    .default([]),
});
type Extraction = z.infer<typeof ExtractionSchema>;

type ChatCompletionResponse = {
  choices?: Array<{ message?: { content?: string | Array<{ type?: string; text?: string }> } }>;
};

function stripJsonResponse(text: string) {
  const withoutFences = text.replace(/```json|```/gi, "").trim();
  const start = withoutFences.indexOf("{");
  const end = withoutFences.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start)
    throw new Error("AI did not return a JSON object");
  return withoutFences.substring(start, end + 1).replace(/,\s*([}\]])/g, "$1");
}

function toTextContent(content: string | Array<{ type?: string; text?: string }> | undefined) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((part) => part.text ?? "").join("\n");
  return "";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function rows(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(asRecord) : [];
}

function textField(source: Record<string, unknown>, keys: string[], fallback = "") {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return fallback;
}

function numberField(source: Record<string, unknown>, keys: string[], fallback: number | null) {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const parsed = Number(
        value
          .replace(/[%,$]/g, "")
          .replace(/(st|nd|rd|th)$/i, "")
          .trim(),
      );
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return fallback;
}

function prepareExtractionInput(input: unknown) {
  const source = asRecord(input);
  const overall = asRecord(source.overall);

  return {
    site_name: textField(source, ["site_name", "siteName", "Site Name"], "Unknown Site"),
    facility_name:
      textField(source, ["facility_name", "facilityName", "Facility Name"], "") || null,
    service_line: textField(source, ["service_line", "serviceLine", "Service Line"], "") || null,
    time_frame: textField(source, ["time_frame", "timeFrame", "Time Frame"], "") || null,
    overall: {
      n: numberField(overall, ["n", "N"], null),
      top_box: numberField(overall, ["top_box", "topBox", "Top Box Score"], 0),
      percentile: numberField(overall, ["percentile", "percentile_rank", "Percentile Rank"], 0),
    },
    trends: rows(source.trends).map((row) => ({
      period: textField(row, ["period", "time_period", "timePeriod", "Time Period"], ""),
      n: numberField(row, ["n", "N"], null),
      top_box: numberField(row, ["top_box", "topBox", "Top Box Score"], null),
      percentile: numberField(row, ["percentile", "percentile_rank", "Percentile Rank"], null),
    })),
    sections: rows(source.sections).map((row) => ({
      name: textField(row, ["name", "section_name", "sectionName", "section", "Section"], ""),
      n: numberField(row, ["n", "N"], null),
      top_box: numberField(row, ["top_box", "topBox", "Top Box Score"], 0),
      percentile: numberField(row, ["percentile", "percentile_rank", "Percentile Rank"], 0),
    })),
    providers: rows(source.providers).map((row) => ({
      name: textField(row, ["name", "provider_name", "providerName", "provider", "Provider"], ""),
      n: numberField(row, ["n", "N"], null),
      top_box: numberField(row, ["top_box", "topBox", "Top Box Score"], 0),
      percentile: numberField(row, ["percentile", "percentile_rank", "Percentile Rank"], 0),
    })),
    priority_index: rows(source.priority_index).map((row) => ({
      rank: numberField(row, ["rank", "current_order", "currentOrder", "Current Order"], 0),
      question: textField(row, ["question", "Question"], ""),
      percentile: numberField(row, ["percentile", "percentile_rank", "Percentile Rank"], 0),
      correlation: numberField(row, ["correlation", "Correlation"], 0),
    })),
  };
}

function normalizeExtraction(extraction: Extraction): Extraction {
  const dedupeByName = <T extends { name: string }>(list: T[]) => {
    const byName = new Map<string, T>();
    for (const row of list) {
      const key = row.name.trim().toLowerCase();
      const existing = byName.get(key);
      if (!existing || JSON.stringify(row).length > JSON.stringify(existing).length)
        byName.set(key, { ...row, name: row.name.trim() });
    }
    return Array.from(byName.values());
  };

  return {
    ...extraction,
    site_name: extraction.site_name?.trim() || "Unknown Site",
    facility_name: extraction.facility_name?.trim() || null,
    service_line: extraction.service_line?.trim() || null,
    time_frame: extraction.time_frame?.trim() || null,
    sections: dedupeByName(extraction.sections).filter((s) => s.name && !/^pg$/i.test(s.name)),
    providers: dedupeByName(extraction.providers).filter(
      (p) => p.name && !/^family medicine$/i.test(p.name),
    ),
    priority_index: extraction.priority_index
      .filter((p) => p.question.trim())
      .sort((a, b) => a.rank - b.rank),
  };
}

async function extractScorecardFromPdf(
  config: { baseURL: string; apiKey: string },
  pdfBase64: string,
  fileName: string,
): Promise<Extraction> {
  const response = await fetch(`${config.baseURL.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: VISION_MODEL,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are a deterministic parser for one fixed Press Ganey Site Scorecard PDF template. Read the PDF itself; do not infer, estimate, or invent data. Return only JSON.",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Map this exact Site Scorecard PDF template into the JSON object below.

HEADER MAPPING:
- site_name: value after "Site Name:"
- facility_name: value after "Facility Name:"
- service_line: value after "Service Line:"
- time_frame: value after "Time Frame:"; include Current Benchmarking Period only if visible and useful.

OVERALL MAPPING:
- Use the first "Service Line Performance" / "PG Likelihood to Recommend" summary table.
- overall.n = row "n"
- overall.top_box = row "Top Box Score" as a number without %
- overall.percentile = row "Percentile Rank"

TRENDS MAPPING:
- Use the "Time Period" table under Service Line Performance or Top Box Score.
- For each year column, create { period, n, top_box, percentile }.

SECTIONS MAPPING:
- Use ONLY the "Section Performance" table with columns Survey Type, Section, n, Top Box Score, Percentile Rank.
- Keep one row per unique Section. Do not duplicate repeated visual rows.

PROVIDERS MAPPING:
- Use ONLY the detailed "Provider" table with columns Provider, n, Top Box Score, Percentile Rank.
- Do not use Specialty Performance rows as providers.

PRIORITY INDEX MAPPING:
- Use ONLY the "Priority Index" table.
- rank = Current Order, question = Question, percentile = Percentile Rank, correlation = Correlation.

Return exactly this JSON shape with numbers as numbers and unknown values as null:
{"site_name":"","facility_name":null,"service_line":null,"time_frame":null,"overall":{"n":null,"top_box":0,"percentile":0},"trends":[{"period":"","n":null,"top_box":null,"percentile":null}],"sections":[{"name":"","n":null,"top_box":0,"percentile":0}],"providers":[{"name":"","n":null,"top_box":0,"percentile":0}],"priority_index":[{"rank":0,"question":"","percentile":0,"correlation":0}]}`,
            },
            {
              type: "file",
              file: {
                filename: fileName,
                file_data: `data:application/pdf;base64,${pdfBase64}`,
              },
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`PDF extraction failed (${response.status}): ${errorText.slice(0, 400)}`);
  }

  const payload = (await response.json()) as ChatCompletionResponse;
  const content = toTextContent(payload.choices?.[0]?.message?.content);
  const parsed = JSON.parse(stripJsonResponse(content));
  return normalizeExtraction(ExtractionSchema.parse(prepareExtractionInput(parsed)));
}

const NarrativeTextSchema = z
  .union([z.string(), z.array(z.string())])
  .transform((value) => (Array.isArray(value) ? value.filter(Boolean).join(" ") : value));

const NarrativeSchema = z.object({
  exec_summary: z
    .string()
    .describe(
      "3-5 sentence plain-language synthesis covering overall performance, strengths, and the biggest opportunity area.",
    ),
  insights: z.object({
    drivers: NarrativeTextSchema.describe("What is driving patient experience here?"),
    focus_this_month: NarrativeTextSchema.describe("What should leaders focus on this month?"),
    risk_if_no_action: NarrativeTextSchema.describe("Biggest risk if no action is taken?"),
  }),
  opportunities: z
    .array(
      z.object({
        title: z.string(),
        goal: z.string().describe("Specific measurable target."),
        drivers: z
          .array(z.string())
          .describe("Specific priority-index items driving this opportunity."),
        actions: z
          .array(
            z.object({
              description: z.string(),
              owner_role: z
                .string()
                .describe("One of: Clinic Manager, Provider, Nurse/MA, Access Center"),
            }),
          )
          .default([]),
        timeline_30: z.string(),
        timeline_60: z.string(),
        timeline_90: z.string(),
      }),
    )
    .default([]),
  coaching: z
    .array(
      z.object({
        provider_name: z.string(),
        gap_summary: z.string().default(""),
        shadow_recommendation: z.string().default(""),
        scripts: z.array(z.string()).default([]),
        checkpoints: z.array(z.string()).default([]),
      }),
    )
    .default([]),
});
type Narrative = z.infer<typeof NarrativeSchema>;

// ---------- Rule engine ----------
function runRuleEngine(e: Extraction) {
  type Opp = {
    title: string;
    opp_type: "section" | "provider" | "high_impact";
    reason: string;
    target_metric: string;
    current_value: number;
    target_value: number;
    score: number;
  };
  const opps: Opp[] = [];

  for (const s of e.sections) {
    if (s.percentile < 90) {
      opps.push({
        title: `Improve ${s.name}`,
        opp_type: "section",
        reason: `Section is at ${s.percentile}th percentile (rule: section < 90th).`,
        target_metric: `${s.name} percentile`,
        current_value: s.percentile,
        target_value: 90,
        score: 90 - s.percentile + 20,
      });
    }
  }
  for (const p of e.providers) {
    if (p.percentile < 50) {
      opps.push({
        title: `Coach ${p.name}`,
        opp_type: "provider",
        reason: `Provider at ${p.percentile}th percentile (rule: provider < 50th).`,
        target_metric: `${p.name} percentile`,
        current_value: p.percentile,
        target_value: 75,
        score: 60 - p.percentile + 30,
      });
    }
  }
  for (const pi of e.priority_index) {
    if (pi.correlation > 0.75 && pi.percentile < 95) {
      opps.push({
        title: `High-impact driver: ${pi.question}`,
        opp_type: "high_impact",
        reason: `Correlation ${pi.correlation.toFixed(2)} with likelihood to recommend, currently at ${pi.percentile}th percentile (rule: corr > 0.75 AND percentile < 95).`,
        target_metric: pi.question,
        current_value: pi.percentile,
        target_value: 95,
        score: pi.correlation * 100 + (95 - pi.percentile),
      });
    }
  }

  const dedup = new Map<string, Opp>();
  for (const o of opps) {
    const prev = dedup.get(o.title);
    if (!prev || o.score > prev.score) dedup.set(o.title, o);
  }
  return Array.from(dedup.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

function classifyProviderTier(percentile: number): "top" | "mid" | "coaching" {
  if (percentile >= 90) return "top";
  if (percentile < 50) return "coaching";
  return "mid";
}

// ---------- Main server function ----------
export const processReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        pdfBase64: z.string().min(100),
        fileName: z.string().default("scorecard.pdf"),
        clinicId: z.string().uuid().nullish(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const aiConfig = getAiConfig();
    if (!aiConfig) throw new Error(AI_NOT_CONFIGURED);
    const { supabase, userId } = context;

    const { data: reportRow, error: insertErr } = await supabase
      .from("reports")
      .insert({
        user_id: userId,
        clinic_id: data.clinicId ?? null,
        site_name: data.fileName.replace(/\.pdf$/i, ""),
        status: "processing",
      })
      .select()
      .single();
    if (insertErr || !reportRow) throw new Error(insertErr?.message ?? "Failed to create report");
    const reportId = reportRow.id;

    try {
      const gateway = createAiProvider(aiConfig);
      const model = gateway(aiConfig.model);

      const extracted = await extractScorecardFromPdf(aiConfig, data.pdfBase64, data.fileName);

      const opps = runRuleEngine(extracted);
      const coachingProviders = extracted.providers.filter((p) => p.percentile < 50);
      const topProviders = extracted.providers.filter((p) => p.percentile >= 90);

      const narrativePrompt = `You are advising a healthcare clinic manager. Generate practical, action-oriented improvement plans. Use the provided extracted data and the ranked opportunities. Do not be generic — every action must be operational and specific to the opportunity. Owner roles must be one of: Clinic Manager, Provider, Nurse/MA, Access Center.

SITE: ${extracted.site_name} | Service line: ${extracted.service_line ?? "n/a"}
OVERALL: ${extracted.overall.top_box}% top box, ${extracted.overall.percentile}th percentile (n=${extracted.overall.n})

SECTIONS: ${JSON.stringify(extracted.sections)}
TOP PROVIDERS (>=90th): ${JSON.stringify(topProviders)}
COACHING-TIER PROVIDERS (<50th): ${JSON.stringify(coachingProviders)}
PRIORITY INDEX (high correlation drivers): ${JSON.stringify(extracted.priority_index)}

RANKED OPPORTUNITIES (use these exact titles in order, generate one plan per opportunity):
${opps.map((o, i) => `${i + 1}. ${o.title} — ${o.reason}`).join("\n")}

Also produce a coaching plan for EACH coaching-tier provider above (use the priority index drivers to identify behavior gaps vs. top performers).`;

      let narrative: Narrative;
      try {
        const narrativeRes = await generateText({
          model,
          prompt: narrativePrompt,
          output: Output.object({ schema: NarrativeSchema }),
        });
        narrative = (narrativeRes as unknown as { output: Narrative }).output;
      } catch (err) {
        console.error("Structured narrative failed, retrying in JSON mode:", err);
        const raw = await generateText({
          model,
          prompt:
            narrativePrompt +
            "\n\nReturn ONLY a JSON object (no markdown, no commentary) with this shape: { exec_summary: string, insights: { drivers, focus_this_month, risk_if_no_action }, opportunities: [{ title, goal, drivers: string[], actions: [{description, owner_role}], timeline_30, timeline_60, timeline_90 }], coaching: [{ provider_name, gap_summary, shadow_recommendation, scripts: string[], checkpoints: string[] }] }",
        });
        const text = raw.text ?? "";
        const start = text.search(/[{[]/);
        const end = text.lastIndexOf("}");
        if (start === -1 || end === -1) throw new Error("AI did not return JSON for narrative");
        const cleaned = text
          .substring(start, end + 1)
          .replace(/```json|```/g, "")
          .replace(/,\s*([}\]])/g, "$1");
        narrative = NarrativeSchema.parse(JSON.parse(cleaned));
      }

      await supabase
        .from("reports")
        .update({
          site_name: extracted.site_name || reportRow.site_name,
          facility_name: extracted.facility_name,
          service_line: extracted.service_line,
          time_frame: extracted.time_frame,
          overall_top_box: extracted.overall.top_box,
          overall_percentile: extracted.overall.percentile,
          n: extracted.overall.n,
          trends: extracted.trends,
          raw_extraction: extracted as never,
          exec_summary: narrative.exec_summary,
          insights: narrative.insights,
          status: "ready",
          updated_at: new Date().toISOString(),
        })
        .eq("id", reportId);

      if (extracted.sections.length) {
        await supabase.from("report_sections").insert(
          extracted.sections.map((s) => ({
            report_id: reportId,
            name: s.name,
            n: s.n,
            top_box: s.top_box,
            percentile: s.percentile,
          })),
        );
      }
      if (extracted.providers.length) {
        await supabase.from("report_providers").insert(
          extracted.providers.map((p) => ({
            report_id: reportId,
            name: p.name,
            n: p.n,
            top_box: p.top_box,
            percentile: p.percentile,
            tier: classifyProviderTier(p.percentile),
          })),
        );
      }
      if (extracted.priority_index.length) {
        await supabase.from("report_priority_index").insert(
          extracted.priority_index.map((pi) => ({
            report_id: reportId,
            rank: pi.rank,
            question: pi.question,
            percentile: pi.percentile,
            correlation: pi.correlation,
          })),
        );
      }

      const oppRows = opps.map((o, i) => {
        const plan = narrative.opportunities[i];
        return {
          report_id: reportId,
          rank: i + 1,
          title: o.title,
          opp_type: o.opp_type,
          reason: o.reason,
          target_metric: o.target_metric,
          current_value: o.current_value,
          target_value: o.target_value,
          goal: plan?.goal ?? `Raise ${o.target_metric} to ${o.target_value}`,
          drivers: plan?.drivers ?? [],
          timeline_30: plan?.timeline_30 ?? "",
          timeline_60: plan?.timeline_60 ?? "",
          timeline_90: plan?.timeline_90 ?? "",
          owner_role: plan?.actions[0]?.owner_role ?? "Clinic Manager",
          actions: plan?.actions ?? [],
        };
      });
      if (oppRows.length) {
        await supabase.from("opportunities").insert(oppRows);
      }

      if (narrative.coaching.length) {
        const { data: provRows } = await supabase
          .from("report_providers")
          .select("id, name")
          .eq("report_id", reportId);
        const provMap = new Map((provRows ?? []).map((p) => [p.name, p.id]));
        await supabase.from("coaching_plans").insert(
          narrative.coaching.map((c) => ({
            report_id: reportId,
            provider_id: provMap.get(c.provider_name) ?? null,
            provider_name: c.provider_name,
            gap_summary: c.gap_summary,
            shadow_recommendation: c.shadow_recommendation,
            scripts: c.scripts,
            checkpoints: c.checkpoints,
          })),
        );
      }

      return { reportId };
    } catch (err) {
      console.error("processReport failed:", err);
      await supabase
        .from("reports")
        .update({
          status: "error",
          error_message: err instanceof Error ? err.message : String(err),
        })
        .eq("id", reportId);
      throw err;
    }
  });

// ---------- List + detail server functions ----------

export const listReports = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("reports")
      .select(
        "id, site_name, facility_name, service_line, time_frame, clinic_id, overall_top_box, overall_percentile, status, created_at",
      )
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ reportId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const [report, sections, providers, priority, opps, coaching] = await Promise.all([
      supabase.from("reports").select("*").eq("id", data.reportId).single(),
      supabase.from("report_sections").select("*").eq("report_id", data.reportId),
      supabase
        .from("report_providers")
        .select("*")
        .eq("report_id", data.reportId)
        .order("percentile", { ascending: false }),
      supabase
        .from("report_priority_index")
        .select("*")
        .eq("report_id", data.reportId)
        .order("rank"),
      supabase.from("opportunities").select("*").eq("report_id", data.reportId).order("rank"),
      supabase.from("coaching_plans").select("*").eq("report_id", data.reportId),
    ]);
    if (report.error) throw new Error(report.error.message);
    return {
      report: report.data,
      sections: sections.data ?? [],
      providers: providers.data ?? [],
      priority: priority.data ?? [],
      opportunities: opps.data ?? [],
      coaching: coaching.data ?? [],
    };
  });

export const deleteReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ reportId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("reports").delete().eq("id", data.reportId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
