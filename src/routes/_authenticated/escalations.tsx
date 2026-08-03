import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Legacy route — kept as a redirect so existing bookmarks, emails and
 * home-screen shortcuts keep working after the navigation redesign.
 * Escalations are a filter on Work, not a separate destination.
 */
export const Route = createFileRoute("/_authenticated/escalations")({
  beforeLoad: () => {
    throw redirect({ to: "/tasks", search: { filter: "Escalated" } });
  },
  component: () => null,
});
