import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EscalationBadge } from "@/components/status";
import { HealthDot, BAND_WORD } from "@/components/health-ring";
import { clinicHealth } from "@/lib/domain/health";
import { EmptyState, SectionHeading } from "@/components/primitives";
import { VoiceButton, VoiceTextarea } from "@/components/voice-input";
import { useStore } from "@/lib/store";
import {
  THEMES,
  WIN_CATEGORIES,
  type EscalationLevel,
  type RoundAnswers,
  type RoundedRole,
  type TaskPriority,
  type WinCategory,
} from "@/data/types";
import { allowedEscalationLevels, suggestEscalation } from "@/lib/domain/escalation";
import { isOpenStatus } from "@/lib/domain/time";
import { assignmentCandidates } from "@/lib/domain/org";
import { summarizeRound } from "@/lib/ai.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/rounds/new")({
  validateSearch: (s: Record<string, unknown>) => ({
    clinicId: typeof s.clinicId === "string" ? s.clinicId : undefined,
  }),
  head: () => ({
    meta: [
      { title: "New round — Round Robin" },
      {
        name: "description",
        content:
          "Log a structured leadership rounding conversation by voice, validate open issues and create action items with smart escalation.",
      },
      { property: "og:title", content: "Log a leadership round" },
      {
        property: "og:description",
        content: "Voice-first rounding capture with AI summarization and escalation routing.",
      },
    ],
  }),
  component: NewRound,
});

const QUESTIONS: { key: keyof RoundAnswers; label: string; placeholder: string }[] = [
  {
    key: "workingWell",
    label: "What is working well right now?",
    placeholder: "Wins, improvements, team strengths…",
  },
  {
    key: "barriers",
    label: "What barriers are getting in your way?",
    placeholder: "Operational barriers preventing good work…",
  },
  {
    key: "accessChallenges",
    label: "Where are patients struggling to get access?",
    placeholder: "Third next available, template gaps, referral backlog…",
  },
  {
    key: "workflowConcerns",
    label: "Which workflows need attention?",
    placeholder: "Rooming, check-in, in-basket, prior auth…",
  },
  {
    key: "safetyConcerns",
    label: "Any safety or quality concerns?",
    placeholder: "Near misses, equipment, medication handling…",
  },
  {
    key: "leadershipSupport",
    label: "How can leadership support you?",
    placeholder: "Requests for leadership action…",
  },
  { key: "additionalComments", label: "Anything else?", placeholder: "Optional" },
];

const STEPS = ["Who", "Conversation", "Follow-up", "Review"] as const;

interface DraftTask {
  key: string;
  title: string;
  description: string;
  priority: TaskPriority;
  theme: string;
  safetyRelated: boolean;
  dueInDays: number;
  ownerId?: string;
  overrideLevel?: EscalationLevel;
  overrideReason: string;
}

const emptyAnswers: RoundAnswers = {
  workingWell: "",
  barriers: "",
  accessChallenges: "",
  workflowConcerns: "",
  safetyConcerns: "",
  leadershipSupport: "",
  additionalComments: "",
};

function newDraft(): DraftTask {
  return {
    key: Math.random().toString(36).slice(2),
    title: "",
    description: "",
    priority: "Medium",
    theme: THEMES[0],
    safetyRelated: false,
    dueInDays: 14,
    overrideReason: "",
  };
}

/**
 * Voice-first rounding composer.
 *
 * Restructured from one 700-line scroll into four steps, because the whole
 * point is that a manager fills this in standing in a hallway on a phone.
 * Every free-text field takes dictation; the person reviews the transcript
 * before it becomes part of the record.
 */
