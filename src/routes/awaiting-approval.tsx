import { createFileRoute, Link } from "@tanstack/react-router";
import { Mark } from "@/components/brand";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/awaiting-approval")({
  ssr: false,
  head: () => ({ meta: [{ title: "Awaiting approval — Round Robin" }] }),
  component: AwaitingApprovalPage,
});

function AwaitingApprovalPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm text-center">
        <CardHeader>
          <CardTitle>Awaiting approval</CardTitle>
          <CardDescription>
            Your account is confirmed, but an administrator hasn't assigned you a role yet.
            You'll get access once you're added to a clinic or team.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button
            className="w-full"
            onClick={async () => {
              await supabase.auth.signOut();
            }}
            asChild
          >
            <Link to="/auth">Sign out</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
