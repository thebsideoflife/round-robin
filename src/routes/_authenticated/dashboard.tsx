import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Legacy route — kept as a redirect so existing bookmarks, emails and
 * home-screen shortcuts keep working after the navigation redesign.
 * The role-specific dashboards are now one adaptive Today screen.
 */
export const Route = createFileRoute("/_authenticated/dashboard")({
  beforeLoad: () => {
    throw redirect({ to: "/today" });
  },
  component: () => null,
});
