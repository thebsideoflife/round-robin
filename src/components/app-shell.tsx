import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import {
  BarChart3,
  ChevronLeft,
  ClipboardList,
  Home,
  ListTodo,
  LogOut,
  Mic,
  Database,
  Settings2,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useStore } from "@/lib/store";
import { ROLE_LABELS } from "@/data/types";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { isOpenStatus, isOverdue } from "@/lib/domain/permissions";
import { ViewAsBanner, ViewAsSwitcher } from "@/components/view-as-switcher";
import { InstallPrompt, UpdateBanner } from "@/components/pwa";
import { DemoBanner } from "@/components/demo-banner";
import { RobinChat, RobinLauncher } from "@/components/robin-chat";
import { BrandLine, Mark } from "@/components/brand";

/**
 * Four primary destinations. Everything that used to be its own nav entry
 * (escalations, trends, recommendations, weekly summary, clinics) is now a
 * filtered view inside one of these, reachable by search params so deep links
 * and back-navigation still work.
 */
interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Badge selector, evaluated against the current scope. */
  badge?: "overdue";
}

const ADMIN_NAV = [
  { to: "/admin/users", label: "People & access", icon: Users },
  { to: "/admin/demo", label: "Demo data", icon: Database },
] as const;

const NAV: NavItem[] = [
  { to: "/today", label: "Today", icon: Home },
  { to: "/rounds", label: "Rounds", icon: ClipboardList },
  { to: "/tasks", label: "Tasks", icon: ListTodo, badge: "overdue" },
  { to: "/insights", label: "Insights", icon: BarChart3 },
];

function useIsActive() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (to: string) => (to === "/today" ? pathname === "/today" : pathname.startsWith(to));
}

function useBadges() {
  const { scope } = useStore();
  const overdue = scope.tasks.filter((t) => isOpenStatus(t) && isOverdue(t)).length;
  return { overdue };
}

async function signOut() {
  await supabase.auth.signOut();
  toast.success("Signed out");
}

/* ------------------------------------------------------------------ */
/* Mobile bottom tab bar                                               */
/* ------------------------------------------------------------------ */

