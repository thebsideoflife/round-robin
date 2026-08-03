import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Legacy route — kept as a redirect so existing bookmarks, emails and
 * home-screen shortcuts keep working after the navigation redesign.
 * The PX report list is the PX tab of Insights.
 */
export const Route = createFileRoute("/_authenticated/px/")({
  beforeLoad: () => {
    throw redirect({ to: "/insights", search: { tab: "PX" } });
  },
  component: () => null,
});
