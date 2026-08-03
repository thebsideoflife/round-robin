import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Legacy route — kept as a redirect so existing bookmarks, emails and
 * home-screen shortcuts keep working after the navigation redesign.
 * The weekly digest is now the "This week" strip on Today.
 */
export const Route = createFileRoute("/_authenticated/weekly")({
  beforeLoad: () => {
    throw redirect({ to: "/today" });
  },
  component: () => null,
});
