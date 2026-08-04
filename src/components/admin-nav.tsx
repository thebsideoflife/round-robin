import { Link, useRouterState } from "@tanstack/react-router";
import { Database, Users } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { to: "/admin/users", label: "People & access", icon: Users },
  { to: "/admin/demo", label: "Demo data", icon: Database },
] as const;

/** Shared sub-navigation so the admin screens read as one section. */
export function AdminNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div className="scroll-rail -mx-4 mb-1 px-4">
      {TABS.map(({ to, label, icon: Icon }) => {
        const active = pathname.startsWith(to);
        return (
          <Link
            key={to}
            to={to}
            className={cn(
              "press flex h-11 items-center gap-2 rounded-full border px-4 text-[0.9375rem] font-medium whitespace-nowrap",
              active
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:bg-accent/50",
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        );
      })}
    </div>
  );
}