function TabBar() {
  const isActive = useIsActive();
  const badges = useBadges();

  return (
    <nav
      aria-label="Primary"
      className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 shadow-sheet backdrop-blur-lg lg:hidden"
    >
      <ul className="grid grid-cols-4">
        {NAV.map(({ to, label, icon: Icon, badge }) => {
          const active = isActive(to);
          const count = badge === "overdue" ? badges.overdue : 0;
          return (
            <li key={to}>
              <Link
                to={to}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "press relative flex h-[var(--tabbar-h)] flex-col items-center justify-center gap-1.5 text-[0.75rem] font-medium",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <span className="relative">
                  <Icon className={cn("h-6 w-6", active && "stroke-[2.5]")} />
                  {count > 0 ? (
                    <span
                      aria-label={`${count} overdue`}
                      className="absolute -end-2 -top-1.5 grid h-[1.125rem] min-w-[1.125rem] place-items-center rounded-full bg-signal px-1 text-[11px] font-bold text-signal-foreground tabular-nums"
                    >
                      {count > 99 ? "99+" : count}
                    </span>
                  ) : null}
                </span>
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Primary field action: start a round with your voice. Always one tap away. */
function RoundFab() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const onPrimaryTab = NAV.some((n) =>
    n.to === "/today" ? pathname === "/today" : pathname.startsWith(n.to),
  );
  // Hide on the composer itself so it never covers the form.
  if (pathname.startsWith("/rounds/new")) return null;
  if (!onPrimaryTab) return null;

  return (
    <Link
      to="/rounds/new"
      className="press fixed end-4 z-40 flex h-14 items-center gap-2.5 rounded-full bg-primary ps-5 pe-6 text-[1.0625rem] font-semibold text-primary-foreground shadow-raised lg:hidden"
      style={{ bottom: "calc(var(--tabbar-h) + env(safe-area-inset-bottom, 0px) + 0.75rem)" }}
    >
      <Mic className="h-5 w-5" />
      Start a round
    </Link>
  );
}

/* ------------------------------------------------------------------ */
/* Desktop rail                                                        */
/* ------------------------------------------------------------------ */

function DesktopRail({ onAskRobin }: { onAskRobin: () => void }) {
  const isActive = useIsActive();
  const badges = useBadges();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { realUser, scope, isAdmin } = useStore();

  return (
    <aside className="fixed inset-y-0 start-0 z-30 hidden w-60 flex-col gap-6 border-e border-sidebar-border bg-sidebar p-4 lg:flex">
      <Link to="/today" className="px-1">
        <BrandLine size={40} />
      </Link>

      <nav aria-label="Primary" className="flex flex-col gap-1">
        {NAV.map(({ to, label, icon: Icon, badge }) => {
          const active = isActive(to);
          const count = badge === "overdue" ? badges.overdue : 0;
          return (
            <Link
              key={to}
              to={to}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="flex-1 truncate">{label}</span>
              {count > 0 ? (
                <span
                  className={cn(
                    "rounded-full px-1.5 text-[11px] font-bold tabular-nums",
                    active ? "bg-primary-foreground/20" : "bg-signal text-signal-foreground",
                  )}
                >
                  {count}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      <Button asChild className="w-full gap-2">
        <Link to="/rounds/new">
          <Mic className="h-4 w-4" />
          Start a round
        </Link>
      </Button>
      <Button variant="outline" className="w-full justify-start gap-2.5" onClick={onAskRobin}>
        <Mark size={22} />
        Ask Robin
      </Button>

      {isAdmin ? (
        <nav aria-label="Admin" className="flex flex-col gap-1">
          <span className="px-3 pt-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            Admin
          </span>
          {ADMIN_NAV.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                pathname.startsWith(to)
                  ? "bg-primary text-primary-foreground"
                  : "text-sidebar-foreground/75 hover:bg-sidebar-accent",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="truncate">{label}</span>
            </Link>
          ))}
        </nav>
      ) : null}

      <div className="mt-auto rounded-lg bg-sidebar-accent p-3">
        <p className="truncate text-sm font-medium">{realUser.name || "—"}</p>
        <p className="truncate text-xs text-muted-foreground">
          {ROLE_LABELS[realUser.role]} · {scope.clinics.length} clinic
          {scope.clinics.length === 1 ? "" : "s"}
        </p>
      </div>
    </aside>
  );
}

/* ------------------------------------------------------------------ */
/* Top app bar                                                         */
/* ------------------------------------------------------------------ */

function titleFor(pathname: string) {
  if (pathname.startsWith("/rounds/new")) return "New round";
  if (pathname.startsWith("/rounds/")) return "Round";
  if (pathname.startsWith("/rounds")) return "Rounds";
  if (pathname.startsWith("/tasks/")) return "Action item";
  if (pathname.startsWith("/tasks")) return "Tasks";
  if (pathname.startsWith("/insights")) return "Insights";
  if (pathname.startsWith("/clinics/")) return "Clinic";
  if (pathname.startsWith("/px/upload")) return "Upload PX report";
  if (pathname.startsWith("/px/")) return "PX report";
  if (pathname.startsWith("/admin/users")) return "People & access";
  if (pathname.startsWith("/admin")) return "Admin";
  return "Today";
}

/** Detail routes get a back affordance instead of the brand mark. */
const isDetail = (p: string) =>
  /^\/(rounds|tasks|clinics|px)\/.+/.test(p) || p.startsWith("/admin");

function AppBar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { realUser, currentUser, isAdmin } = useStore();
  const navigate = useNavigate();
  const detail = isDetail(pathname);

  return (
    <header className="pt-safe sticky top-0 z-30 border-b border-border bg-card/90 backdrop-blur-lg">
      <div className="flex h-[var(--appbar-h)] items-center gap-2 px-2 lg:px-6">
        {detail ? (
          <Button
            variant="ghost"
            size="icon"
            className="tap-target lg:hidden"
            aria-label="Go back"
            onClick={() => window.history.back()}
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
        ) : (
          <Mark size={34} className="lg:hidden" priority />
        )}

        <h1 className="min-w-0 flex-1 truncate px-1 text-[1.0625rem] font-semibold">
          {titleFor(pathname)}
        </h1>

        <ViewAsSwitcher />

        {/* Admin is a destination, not a hidden menu item. */}
        {isAdmin ? (
          <Button
            variant="ghost"
            size="icon"
            className="tap-target shrink-0"
            aria-label="Admin settings"
            onClick={() => navigate({ to: "/admin/users" })}
          >
            <Settings2 className="h-5 w-5" />
          </Button>
        ) : null}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="tap-target shrink-0"
              aria-label="Account menu"
            >
              <span className="grid h-8 w-8 place-items-center rounded-full bg-secondary text-xs font-semibold">
                {(realUser.name || "?")
                  .split(" ")
                  .map((n) => n[0])
                  .slice(0, 2)
                  .join("")
                  .toUpperCase()}
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <p className="truncate text-sm font-medium">{realUser.name || "Signed in"}</p>
              <p className="truncate text-xs text-muted-foreground">
                {ROLE_LABELS[currentUser.role]}
              </p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {isAdmin ? (
              <>
                <DropdownMenuLabel className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                  Admin
                </DropdownMenuLabel>
                <DropdownMenuItem onSelect={() => navigate({ to: "/admin/users" })}>
                  <Users className="me-2 h-4 w-4" />
                  People &amp; access
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => navigate({ to: "/admin/demo" })}>
                  <Database className="me-2 h-4 w-4" />
                  Demo data
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            ) : null}
            <DropdownMenuItem
              onSelect={async () => {
                await signOut();
                navigate({ to: "/auth" });
              }}
            >
              <LogOut className="me-2 h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ */

export function AppShell({ children }: { children: ReactNode }) {
  const [robinOpen, setRobinOpen] = useState(false);

  return (
    <div className="min-h-dvh-screen bg-background">
      <DesktopRail onAskRobin={() => setRobinOpen(true)} />
      <div className="lg:ps-60">
        <AppBar />
        <DemoBanner />
        <ViewAsBanner />
        <UpdateBanner />
        <main className="px-safe pb-tabbar mx-auto w-full max-w-6xl px-4 py-5 lg:px-6 lg:pb-12">
          {children}
        </main>
      </div>
      <TabBar />
      <RoundFab />
      <RobinLauncher onClick={() => setRobinOpen(true)} />
      <RobinChat open={robinOpen} onOpenChange={setRobinOpen} />
      <InstallPrompt />
    </div>
  );
}
