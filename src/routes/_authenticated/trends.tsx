import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Legacy route — kept as a redirect so existing bookmarks, emails and
 * home-screen shortcuts keep working after the navigation redesign.
 * Trends are the Themes tab of Insights.
 */
export const Route = createFileRoute("/_authenticated/trends")({
  beforeLoad: () => {
    throw redirect({ to: "/insights", search: { tab: "Themes" } });
  },
  component: () => null,
});
