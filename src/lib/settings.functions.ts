import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { DEFAULT_ESCALATION_SETTINGS, type EscalationSettings } from "./domain/policy";

/**
 * Escalation thresholds, per division.
 *
 * Readable by anyone signed in — the suggestion engine runs client-side and
 * needs them. Writable only by an Executive Director for their own division,
 * or an admin for any of them, which the database enforces rather than this
 * file.
 */

interface SettingsRow {
  division: string | null;
  director_days: number;
  executive_days: number;
  safety_director_days: number;
  safety_executive_days: number;
  repeat_same_clinic: number;
  spread_clinics: number;
  enterprise_clinics: number;
  excluded_themes: string[] | null;
}

const toSettings = (r: SettingsRow): EscalationSettings => ({
  division: r.division,
  directorDays: r.director_days,
  executiveDays: r.executive_days,
  safetyDirectorDays: r.safety_director_days,
  safetyExecutiveDays: r.safety_executive_days,
  repeatSameClinic: r.repeat_same_clinic,
  spreadClinics: r.spread_clinics,
  enterpriseClinics: r.enterprise_clinics,
  excludedThemes: r.excluded_themes ?? [],
});

export const listEscalationSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<EscalationSettings[]> => {
    const { data, error } = await context.supabase
      .from("escalation_settings")
      .select(
        "division, director_days, executive_days, safety_director_days, safety_executive_days, repeat_same_clinic, spread_clinics, enterprise_clinics, excluded_themes",
      );
    // Missing table or no rows must not break the app — the engine falls back
    // to the built-in defaults.
    if (error) {
      console.warn("[settings] falling back to defaults:", error.message);
      return [DEFAULT_ESCALATION_SETTINGS];
    }
    const rows = (data ?? []) as SettingsRow[];
    return rows.length ? rows.map(toSettings) : [DEFAULT_ESCALATION_SETTINGS];
  });

export const saveEscalationSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        division: z.string().max(80).nullable(),
        directorDays: z.number().int().min(1).max(365),
        executiveDays: z.number().int().min(2).max(730),
        safetyDirectorDays: z.number().int().min(1).max(365),
        safetyExecutiveDays: z.number().int().min(1).max(365),
        repeatSameClinic: z.number().int().min(2).max(20),
        spreadClinics: z.number().int().min(2).max(50),
        enterpriseClinics: z.number().int().min(2).max(100),
        excludedThemes: z.array(z.string().max(60)).max(20),
      })
      .refine((v) => v.executiveDays > v.directorDays, {
        message: "The executive threshold has to be longer than the director one",
        path: ["executiveDays"],
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("set_escalation_settings", {
      _division: data.division,
      _director_days: data.directorDays,
      _executive_days: data.executiveDays,
      _safety_director_days: data.safetyDirectorDays,
      _safety_executive_days: data.safetyExecutiveDays,
      _repeat_same_clinic: data.repeatSameClinic,
      _spread_clinics: data.spreadClinics,
      _enterprise_clinics: data.enterpriseClinics,
      _excluded_themes: data.excludedThemes,
    });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
