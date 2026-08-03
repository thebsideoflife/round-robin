import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { lookupInvitation, acceptInvitation } from "@/lib/invitations.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Activity } from "lucide-react";

export const Route = createFileRoute("/accept-invite")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) => ({
    token: (search.token as string) ?? "",
  }),
  head: () => ({ meta: [{ title: "Accept invitation — Round Robin" }] }),
  component: AcceptInvitePage,
});

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrator",
  cao: "Chief Ambulatory Officer",
  executive_director: "Executive Director",
  director: "Director",
  manager: "Manager",
};

function AcceptInvitePage() {
  const { token } = useSearch({ from: "/accept-invite" });
  const navigate = useNavigate();
  const lookup = useServerFn(lookupInvitation);
  const accept = useServerFn(acceptInvitation);
  const [checked, setChecked] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [role, setRole] = useState<string>("");
  const [invalid, setInvalid] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function runLookup() {
    if (!token) return setInvalid("No invitation token provided.");
    setBusy(true);
    try {
      const res = await lookup({ data: { token } });
      if (!res.valid) {
        setInvalid(
          res.reason === "expired"
            ? "This invitation has expired. Ask an admin to resend it."
            : res.reason === "accepted"
              ? "This invitation has already been used."
              : res.reason === "revoked"
                ? "This invitation was revoked."
                : "Invitation not found.",
        );
      } else {
        setEmail(res.email);
        setRole(res.role);
      }
    } catch (err) {
      setInvalid(err instanceof Error ? err.message : "Could not verify invitation.");
    } finally {
      setChecked(true);
      setBusy(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) return toast.error("Password must be at least 8 characters");
    setBusy(true);
    try {
      await accept({ data: { token, password } });
      toast.success("Account ready — signing you in");
      navigate({ to: "/dashboard" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not accept invitation");
    } finally {
      setBusy(false);
    }
  }

  if (!checked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <div className="mb-2 flex items-center gap-2">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-primary-foreground">
                <Activity className="h-5 w-5" />
              </span>
              <span className="font-semibold">Round Robin</span>
            </div>
            <CardTitle>Accept your invitation</CardTitle>
            <CardDescription>Verify your invitation to set up access.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full" disabled={busy || !token} onClick={runLookup}>
              {busy ? "Verifying…" : "Continue"}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (invalid) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <Card className="w-full max-w-sm text-center">
          <CardHeader>
            <CardTitle>Invitation problem</CardTitle>
            <CardDescription>{invalid}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Welcome to Round Robin</CardTitle>
          <CardDescription className="flex items-center gap-2">
            {email} <Badge>{ROLE_LABELS[role] ?? role}</Badge>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="pw">Choose a password</Label>
              <Input id="pw" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Please wait…" : "Create account & continue"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
