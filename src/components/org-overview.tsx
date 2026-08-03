import { useMemo, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { HealthPill } from "@/components/status";
import { ListCard, Row, SectionHeading } from "@/components/primitives";
import { useStore } from "@/lib/store";
import { branchesUnder, metricsFor, type OrgBranch } from "@/lib/domain/org";
import { clinicHealth } from "@/lib/domain/health";
import { ROLE_LABELS, type Person } from "@/data/types";

/**
 * TOP-DOWN view of the org.
 *
 * This one component replaces the four near-identical dashboard variants
 * (Manager/Director/ExecutiveDirector/Cao) that each hand-rolled their own
 * roll-up table. Instead of hard-coding a level per role, it walks the real
 * reporting tree: you start at yourself and drill until you hit managers,
 * then clinics. A manager simply has no branches and sees clinics directly.
 */
export function OrgDrilldown() {
  const { currentUser, scope, graph } = useStore();
  const [path, setPath] = useState<Person[]>([]);

  const focus = path[path.length - 1] ?? currentUser;
  // Roll-ups score every clinic in the subtree, so this must not re-run on
  // every render — it's the heaviest computation on the phone home screen.
  const branches = useMemo(
    () => branchesUnder(graph, focus, scope.rounds, scope.tasks),
    [graph, focus, scope.rounds, scope.tasks],
  );

  if (branches.length === 0) return <ClinicList person={focus} />;

  return (
    <section className="space-y-3">
      <SectionHeading
        title={path.length ? `${focus.name}'s team` : "My organization"}
        description="Worst health first. Tap to drill in."
        action={
          path.length ? (
            <Button
              variant="ghost"
              size="sm"
              className="gap-1"
              onClick={() => setPath((p) => p.slice(0, -1))}
            >
              <ChevronLeft className="h-4 w-4" />
              Back
            </Button>
          ) : null
        }
      />

      {path.length ? (
        <nav aria-label="Breadcrumb" className="scroll-rail -mx-4 px-4 text-xs">
          <button
            type="button"
            onClick={() => setPath([])}
            className="text-muted-foreground hover:underline"
          >
            {currentUser.name}
          </button>
          {path.map((p, i) => (
            <span key={p.id} className="flex items-center gap-1 text-muted-foreground">
              <span aria-hidden>/</span>
              <button
                type="button"
                onClick={() => setPath((prev) => prev.slice(0, i + 1))}
                className="hover:underline"
              >
                {p.name}
              </button>
            </span>
          ))}
        </nav>
      ) : null}

      <ListCard>
        {branches.map((b) => (
          <BranchRow
            key={b.person.id}
            branch={b}
            onDrill={b.hasChildren ? () => setPath((p) => [...p, b.person]) : undefined}
          />
        ))}
      </ListCard>
    </section>
  );
}

function BranchRow({ branch, onDrill }: { branch: OrgBranch; onDrill?: () => void }) {
  const { metrics: m, person } = branch;
  const flags = [
    m.roundingGaps ? `${m.roundingGaps} not rounded 30d` : null,
    m.overdueTasks ? `${m.overdueTasks} overdue` : null,
    m.escalatedTasks ? `${m.escalatedTasks} escalated` : null,
    m.safetyTasks ? `${m.safetyTasks} safety` : null,
  ].filter(Boolean);

  return (
    <Row
      title={person.name}
      subtitle={`${ROLE_LABELS[person.role]} · ${m.clinicCount} clinic${
        m.clinicCount === 1 ? "" : "s"
      }${flags.length ? ` · ${flags.join(" · ")}` : " · on track"}`}
      right={<HealthPill score={m.avgHealth} band={m.band} />}
      onClick={onDrill}
    />
  );
}

/** Leaf of the drilldown: the individual clinics a manager is accountable for. */
function ClinicList({ person }: { person: Person }) {
  const { scope, graph } = useStore();
  const clinics = useMemo(
    () =>
      graph
        .clinicsInScope(person)
        .map((c) => ({ clinic: c, health: clinicHealth(c, scope.rounds, scope.tasks) }))
        .sort((a, b) => a.health.score - b.health.score),
    [graph, person, scope.rounds, scope.tasks],
  );

  if (!clinics.length) {
    return (
      <Card className="p-6 text-center text-sm text-muted-foreground">
        No clinics are assigned to {person.name} yet.
      </Card>
    );
  }

  return (
    <section className="space-y-3">
      <SectionHeading title="My clinics" description="Lowest health score first." />
      <ListCard>
        {clinics.map(({ clinic, health }) => (
          <Row
            key={clinic.id}
            to="/clinics/$clinicId"
            params={{ clinicId: clinic.id }}
            title={clinic.name}
            subtitle={
              health.lastRoundDays === null
                ? "Never rounded"
                : `Rounded ${health.lastRoundDays}d ago · ${health.openTasks} open · ${health.overdueTasks} overdue`
            }
            right={<HealthPill score={health.score} band={health.band} />}
          />
        ))}
      </ListCard>
    </section>
  );
}

/** Compact scope summary used at the top of Today. */
export function useScopeMetrics() {
  const { scope } = useStore();
  return useMemo(
    () => metricsFor(scope.clinics, scope.rounds, scope.tasks),
    [scope.clinics, scope.rounds, scope.tasks],
  );
}
