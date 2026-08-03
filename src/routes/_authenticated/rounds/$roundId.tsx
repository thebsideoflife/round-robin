import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SectionHeading } from "@/components/stat-card";
import { TaskRow } from "@/components/task-row";
import { WinCard } from "@/components/win-card";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/_authenticated/rounds/$roundId")({
  head: () => ({
    meta: [
      { title: "Round detail — Round Robin" },
      {
        name: "description",
        content: "Full rounding conversation, structured answers, themes and linked action items.",
      },
      { property: "og:title", content: "Round detail" },
      { property: "og:description", content: "Rounding conversation detail and follow-up items." },
    ],
  }),
  component: RoundDetail,
  notFoundComponent: () => <p className="text-sm text-muted-foreground">Round not found.</p>,
});

const QUESTIONS: { key: keyof import("@/data/types").RoundAnswers; label: string }[] = [
  { key: "workingWell", label: "What is working well?" },
  { key: "barriers", label: "What barriers are getting in your way?" },
  { key: "accessChallenges", label: "Where are patients struggling to get access?" },
  { key: "workflowConcerns", label: "Which workflows need attention?" },
  { key: "safetyConcerns", label: "Any safety or quality concerns?" },
  { key: "leadershipSupport", label: "How can leadership support you?" },
  { key: "additionalComments", label: "Anything else?" },
];

function RoundDetail() {
  const { roundId } = Route.useParams();
  const { data, clinicById, personById } = useStore();
  const round = data.rounds.find((r) => r.id === roundId);
  if (!round) throw notFound();
  const clinic = clinicById(round.clinicId);
  const tasks = data.tasks.filter((t) => t.roundId === round.id);

  return (
    <div className="space-y-6">
      <div>
        <Link to="/rounds" className="text-sm text-muted-foreground hover:underline">
          ← Rounding log
        </Link>
        <h1 className="mt-2 text-xl font-semibold sm:text-2xl">
          {round.individual} · {round.individualRole}
        </h1>
        <p className="text-sm text-muted-foreground">
          {clinic?.name} · {new Date(round.date).toLocaleDateString()} · rounded by{" "}
          {personById(round.managerId)?.name}
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {round.safetyFlag ? (
          <Badge className="bg-critical-soft text-critical">Safety flagged</Badge>
        ) : null}
        {round.themes.map((t) => (
          <Badge key={t} variant="outline">
            {t}
          </Badge>
        ))}
      </div>

      {round.win?.text ? (
        <section className="space-y-3">
          <SectionHeading title="Win from this round" />
          <WinCard round={round} clinicName={clinic?.name} linkToRound={false} />
        </section>
      ) : null}

      <Card className="gap-4 p-4">
        {QUESTIONS.map((q) => (
          <div key={q.key}>
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {q.label}
            </p>
            <p className="mt-1 text-sm">{round.answers[q.key] || "—"}</p>
          </div>
        ))}
      </Card>

      <section className="space-y-3">
        <SectionHeading title="Action items from this round" />
        {tasks.length ? (
          <div className="space-y-3">
            {tasks.map((t) => (
              <TaskRow key={t.id} task={t} clinicName={clinic?.name ?? ""} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No action items were created.</p>
        )}
      </section>
    </div>
  );
}
