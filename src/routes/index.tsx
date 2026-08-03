import { createFileRoute, redirect } from "@tanstack/react-router";

// Public root: send everyone to Today, which the _authenticated gate
// redirects to /auth when there is no session.
export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: "/today" });
  },
  component: () => null,
});
