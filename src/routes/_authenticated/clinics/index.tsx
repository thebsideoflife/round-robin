import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Legacy route — kept as a redirect so existing bookmarks, emails and
 * home-screen shortcuts keep working after the navigation redesign.
 * The clinic directory is the Clinics tab of Insights.
 */
export const Route = createFileRoute("/_authenticated/clinics/")({
  beforeLoad: () => {
    throw redirect({ to: "/insights", search: { tab: "Clinics" } });
  },
  component: () => null,
});
