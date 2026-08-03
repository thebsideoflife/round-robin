# Round Robin

Ambulatory Operational Intelligence — leadership rounding, action items and
escalation for ambulatory clinic operations.

Self-contained: no the previous host, no vendor SDKs beyond Supabase and an
OpenAI-compatible AI endpoint of your choosing.

## Stack

- **TanStack Start** (React 19, SSR, server functions) on **Vite 8**
- **Tailwind v4**
- **Supabase** — Postgres, Auth, row-level security
- **Cloudflare Workers** for hosting (swap the nitro target in `vite.config.ts`
  for Node, Vercel or Netlify)

## Quick start

```sh
npm install
cp .env.example .env      # fill in your Supabase values
npm run dev               # http://localhost:3000
```

## Setting up from scratch

1. **Restore the database** — `supabase/restore/README.md`
2. **Apply the migrations** dated `20260803` in `supabase/migrations/`
3. **Fill in `.env`**
4. `npm run dev`

`SETUP.md` walks the whole thing end to end.

## Scripts

| | |
|---|---|
| `npm run dev` | dev server |
| `npm run build` | production build into `.output/` |
| `npm run start` | run the built server locally |
| `npm run deploy` | build then `wrangler deploy` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | eslint |

## Architecture

```
src/
  routes/            file-based routes; thin, no business logic
  components/        UI. primitives.tsx is the shared vocabulary
  lib/
    domain/          pure business rules — no React, no Supabase
      org.ts         org graph: top-down rollup + bottom-up escalation
      escalation.ts  when an issue moves up a tier
      health.ts      clinic health scoring
    *.functions.ts   server functions (run on the server, called from the client)
  integrations/
    supabase/        clients and the auth middleware
supabase/
  migrations/        schema and RLS
  restore/           restore the supplied database into your own project
  seed/              optional demo data
```

**Authorization lives in the database.** Every table has RLS; the client is
never trusted to filter. No read path uses the service-role key.

## Deploying

`DEPLOY.md`. Short version: `npm run build`, check `.output/`, set secrets with
`wrangler secret put`, `npm run deploy`.

## Security

`SECURITY.md` — current posture, findings, and the checklist to work through
before this handles PHI.
