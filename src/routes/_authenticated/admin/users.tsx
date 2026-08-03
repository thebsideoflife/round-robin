import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Loader2, Mail, Plus, Search, ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  EmptyState,
  FilterRail,
  ListCard,
  PageHeader,
  Row,
  SectionHeading,
} from "@/components/primitives";
import { useStore } from "@/lib/store";
import {
  inviteUser,
  listDirectory,
  listInvitations,
  revokeInvitation,
  setClinicAssignment,
  setUserRole,
  type AppRole,
  type DirectoryUser,
} from "@/lib/admin.functions";
import { ROLE_LABELS } from "@/data/types";

export const Route = createFileRoute("/_authenticated/admin/users")({
  head: () => ({
    meta: [
      { title: "People & access — Round Robin" },
      {
        name: "description",
        content: "Invite people, set their role and assign them to the clinics they cover.",
      },
    ],
  }),
  component: AdminUsersPage,
});

const ROLES: AppRole[] = ["admin", "cao", "executive_director", "director", "manager"];
const CLINIC_ROLES = ["manager", "director", "executive_director"] as const;

const ROLE_COPY: Record<AppRole, string> = {
  admin: "Full access, including this screen",
  cao: "Sees every clinic in the organization",
  executive_director: "Sees their division",
  director: "Sees the clinics under their managers",
  manager: "Sees the clinics they run",
};

const FILTERS = ["Everyone", "Needs a role", "Managers", "Directors", "Admins"] as const;
type Filter = (typeof FILTERS)[number];

function AdminUsersPage() {
  const qc = useQueryClient();
  const { scope } = useStore();
  const fetchDirectory = useServerFn(listDirectory);
  const fetchInvites = useServerFn(listInvitations);

  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("Everyone");
  const [selected, setSelected] = useState<DirectoryUser | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);

  const directory = useQuery({ queryKey: ["admin-directory"], queryFn: () => fetchDirectory() });
  const invites = useQuery({ queryKey: ["admin-invites"], queryFn: () => fetchInvites() });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin-directory"] });
    qc.invalidateQueries({ queryKey: ["admin-invites"] });
    qc.invalidateQueries({ queryKey: ["scope"] });
  };

  const people = (directory.data ?? [])
    .filter((u) => {
      switch (filter) {
        case "Needs a role":
          return u.roles.length === 0 || u.isPending;
        case "Managers":
          return u.roles.includes("manager");
        case "Directors":
          return u.roles.includes("director") || u.roles.includes("executive_director");
        case "Admins":
          return u.roles.includes("admin") || u.roles.includes("cao");
        default:
          return true;
      }
    })
    .filter((u) => `${u.fullName} ${u.email} ${u.title}`.toLowerCase().includes(q.toLowerCase()));

  const counts = Object.fromEntries(
    FILTERS.map((f) => [
      f,
      (directory.data ?? []).filter((u) => {
        switch (f) {
          case "Needs a role":
            return u.roles.length === 0 || u.isPending;
          case "Managers":
            return u.roles.includes("manager");
          case "Directors":
            return u.roles.includes("director") || u.roles.includes("executive_director");
          case "Admins":
            return u.roles.includes("admin") || u.roles.includes("cao");
          default:
            return true;
        }
      }).length,
    ]),
  ) as Record<Filter, number>;

  const needsRole = counts["Needs a role"];

  return (
    <div className="space-y-5">
      <PageHeader
        title="People & access"
        description="Invite people, set what they can see, and assign them to clinics."
        action={
          <Button className="gap-2" onClick={() => setInviteOpen(true)}>
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Invite</span>
          </Button>
        }
      />

      {needsRole > 0 ? (
        <Card className="flex-row items-center gap-3 border-warning/40 bg-warning-soft/50 p-4">
          <ShieldCheck className="h-5 w-5 shrink-0 text-warning-foreground" />
          <p className="min-w-0 flex-1 text-[0.9375rem]">
            {needsRole} {needsRole === 1 ? "person is" : "people are"} waiting for a role. They
            can't see anything until you give them one.
          </p>
          <Button size="sm" variant="outline" onClick={() => setFilter("Needs a role")}>
            Review
          </Button>
        </Card>
      ) : null}

      <FilterRail options={FILTERS} value={filter} onChange={setFilter} counts={counts} />

      <div className="relative">
        <Search className="pointer-events-none absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by name or email"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="h-12 ps-10 text-base"
          aria-label="Search people"
        />
      </div>

      {directory.isLoading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Loading people…</p>
      ) : directory.error ? (
        <EmptyState
          title="Couldn't load the directory"
          description={
            directory.error instanceof Error ? directory.error.message : "Try refreshing."
          }
        />
      ) : people.length ? (
        <ListCard>
          {people.map((u) => (
            <Row
              key={u.userId}
              title={u.fullName || u.email}
              subtitle={`${u.email}${u.title ? ` · ${u.title}` : ""}${
                u.clinicIds.length ? ` · ${u.clinicIds.length} clinic${u.clinicIds.length === 1 ? "" : "s"}` : ""
              }`}
              right={
                u.roles.length ? (
                  <Badge variant="outline" className="font-normal">
                    {ROLE_LABELS[u.roles[0] as keyof typeof ROLE_LABELS] ?? u.roles[0]}
                  </Badge>
                ) : (
                  <Badge className="bg-warning-soft text-warning-foreground">No role</Badge>
                )
              }
              onClick={() => setSelected(u)}
            />
          ))}
        </ListCard>
      ) : (
        <EmptyState title="Nobody matches that" description="Try a different search or filter." />
      )}

      {invites.data && invites.data.length > 0 ? (
        <section className="space-y-3">
          <SectionHeading
            title="Invited, not signed up yet"
            description="They get their role automatically when they create an account."
          />
          <ListCard>
            {invites.data.map((inv) => (
              <Row
                key={inv.id}
                leading={<Mail className="h-5 w-5 text-muted-foreground" />}
                title={inv.email}
                subtitle={`Invited as ${ROLE_LABELS[inv.role as keyof typeof ROLE_LABELS] ?? inv.role}`}
                right={
                  <RevokeButton
                    id={inv.id}
                    onDone={() => {
                      toast.success("Invitation revoked");
                      refresh();
                    }}
                  />
                }
              />
            ))}
          </ListCard>
        </section>
      ) : null}

      <InviteSheet open={inviteOpen} onOpenChange={setInviteOpen} onDone={refresh} />
      <PersonSheet
        person={selected}
        clinics={scope.clinics}
        onOpenChange={(o) => !o && setSelected(null)}
        onDone={refresh}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */

