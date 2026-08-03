import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Legacy route — kept as a redirect so existing bookmarks, emails and
 * home-screen shortcuts keep working after the navigation redesign.
 * "Where to round next" now lives above the fold on Today.
 */
export const Route = createFileRoute("/_authenticated/recommendations")({
  beforeLoad: () => {
    throw redirect({ to: "/today" });
  },
  component: () => null,
});
