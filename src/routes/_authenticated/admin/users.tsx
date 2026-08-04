import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, KeyRound, Loader2, Mail, Plus, Search, ShieldCheck, X } from "lucide-react";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  sendPasswordReset,
  setClinicAssignment,
  setTemporaryPassword,
  setUserRole,
  updateProfile,
  type AppRole,
  type DirectoryUser,
} from "@/lib/admin.functions";
import { AvatarUpload, PersonAvatar } from "@/components/avatar-upload";
import { AdminNav } from "@/components/admin-nav";
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
  admin: "Everything, including this screen and other people's passwords",
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
      <AdminNav />
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
              leading={<PersonAvatar name={u.fullName || u.email} src={u.avatarUrl} size={40} />}
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

      <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} onDone={refresh} />
      <PersonDialog
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

function InviteDialog({
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88dvh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Invite someone</DialogTitle>
          <DialogDescription>
            They'll get access the moment they create an account with this email. No approval step.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
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
      </DialogContent>
    </Dialog>
  );
}

function PersonDialog({
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
  const runProfile = useServerFn(updateProfile);
  const runTempPassword = useServerFn(setTemporaryPassword);
  const runReset = useServerFn(sendPasswordReset);

  const [clinicRole, setClinicRole] = useState<(typeof CLINIC_ROLES)[number]>("manager");
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [tempPw, setTempPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [avatar, setAvatar] = useState<string | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  // Re-seed the form when a different person is opened.
  if (person && loadedFor !== person.userId) {
    setLoadedFor(person.userId);
    setName(person.fullName);
    setTitle(person.title);
    setAvatar(person.avatarUrl);
    setTempPw("");
    setShowPw(false);
  }

  const roleM = useMutation({
    mutationFn: (role: AppRole) => runRole({ data: { userId: person!.userId, role } }),
    onSuccess: () => {
      toast.success("Role updated");
      onDone();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't change the role"),
  });

  const profileM = useMutation({
    mutationFn: (patch: { fullName?: string; title?: string; avatarUrl?: string }) =>
      runProfile({ data: { userId: person!.userId, ...patch } }),
    onSuccess: () => {
      toast.success("Profile saved");
      onDone();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't save the profile"),
  });

  const assignM = useMutation({
    mutationFn: (v: { clinicId: string; attach: boolean }) =>
      runAssign({
        data: { userId: person!.userId, clinicId: v.clinicId, role: clinicRole, attach: v.attach },
      }),
    onSuccess: () => {
      toast.success("Assignment updated");
      onDone();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't update the assignment"),
  });

  const tempPwM = useMutation({
    mutationFn: () => runTempPassword({ data: { userId: person!.userId, password: tempPw } }),
    onSuccess: () => {
      toast.success("Temporary password set", {
        description: "They'll be asked to change it when they sign in.",
      });
      setShowPw(false);
      setTempPw("");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't set the password"),
  });

  const resetM = useMutation({
    mutationFn: () =>
      runReset({
        data: {
          email: person!.email,
          redirectTo: `${window.location.origin}/reset-password`,
        },
      }),
    onSuccess: () => toast.success(`Reset link sent to ${person!.email}`),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't send the reset email"),
  });

  if (!person) return null;
  const current = person.roles[0];
  const dirty = name !== person.fullName || title !== person.title;

  return (
    <Dialog open={!!person} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] max-w-2xl gap-0 overflow-y-auto p-0">
        <DialogHeader className="sticky top-0 z-10 flex-row items-center gap-3 border-b border-border bg-popover p-5">
          <PersonAvatar name={name || person.email} src={avatar} size={44} />
          <div className="min-w-0 flex-1 text-start">
            <DialogTitle className="truncate text-[1.0625rem]">
              {person.fullName || person.email}
            </DialogTitle>
            <DialogDescription className="truncate">{person.email}</DialogDescription>
          </div>
        </DialogHeader>

        {/* A jump bar, because everything below used to be lost under a fold. */}
        <div className="scroll-rail border-b border-border px-5 py-3">
          {[
            ["#sec-profile", "Profile"],
            ["#sec-role", "Role"],
            ["#sec-password", "Password"],
            ["#sec-clinics", "Clinics"],
          ].map(([href, label]) => (
            <a
              key={href}
              href={href}
              onClick={(e) => {
                e.preventDefault();
                document
                  .querySelector(href)
                  ?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
              className="press flex h-9 items-center rounded-full border border-border bg-card px-3.5 text-sm font-medium whitespace-nowrap text-muted-foreground hover:bg-accent/50"
            >
              {label}
            </a>
          ))}
        </div>

        <div className="space-y-8 p-5">
          {/* ---------------- Profile ---------------- */}
          <section id="sec-profile" className="scroll-mt-24 space-y-4">
            <Label>Photo</Label>
            <AvatarUpload
              userId={person.userId}
              name={name || person.email}
              currentUrl={avatar}
              onChange={async (url) => {
                setAvatar(url);
                await profileM.mutateAsync({ avatarUrl: url ?? "" });
              }}
            />

            <div className="space-y-2">
              <Label htmlFor="p-name">Display name</Label>
              <Input
                id="p-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-12 text-base"
                maxLength={120}
                placeholder="Dana Whitfield"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="p-title">Title</Label>
              <Input
                id="p-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="h-12 text-base"
                maxLength={160}
                placeholder="Practice Manager, Lakeshore Family Medicine"
              />
            </div>
            {dirty ? (
              <Button
                className="w-full"
                disabled={profileM.isPending}
                onClick={() => profileM.mutate({ fullName: name.trim(), title: title.trim() })}
              >
                {profileM.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Save changes
              </Button>
            ) : null}
          </section>

          {/* ---------------- Role ---------------- */}
          <section id="sec-role" className="scroll-mt-24 space-y-2">
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

          {/* ---------------- Password ---------------- */}
          <section id="sec-password" className="scroll-mt-24 space-y-3">
            <div className="space-y-1">
              <Label>Password</Label>
              <p className="text-sm text-muted-foreground">
                Emailing a reset link is safer — nobody has to say a password out loud.
              </p>
            </div>

            <Button
              variant="outline"
              className="w-full gap-2"
              disabled={resetM.isPending}
              onClick={() => resetM.mutate()}
            >
              {resetM.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Mail className="h-4 w-4" />
              )}
              Email a reset link
            </Button>

            {showPw ? (
              <div className="space-y-2 rounded-2xl border border-border p-3.5">
                <Label htmlFor="p-temp">Temporary password</Label>
                <Input
                  id="p-temp"
                  value={tempPw}
                  onChange={(e) => setTempPw(e.target.value)}
                  className="h-12 text-base"
                  placeholder="At least 10 characters"
                  autoComplete="off"
                />
                <p className="text-xs text-muted-foreground">
                  This signs them out everywhere and forces a change at next sign-in.
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    className="flex-1"
                    onClick={() => {
                      setShowPw(false);
                      setTempPw("");
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    className="flex-1"
                    disabled={tempPw.trim().length < 10 || tempPwM.isPending}
                    onClick={() => tempPwM.mutate()}
                  >
                    {tempPwM.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Set it
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variant="ghost"
                className="w-full gap-2 text-muted-foreground"
                onClick={() => setShowPw(true)}
              >
                <KeyRound className="h-4 w-4" />
                Set a temporary password instead
              </Button>
            )}
          </section>

          {/* ---------------- Clinics ---------------- */}
          <section id="sec-clinics" className="scroll-mt-24 space-y-3">
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

            {clinics.length ? (
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
            ) : (
              <EmptyState
                title="No clinics yet"
                description="Load the demo data or create a clinic first."
              />
            )}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
