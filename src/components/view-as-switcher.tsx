import { Eye, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ROLE_LABELS, type RoleKey } from "@/data/types";
import { useStore } from "@/lib/store";

const GROUP_ORDER: RoleKey[] = ["executive_director", "director", "manager", "cao"];

/** Lets an admin/CAO preview the app exactly as another leader sees it. */
export function ViewAsSwitcher({ className }: { className?: string }) {
  const { canViewAs, viewAsOptions, viewAsId, setViewAsId, isViewingAs } = useStore();
  if (!canViewAs || viewAsOptions.length === 0) return null;

  const groups = GROUP_ORDER.map((role) => ({
    role,
    people: viewAsOptions.filter((p) => p.role === role),
  })).filter((g) => g.people.length > 0);

  return (
    <div className={className}>
      <div className="flex items-center gap-1.5">
        <Select
          value={viewAsId ?? "self"}
          onValueChange={(v) => setViewAsId(v === "self" ? null : v)}
        >
          <SelectTrigger
            aria-label="View as role"
            className="h-9 w-auto max-w-[9rem] gap-2 text-xs sm:max-w-none sm:w-[240px] sm:text-sm"
          >
            <Eye className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="hidden truncate sm:inline">
              <SelectValue placeholder="View as…" />
            </span>
            <span className="truncate sm:hidden">
              <SelectValue placeholder="View as" />
            </span>
          </SelectTrigger>
          <SelectContent className="max-h-[60vh]">
            <SelectItem value="self">My own view</SelectItem>
            {groups.map((g) => (
              <SelectGroup key={g.role}>
                <SelectLabel>{ROLE_LABELS[g.role]}</SelectLabel>
                {g.people.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
        {isViewingAs && (
          <Button
            variant="ghost"
            size="icon"
            className="tap-target hidden sm:inline-flex"
            aria-label="Exit view-as mode"
            onClick={() => setViewAsId(null)}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

/** Thin banner shown while previewing another leader's perspective. */
export function ViewAsBanner() {
  const { isViewingAs, currentUser, setViewAsId } = useStore();
  if (!isViewingAs) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-primary/30 bg-primary/10 px-4 py-2 text-xs lg:px-6">
      <span className="flex items-center gap-2 font-medium text-foreground">
        <Eye className="h-3.5 w-3.5" />
        Previewing as {currentUser.name} · {ROLE_LABELS[currentUser.role]}
      </span>
      <button
        type="button"
        onClick={() => setViewAsId(null)}
        className="font-semibold text-primary underline-offset-2 hover:underline"
      >
        Return to my view
      </button>
    </div>
  );
}