function RevokeButton({ id, onDone }: { id: string; onDone: () => void }) {
  const run = useServerFn(revokeInvitation);
  const m = useMutation({
    mutationFn: () => run({ data: { id } }),
    onSuccess: onDone,
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Revoke invitation"
      disabled={m.isPending}
      onClick={(e) => {
        e.stopPropagation();
        m.mutate();
      }}
    >
      <X className="h-4 w-4" />
    </Button>
  );
}

function InviteSheet({
  open,
  onOpenChange,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onDone: () => void;
}) {
  const run = useServerFn(inviteUser);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AppRole>("manager");

  const m = useMutation({
    mutationFn: () => run({ data: { email, role } }),
    onSuccess: (res) => {
      toast.success(
        res.mode === "invited"
          ? `${res.email} can now sign up and will get the ${ROLE_LABELS[role as keyof typeof ROLE_LABELS] ?? role} role.`
          : `${res.email} already had an account — role updated.`,
      );
      setEmail("");
      onOpenChange(false);
      onDone();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Invite failed"),
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="gap-0 rounded-t-3xl p-5 sm:max-w-lg">
        <SheetHeader className="p-0">
          <SheetTitle>Invite someone</SheetTitle>
          <SheetDescription>
            They'll get access the moment they create an account with this email. No approval step.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-5 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="invite-email">Email</Label>
            <Input
              id="invite-email"
              type="email"
              inputMode="email"
              autoCapitalize="none"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@yourhealthsystem.org"
              className="h-12 text-base"
            />
          </div>

          <div className="space-y-2">
            <Label>What should they see?</Label>
            <div className="space-y-2">
              {ROLES.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  className={
                    "flex w-full items-center gap-3 rounded-2xl border p-3.5 text-start transition-colors " +
                    (role === r
                      ? "border-primary bg-primary-soft"
                      : "border-border hover:bg-accent/40")
                  }
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-[1.0625rem] font-medium">
                      {ROLE_LABELS[r as keyof typeof ROLE_LABELS] ?? r}
                    </span>
                    <span className="mt-0.5 block text-sm text-muted-foreground">
                      {ROLE_COPY[r]}
                    </span>
                  </span>
                  {role === r ? <Check className="h-5 w-5 shrink-0 text-primary" /> : null}
                </button>
              ))}
            </div>
          </div>

          <Button
            className="action-primary w-full"
            disabled={!email.includes("@") || m.isPending}
            onClick={() => m.mutate()}
          >
            {m.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
            Send invite
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function PersonSheet({
  person,
  clinics,
  onOpenChange,
  onDone,
}: {
  person: DirectoryUser | null;
  clinics: { id: string; name: string }[];
  onOpenChange: (o: boolean) => void;
  onDone: () => void;
}) {
  const runRole = useServerFn(setUserRole);
  const runAssign = useServerFn(setClinicAssignment);
  const [clinicRole, setClinicRole] = useState<(typeof CLINIC_ROLES)[number]>("manager");

  const roleM = useMutation({
    mutationFn: (role: AppRole) => runRole({ data: { userId: person!.userId, role } }),
    onSuccess: () => {
      toast.success("Role updated");
      onDone();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't change the role"),
  });

  const assignM = useMutation({
    mutationFn: (v: { clinicId: string; attach: boolean }) =>
      runAssign({
        data: {
          userId: person!.userId,
          clinicId: v.clinicId,
          role: clinicRole,
          attach: v.attach,
        },
      }),
    onSuccess: () => {
      toast.success("Assignment updated");
      onDone();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't update the assignment"),
  });

  if (!person) return null;
  const current = person.roles[0];

  return (
    <Sheet open={!!person} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="gap-0 overflow-y-auto rounded-t-3xl p-5 sm:max-w-lg">
        <SheetHeader className="p-0">
          <SheetTitle>{person.fullName || person.email}</SheetTitle>
          <SheetDescription>{person.email}</SheetDescription>
        </SheetHeader>

        <div className="mt-5 space-y-6">
          <section className="space-y-2">
            <Label>Role</Label>
            <div className="space-y-2">
              {ROLES.map((r) => (
                <button
                  key={r}
                  type="button"
                  disabled={roleM.isPending}
                  onClick={() => roleM.mutate(r)}
                  className={
                    "flex w-full items-center gap-3 rounded-2xl border p-3.5 text-start transition-colors " +
                    (current === r
                      ? "border-primary bg-primary-soft"
                      : "border-border hover:bg-accent/40")
                  }
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-[1.0625rem] font-medium">
                      {ROLE_LABELS[r as keyof typeof ROLE_LABELS] ?? r}
                    </span>
                    <span className="mt-0.5 block text-sm text-muted-foreground">
                      {ROLE_COPY[r]}
                    </span>
                  </span>
                  {current === r ? <Check className="h-5 w-5 shrink-0 text-primary" /> : null}
                </button>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <div className="space-y-2">
              <Label>Clinics they cover</Label>
              <p className="text-sm text-muted-foreground">
                Assignments are what actually decide who sees which data, and who an issue
                escalates to.
              </p>
            </div>

            <Select
              value={clinicRole}
              onValueChange={(v) => setClinicRole(v as (typeof CLINIC_ROLES)[number])}
            >
              <SelectTrigger className="h-12 w-full text-base">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CLINIC_ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    Assign as {ROLE_LABELS[r as keyof typeof ROLE_LABELS] ?? r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <ListCard>
              {clinics.map((c) => {
                const on = person.clinicIds.includes(c.id);
                return (
                  <Row
                    key={c.id}
                    title={c.name}
                    subtitle={on ? "Assigned" : "Not assigned"}
                    right={
                      <Button
                        size="sm"
                        variant={on ? "outline" : "default"}
                        disabled={assignM.isPending}
                        onClick={(e) => {
                          e.stopPropagation();
                          assignM.mutate({ clinicId: c.id, attach: !on });
                        }}
                      >
                        {on ? "Remove" : "Add"}
                      </Button>
                    }
                  />
                );
              })}
            </ListCard>
            {clinics.length === 0 ? (
              <EmptyState
                title="No clinics yet"
                description="Load the demo data or create a clinic first."
              />
            ) : null}
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
