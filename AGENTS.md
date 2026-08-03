# Working in this repo

Round Robin — Ambulatory Operational Intelligence.

- TanStack Start + React 19 + Tailwind v4, deployed to Cloudflare Workers.
- Supabase provides Postgres, Auth and row-level security. **RLS is the
  authorization boundary** — never rely on client-side filtering for access
  control, and never reach for the service-role client on a read path.
- `src/lib/domain/` holds the business rules (org graph, escalation, health
  scoring). Keep them pure and free of React or Supabase imports.
- Route files are thin; logic belongs in `src/lib/`.
- Run `npm run typecheck` and `npm run lint` before committing.
