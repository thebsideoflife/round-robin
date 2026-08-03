import { Link } from "@tanstack/react-router";
import { PartyPopper, Star } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Round } from "@/data/types";

export function WinCard({
  round,
  clinicName,
  linkToRound = true,
}: {
  round: Round;
  clinicName?: string;
  linkToRound?: boolean;
}) {
  if (!round.win) return null;
  const win = round.win;

  const body = (
    <Card className="gap-3 border-success/30 bg-success-soft/40 p-4">
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-success-soft text-success">
          <PartyPopper className="h-4 w-4" />
        </span>
        <div className="min-w-0 space-y-2">
          <p className="text-sm">{win.text}</p>
          <div className="flex flex-wrap items-center gap-1.5">
            {win.recognized ? (
              <Badge className="bg-success-soft text-success">
                <Star className="h-3 w-3" />
                {win.recognized}
              </Badge>
            ) : null}
            <Badge variant="outline">{win.category}</Badge>
            {clinicName ? (
              <span className="text-xs text-muted-foreground">{clinicName}</span>
            ) : null}
            <span className="text-xs text-muted-foreground">
              · {new Date(round.date).toLocaleDateString()}
            </span>
          </div>
        </div>
      </div>
    </Card>
  );

  if (!linkToRound) return body;
  return (
    <Link
      to="/rounds/$roundId"
      params={{ roundId: round.id }}
      className="block transition-opacity hover:opacity-90"
    >
      {body}
    </Link>
  );
}
