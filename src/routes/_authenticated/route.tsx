import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { StoreProvider } from "@/lib/store";
import { getMyAccessStatus } from "@/lib/users.functions";
import { useIdleLogout } from "@/hooks/use-idle-logout";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    // Force a password reset for admin-created accounts on first sign-in.
    if (
      data.user.user_metadata?.must_reset_password === true &&
      location.pathname !== "/reset-password"
    ) {
      throw redirect({ to: "/reset-password", search: { forced: 1 } });
    }
    // Skip the access check on the awaiting-approval page itself.
    if (location.pathname === "/awaiting-approval") return { user: data.user };
    try {
      const status = await getMyAccessStatus();
      if (!status.hasAccess) throw redirect({ to: "/awaiting-approval" });
      return { user: data.user, roles: status.roles, isAdmin: status.isAdmin };
    } catch (err) {
      if (err && typeof err === "object" && "to" in err) throw err;
      return { user: data.user };
    }
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  // Automatic logoff on shared clinic devices.
  useIdleLogout((seconds) =>
    toast.warning(`Signing you out in ${seconds}s`, {
      description: "Tap anywhere to stay signed in.",
    }),
  );

  return (
    <StoreProvider>
      <AppShell>
        <Outlet />
      </AppShell>
    </StoreProvider>
  );
}
