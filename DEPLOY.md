# Deploying to Cloudflare Workers

Target: a `*.workers.dev` HTTPS URL you can open on a real phone. HTTPS is not
optional here — `getUserMedia` (the mic) and service-worker registration are
both gated on a secure context, so a LAN IP like `http://192.168.1.20:5173`
will silently break the two features you most want to show.

Your account currently has two Workers (`buistknights`, `advocate`). This adds
a third named `round-robin`.

---

## 0. Get the code in

```sh
unzip "Round-and-Resolve-updated.zip"
# copy over your existing checkout, or diff it in — your call
npm install
```

Then, once and only once:

```sh
git rm --cached .env
git commit -m "stop tracking .env"
```

## 1. First build — verify the output paths

```sh
npm run build
ls .output
```

You should see `server/index.mjs` and `public/`. Those are the two paths
`wrangler.jsonc` points at. **If your build writes somewhere else** (the previous host's
vite config bundles nitro, and presets do move), update `main` and
`assets.directory` to match. Nothing else in the config depends on it.

Also worth running once:

```sh
npm run typecheck
```

I couldn't execute this — the sandbox blocked the npm registry, so there were
no `node_modules` to compile against. Expect a small number of errors on the
new routes, most likely around TanStack's generated search-param types.

## 2. Log in and name the Worker

```sh
npx wrangler login
```

The Worker name in `wrangler.jsonc` is `round-robin`, giving you
`https://round-robin.<your-subdomain>.workers.dev`.

## 3. Build-time vs runtime config — the part that trips people up

These are **two different sets of variables**, and getting it wrong produces a
white screen with no useful error.

**`VITE_*` are build-time.** Vite inlines them into the client bundle during
`npm run build`. They are public by design.

- Deploying from your laptop → they come from your local `.env`.
- Deploying via Workers Builds (CI) → set them as **build variables** in the
  dashboard. Runtime variables are *not* visible to the build.

```
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
VITE_SUPABASE_PROJECT_ID
VITE_IDLE_TIMEOUT_MINUTES
```

**Everything else is runtime**, read via `process.env` in the Worker. Works
because `nodejs_compat` + a `compatibility_date` after 2025-04-01 auto-populates
`process.env` from vars and secrets.

Non-secret runtime values live in `wrangler.jsonc` under `vars`. Secrets never
go in that file — it's committed:

```sh
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_PUBLISHABLE_KEY
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY   # bypasses RLS — treat accordingly
npx wrangler secret put LOVABLE_API_KEY             # AI summaries + trend analysis
npx wrangler secret put WHISPER_API_KEY             # voice transcription
```

For `wrangler dev` locally, put the same values in `.dev.vars` (already
gitignored).

## 4. Deploy

```sh
npm run deploy
```

`wrangler deploy --dry-run` first if you want to see what gets uploaded without
shipping it.

## 5. Apply the new migration

The audit-log migration hasn't run against your Supabase project yet:

```
supabase/migrations/20260803120000_audit_log_and_hardening.sql
```

Push it with the Supabase CLI, or paste it into the SQL editor. It's additive —
one new table, triggers, two functions, and one `REVOKE` on `pending_users`.

## 6. Seed the demo

1. Open the deployed URL and sign in. **The first account to sign in when no
   roles exist is automatically made admin** — so on a fresh Supabase project,
   sign in as yourself first.
2. Avatar menu → **Admin & demo data** → **Load demo data**.
3. You get 13 clinics across 3 divisions, a full leadership ladder (3 EDs,
   5 Directors, 13 Managers), ~45 rounds with themes and wins, ~70 action items
   aged to trip the 45- and 100-day escalation thresholds, and a complete PX
   report with opportunities and a coaching plan.

Demo accounts are real logins with password `DemoRnR!2026`, tagged with a demo
email domain. **Clear demo data** only removes rows it created.

> Strongly consider a **separate Supabase project** for the demo. The seeder is
> careful, but a clean copy means you can hand the URL to someone without
> thinking about it.

---

## Verify before you demo

Do this on the actual phone you'll present from, not the simulator.

- [ ] Site loads over `https://`
- [ ] **Add to Home Screen** — install prompt on Android, Share-sheet hint on iOS
- [ ] Launched from the home screen: no browser chrome, content clears the notch
      and the home indicator
- [ ] Bottom tab bar reachable one-handed; overdue badge shows a number
- [ ] Tap the mic FAB → **allow microphone** → record → text appears
- [ ] Airplane mode → reload → the offline page appears (not stale numbers)
- [ ] Task detail shows the escalation path with **names**, not just tiers
- [ ] Log in as a Director account → Today shows a different org rollup

### Rehearse the mic once, on the real device

It's the demo's centrepiece and it has the most ways to go wrong:

- **iOS Safari denies mic silently after a prior denial.** If you've ever tapped
  "Don't Allow" for this origin, Settings → Safari → Microphone → reset it.
- **Test the network you'll present on.** Conference wifi that blocks
  `api.openai.com` turns the mic into an error toast.
- If you're at all unsure about connectivity, fill one round by typing in
  advance so you have something to fall back to.

---

## Troubleshooting

**White screen, no errors** — a missing `VITE_*` at build time. `supabase/client.ts`
throws on startup when `VITE_SUPABASE_URL` is absent. Check the browser console
and rebuild with the variable set.

**Server functions 500** — a missing runtime secret. `npx wrangler tail` streams
live logs; observability is already enabled in the config.

**Mic button doesn't appear at all** — `useVoiceCapture` hides it when
`window.isSecureContext` is false. That's an HTTP origin.

**Transcription returns "isn't configured"** — no `WHISPER_API_KEY` and no
`LOVABLE_API_KEY` reached the Worker. Secrets are per-Worker; setting them on a
different Worker name won't carry over.

**App won't update on an installed device** — bump `CACHE_VERSION` in
`public/sw.js` and redeploy. The `_headers` file already marks `sw.js`
no-store, so this should be rare.

**CSP breaking something** — it ships Report-Only, so it shouldn't. If you set
`CSP_ENFORCE=1` and things break, check the console for violations and add the
origin to `connect-src` in `src/lib/security-headers.ts`.