function NewRound() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const { scope, data, graph, currentUser, addRound, addTask, updateTaskStatus, today } =
    useStore();

  const [step, setStep] = useState(0);
  const [clinicId, setClinicId] = useState(search.clinicId ?? scope.clinics[0]?.id ?? "");
  const [individual, setIndividual] = useState("");
  const [role, setRole] = useState<RoundedRole>("Provider");
  const [answers, setAnswers] = useState<RoundAnswers>(emptyAnswers);
  const [themes, setThemes] = useState<string[]>([]);
  const [safetyFlag, setSafetyFlag] = useState(false);
  const [hasWin, setHasWin] = useState(false);
  const [winText, setWinText] = useState("");
  const [winRecognized, setWinRecognized] = useState("");
  const [winCategory, setWinCategory] = useState<WinCategory>(WIN_CATEGORIES[0]);
  const [drafts, setDrafts] = useState<DraftTask[]>([]);
  const [validations, setValidations] = useState<Record<string, "resolved" | "not_resolved">>({});
  const [aiLoading, setAiLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [ai, setAi] = useState<{
    executiveSummary: string;
    keyBarriers: string[];
    suggestedActions: string[];
  } | null>(null);

  const clinicName = scope.clinics.find((c) => c.id === clinicId)?.name ?? "Clinic";

  // Clinics ordered worst-health-first, so the pick list nudges toward the
  // place that actually needs a visit.
  const clinicOptions = useMemo(
    () =>
      scope.clinics
        .map((c) => ({ clinic: c, health: clinicHealth(c, scope.rounds, scope.tasks) }))
        .sort((a, b) => a.health.score - b.health.score),
    [scope.clinics, scope.rounds, scope.tasks],
  );
  const selectedHealth = clinicOptions.find((o) => o.clinic.id === clinicId)?.health;

  // Everyone previously rounded with — this clinic first, then the wider scope.
  const knownPeople = useMemo(() => {
    const here: string[] = [];
    const elsewhere: string[] = [];
    for (const r of scope.rounds) {
      const name = r.individual?.trim();
      if (!name) continue;
      (r.clinicId === clinicId ? here : elsewhere).push(name);
    }
    return [...new Set([...here, ...elsewhere])].slice(0, 40);
  }, [scope.rounds, clinicId]);

  const openIssues = useMemo(
    () => data.tasks.filter((t) => t.clinicId === clinicId && isOpenStatus(t)),
    [data.tasks, clinicId],
  );

  const notesBlob = useMemo(
    () =>
      QUESTIONS.map((q) => `${q.label}\n${answers[q.key] || "(no response)"}`)
        .join("\n\n")
        .trim(),
    [answers],
  );

  const hasContent = QUESTIONS.some((q) => answers[q.key].trim().length > 0);
  const whoComplete = Boolean(clinicId && individual.trim());

  const setAnswer = (key: keyof RoundAnswers) => (value: string) =>
    setAnswers((prev) => ({ ...prev, [key]: value }));

  const toggleTheme = (t: string) =>
    setThemes((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));

  async function runAi() {
    if (!hasContent) {
      toast.error("Capture some of the conversation first.");
      return;
    }
    setAiLoading(true);
    try {
      const res = await summarizeRound({
        data: { notes: notesBlob, clinic: clinicName, role },
      });
      if ("error" in res) toast.error(res.error);
      else {
        setAi(res.summary);
        toast.success("AI summary ready");
      }
    } catch {
      toast.error("AI request failed. Try again.");
    } finally {
      setAiLoading(false);
    }
  }

  function addDraftFromAction(action: string) {
    setDrafts((d) => [...d, { ...newDraft(), title: action.slice(0, 90), description: action }]);
    toast.success("Added to action items");
  }

  function suggestionFor(draft: DraftTask) {
    return suggestEscalation({
      priority: draft.priority,
      safetyRelated: draft.safetyRelated,
      theme: draft.theme,
      createdAt: today.toISOString(),
      clinicId,
      allTasks: data.tasks,
    });
  }

  const updateDraft = (key: string, patch: Partial<DraftTask>) =>
    setDrafts((d) => d.map((x) => (x.key === key ? { ...x, ...patch } : x)));

  async function submit() {
    if (!whoComplete || !hasContent) {
      toast.error("Select a clinic, name the person and capture at least one answer.");
      return;
    }
    setSaving(true);
    try {
      const round = await addRound({
        clinicId,
        date: today.toISOString(),
        managerId: currentUser.id,
        individual: individual.trim(),
        individualRole: role,
        notes: ai?.executiveSummary || answers.barriers || answers.workingWell,
        answers,
        themes: themes.length ? themes : ["Staffing"],
        safetyFlag,
        win:
          hasWin && winText.trim()
            ? {
                text: winText.trim(),
                recognized: winRecognized.trim() || undefined,
                category: winCategory,
              }
            : undefined,
      });

      Object.entries(validations).forEach(([taskId, outcome]) => {
        updateTaskStatus(
          taskId,
          outcome === "resolved" ? "Closed" : "Reopened",
          outcome === "resolved"
            ? "Confirmed resolved during rounding"
            : "Staff reported issue is still present",
          round.id,
        );
      });

      drafts
        .filter((d) => d.title.trim())
        .forEach((d) => {
          const suggestion = suggestionFor(d);
          const level = d.overrideLevel ?? suggestion.level;
          // Default the owner to the person actually accountable at that tier
          // for this clinic, rather than whoever happens to be logging.
          const routed = assignmentCandidates(graph, clinicId, level).find((c) => c.recommended);
          addTask({
            title: d.title.trim(),
            description: d.description.trim() || d.title.trim(),
            clinicId,
            roundId: round.id,
            ownerId: d.ownerId ?? routed?.person.id ?? currentUser.id,
            priority: d.priority,
            dueDate: new Date(today.getTime() + d.dueInDays * 86400000).toISOString(),
            status: "Open",
            escalation: level,
            escalationOverridden: Boolean(d.overrideLevel && d.overrideLevel !== suggestion.level),
            overrideReason: d.overrideReason || undefined,
            theme: d.theme,
            safetyRelated: d.safetyRelated,
            createdAt: today.toISOString(),
          });
        });

      toast.success("Round logged");
      navigate({ to: "/rounds/$roundId", params: { roundId: round.id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save this round.");
    } finally {
      setSaving(false);
    }
  }

  const canAdvance = step === 0 ? whoComplete : step === 1 ? hasContent : true;

  return (
    <div className="space-y-5 pb-28">
      <StepBar step={step} onSelect={setStep} canAdvance={canAdvance} />

      {step === 0 ? (
        <Card className="gap-4 p-4">
          <div className="space-y-2">
            <Label htmlFor="clinic">Clinic</Label>
            <Select value={clinicId} onValueChange={setClinicId}>
              <SelectTrigger id="clinic" className="h-12 w-full text-base">
                <SelectValue placeholder="Select clinic" />
              </SelectTrigger>
              <SelectContent className="max-h-[60vh]">
                {/* Worst health first, with a colour dot and days-since — so the
                    clinic that most needs a visit is the easiest one to pick. */}
                {clinicOptions.map(({ clinic, health }) => (
                  <SelectItem key={clinic.id} value={clinic.id}>
                    <span className="flex w-full items-center gap-2.5">
                      <HealthDot band={health.band} />
                      <span className="min-w-0 flex-1 truncate">{clinic.name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                        {health.score} ·{" "}
                        {health.lastRoundDays === null ? "never" : `${health.lastRoundDays}d`}
                      </span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedHealth ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <HealthDot band={selectedHealth.band} />
                {BAND_WORD[selectedHealth.band]} · {selectedHealth.openTasks} open ·{" "}
                {selectedHealth.lastRoundDays === null
                  ? "never visited"
                  : `last visit ${selectedHealth.lastRoundDays}d ago`}
              </p>
            ) : null}
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="individual">Person rounded with</Label>
              <VoiceButton
                label="Say name"
                context="Name of the staff member being rounded with"
                onTranscript={(t) => setIndividual(t.replace(/[.]+$/, "").slice(0, 80))}
              />
            </div>
            <Input
              id="individual"
              list="rr-people"
              value={individual}
              onChange={(e) => setIndividual(e.target.value)}
              placeholder="Start typing, or pick someone you've rounded with"
              maxLength={80}
              className="h-12 text-base"
              autoComplete="off"
            />
            {/* Names already rounded with, this clinic first. A native datalist
                keeps the phone keyboard behaviour and needs no extra library. */}
            <datalist id="rr-people">
              {knownPeople.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
            {knownPeople.length ? (
              <div className="scroll-rail -mx-1 px-1 pt-1">
                {knownPeople.slice(0, 6).map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setIndividual(n)}
                    className={cn(
                      "press h-9 rounded-full border px-3.5 text-sm whitespace-nowrap",
                      individual === n
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-card text-muted-foreground",
                    )}
                  >
                    {n}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="rounded-role">Their role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as RoundedRole)}>
              <SelectTrigger id="rounded-role" className="h-11 w-full text-base">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(["Provider", "Clinical Staff", "Front Office Staff"] as RoundedRole[]).map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </Card>
      ) : null}

      {step === 1 ? (
        <div className="space-y-5">
          <Card className="gap-4 p-4">
            {QUESTIONS.map((q) => (
              <VoiceTextarea
                key={q.key}
                id={q.key}
                label={q.label}
                placeholder={q.placeholder}
                value={answers[q.key]}
                onChange={setAnswer(q.key)}
                context={`Leadership rounding at ${clinicName}. Question: ${q.label}`}
                rows={3}
              />
            ))}
            <div className="flex items-center justify-between gap-3 rounded-lg bg-critical-soft/50 p-3">
              <Label htmlFor="safety" className="text-sm">
                Flag this round as safety related
              </Label>
              <Switch id="safety" checked={safetyFlag} onCheckedChange={setSafetyFlag} />
            </div>
          </Card>

          <section className="space-y-3">
            <SectionHeading title="Themes" description="Tag what this conversation was about." />
            <div className="flex flex-wrap gap-2">
              {THEMES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => toggleTheme(t)}
                  aria-pressed={themes.includes(t)}
                  className={cn(
                    "press h-9 rounded-full border px-3.5 text-sm font-medium",
                    themes.includes(t)
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card text-muted-foreground",
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
          </section>

          <Card className="gap-4 p-4">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="has-win" className="text-sm">
                Log a win from this conversation
              </Label>
              <Switch id="has-win" checked={hasWin} onCheckedChange={setHasWin} />
            </div>
            {hasWin ? (
              <>
                <VoiceTextarea
                  id="win-text"
                  label="What was the win?"
                  value={winText}
                  onChange={setWinText}
                  context="A win or success story from a leadership rounding conversation"
                  rows={2}
                />
                <div className="space-y-2">
                  <Label htmlFor="win-person">Recognize someone (optional)</Label>
                  <Input
                    id="win-person"
                    value={winRecognized}
                    onChange={(e) => setWinRecognized(e.target.value)}
                    className="h-11 text-base"
                    maxLength={80}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="win-category">Category</Label>
                  <Select
                    value={winCategory}
                    onValueChange={(v) => setWinCategory(v as WinCategory)}
                  >
                    <SelectTrigger id="win-category" className="h-11 w-full text-base">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {WIN_CATEGORIES.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            ) : null}
          </Card>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="space-y-5">
          <section className="space-y-3">
            <SectionHeading
              title="Validate open issues"
              description={`${openIssues.length} open at ${clinicName}. Ask whether they actually got better.`}
            />
            {openIssues.length ? (
              <Card className="gap-0 divide-y divide-border p-0">
                {openIssues.slice(0, 12).map((t) => (
                  <div key={t.id} className="space-y-2 p-4">
                    <p className="text-sm font-medium">{t.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {t.theme} · due {new Date(t.dueDate).toLocaleDateString()}
                    </p>
                    <div className="flex gap-2">
                      {(["resolved", "not_resolved"] as const).map((outcome) => (
                        <Button
                          key={outcome}
                          type="button"
                          size="sm"
                          variant={validations[t.id] === outcome ? "default" : "outline"}
                          className="h-9 flex-1"
                          onClick={() =>
                            setValidations((v) =>
                              v[t.id] === outcome
                                ? Object.fromEntries(
                                    Object.entries(v).filter(([k]) => k !== t.id),
                                  )
                                : { ...v, [t.id]: outcome },
                            )
                          }
                        >
                          {outcome === "resolved" ? "Resolved" : "Still a problem"}
                        </Button>
                      ))}
                    </div>
                  </div>
                ))}
              </Card>
            ) : (
              <EmptyState title="No open issues at this clinic" />
            )}
          </section>

          <section className="space-y-3">
            <SectionHeading
              title="New action items"
              description="Each one gets an owner and an escalation tier automatically."
              action={
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  onClick={() => setDrafts((d) => [...d, newDraft()])}
                >
                  <Plus className="h-4 w-4" />
                  Add
                </Button>
              }
            />
            {drafts.length ? (
              drafts.map((d) => (
                <DraftCard
                  key={d.key}
                  draft={d}
                  clinicId={clinicId}
                  suggestion={suggestionFor(d)}
                  onChange={(patch) => updateDraft(d.key, patch)}
                  onRemove={() => setDrafts((x) => x.filter((y) => y.key !== d.key))}
                />
              ))
            ) : (
              <EmptyState
                title="No action items yet"
                description="Add them here, or generate suggestions from the AI summary on the next step."
              />
            )}
          </section>
        </div>
      ) : null}

      {step === 3 ? (
        <div className="space-y-5">
          <Button
            onClick={runAi}
            disabled={aiLoading || !hasContent}
            variant="outline"
            className="w-full gap-2"
          >
            {aiLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {aiLoading ? "Summarizing…" : "Summarize this conversation"}
          </Button>

          {ai ? (
            <Card className="gap-4 p-4">
              <div>
                <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Executive summary
                </p>
                <p className="mt-1 text-sm">{ai.executiveSummary}</p>
              </div>
              {ai.keyBarriers.length ? (
                <div>
                  <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    Key barriers
                  </p>
                  <ul className="mt-1 space-y-1 text-sm text-muted-foreground">
                    {ai.keyBarriers.map((b) => (
                      <li key={b}>• {b}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {ai.suggestedActions.length ? (
                <div className="space-y-2">
                  <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    Suggested actions
                  </p>
                  {ai.suggestedActions.map((a) => (
                    <div
                      key={a}
                      className="flex items-start gap-2 rounded-lg border border-border p-2.5"
                    >
                      <p className="min-w-0 flex-1 text-sm">{a}</p>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 shrink-0"
                        onClick={() => addDraftFromAction(a)}
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : null}
            </Card>
          ) : null}

          <Card className="gap-2 p-4">
            <p className="text-sm font-semibold">Ready to save</p>
            <p className="text-sm text-muted-foreground">
              {individual || "—"} · {role} · {clinicName}
            </p>
            <p className="text-sm text-muted-foreground">
              {Object.keys(validations).length} issue
              {Object.keys(validations).length === 1 ? "" : "s"} validated ·{" "}
              {drafts.filter((d) => d.title.trim()).length} new action item
              {drafts.filter((d) => d.title.trim()).length === 1 ? "" : "s"}
              {safetyFlag ? " · safety flagged" : ""}
            </p>
          </Card>
        </div>
      ) : null}

      {/* Sticky action bar, parked above the bottom tab bar on mobile. */}
      <div
        className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 px-4 py-3 backdrop-blur-lg lg:static lg:border-0 lg:bg-transparent lg:px-0 lg:backdrop-blur-none"
        style={{ paddingBottom: "calc(var(--tabbar-h) + env(safe-area-inset-bottom, 0px) + 0.5rem)" }}
      >
        <div className="mx-auto flex max-w-6xl gap-2">
          {step > 0 ? (
            <Button
              variant="outline"
              className="h-11 gap-1.5"
              onClick={() => setStep((s) => s - 1)}
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
          ) : null}
          {step < STEPS.length - 1 ? (
            <Button
              className="h-11 flex-1 gap-1.5"
              disabled={!canAdvance}
              onClick={() => setStep((s) => s + 1)}
            >
              Next: {STEPS[step + 1]}
              <ArrowRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button className="h-11 flex-1 gap-1.5" disabled={saving} onClick={submit}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {saving ? "Saving…" : "Save round"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function StepBar({
  step,
  onSelect,
  canAdvance,
}: {
  step: number;
  onSelect: (n: number) => void;
  canAdvance: boolean;
}) {
  return (
    <div>
      <div className="flex gap-1.5" role="tablist" aria-label="Round steps">
        {STEPS.map((s, i) => (
          <button
            key={s}
            type="button"
            role="tab"
            aria-selected={i === step}
            // Only allow jumping backwards, or forwards one step when valid.
            disabled={i > step && !(i === step + 1 && canAdvance)}
            onClick={() => onSelect(i)}
            className={cn(
              "h-1.5 flex-1 rounded-full transition-colors disabled:cursor-not-allowed",
              i <= step ? "bg-primary" : "bg-border",
            )}
          >
            <span className="sr-only">{s}</span>
          </button>
        ))}
      </div>
      <p className="mt-2 text-sm font-medium">
        Step {step + 1} of {STEPS.length} · {STEPS[step]}
      </p>
    </div>
  );
}

function DraftCard({
  draft,
  clinicId,
  suggestion,
  onChange,
  onRemove,
}: {
  draft: DraftTask;
  clinicId: string;
  suggestion: { level: EscalationLevel; reasons: string[] };
  onChange: (patch: Partial<DraftTask>) => void;
  onRemove: () => void;
}) {
  const { graph } = useStore();
  const level = draft.overrideLevel ?? suggestion.level;
  // Ownership options are ranked by the org graph: the person accountable at
  // this escalation tier for this clinic comes first and is pre-selected.
  const candidates = assignmentCandidates(graph, clinicId, level);
  const ownerId = draft.ownerId ?? candidates.find((c) => c.recommended)?.person.id ?? "";

  return (
    <Card className="gap-3 p-4">
      <div className="flex items-start gap-2">
        <Input
          value={draft.title}
          onChange={(e) => onChange({ title: e.target.value })}
          placeholder="What needs to happen?"
          maxLength={90}
          className="h-11 text-base"
        />
        <Button
          variant="ghost"
          size="icon"
          className="tap-target shrink-0 text-muted-foreground"
          aria-label="Remove action item"
          onClick={onRemove}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <VoiceTextarea
        label="Detail"
        value={draft.description}
        onChange={(v) => onChange({ description: v })}
        context="Detail for a rounding action item"
        rows={2}
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Owner</Label>
          <Select value={ownerId} onValueChange={(v) => onChange({ ownerId: v })}>
            <SelectTrigger className="h-11 w-full text-base">
              <SelectValue placeholder="Assign to…" />
            </SelectTrigger>
            <SelectContent>
              {candidates.map((c) => (
                <SelectItem key={c.person.id} value={c.person.id}>
                  {c.person.name}
                  {c.recommended ? " · accountable" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Theme</Label>
          <Select value={draft.theme} onValueChange={(v) => onChange({ theme: v })}>
            <SelectTrigger className="h-11 w-full text-base">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {THEMES.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Priority</Label>
          <Select
            value={draft.priority}
            onValueChange={(v) => onChange({ priority: v as TaskPriority })}
          >
            <SelectTrigger className="h-11 w-full text-base">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(["Low", "Medium", "High", "Critical"] as TaskPriority[]).map((p) => (
                <SelectItem key={p} value={p}>
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Due in</Label>
          <Select
            value={String(draft.dueInDays)}
            onValueChange={(v) => onChange({ dueInDays: Number(v) })}
          >
            <SelectTrigger className="h-11 w-full text-base">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[3, 7, 14, 30, 60].map((d) => (
                <SelectItem key={d} value={String(d)}>
                  {d} days
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/50 p-3">
        <Label htmlFor={`safety-${draft.key}`} className="text-sm">
          Safety related
        </Label>
        <Switch
          id={`safety-${draft.key}`}
          checked={draft.safetyRelated}
          onCheckedChange={(v) => onChange({ safetyRelated: v })}
        />
      </div>

      <div className="space-y-2 rounded-lg border border-border p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Routes to</span>
          <EscalationBadge level={level} />
          {draft.overrideLevel && draft.overrideLevel !== suggestion.level ? (
            <Badge variant="outline" className="text-[10px]">
              overridden
            </Badge>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">{suggestion.reasons[0]}</p>
        <Select
          value={level}
          onValueChange={(v) =>
            onChange({
              overrideLevel: v === suggestion.level ? undefined : (v as EscalationLevel),
            })
          }
        >
          <SelectTrigger className="h-10 w-full text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {allowedEscalationLevels(suggestion.level).map((l) => (
              <SelectItem key={l} value={l}>
                {l}
                {l === suggestion.level ? " · suggested" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {draft.overrideLevel && draft.overrideLevel !== suggestion.level ? (
          <Input
            value={draft.overrideReason}
            onChange={(e) => onChange({ overrideReason: e.target.value })}
            placeholder="Why are you overriding the suggested tier?"
            className="h-10 text-sm"
            maxLength={140}
          />
        ) : null}
      </div>
    </Card>
  );
}
