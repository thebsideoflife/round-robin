# Setup — running Round Robin on your own infrastructure

No vendor. Your Supabase, your AI vendor, your hosting.

---

## What changed to get off vendor

| Was | Now |
|---|---|
| `@vendor.dev/vite-tanstack-config` | plain `vite.config.ts` with the plugins listed explicitly |
| `ai.gateway.vendor.dev` hardcoded | any OpenAI-compatible endpoint via `AI_BASE_URL` / `AI_API_KEY` |
| `google/gemini-3.6-flash` pinned | `AI_MODEL`, `AI_VISION_MODEL` |
| `vendor-error-reporting.ts` → their telemetry | `error-reporting.ts`, console-only unless you set `VITE_ERROR_ENDPOINT` |
| vendor-hosted Supabase, no service-role key | your project, full keys |
| `bunfig.toml` allowlisting `@vendor.dev/*` | allowlist emptied, 24h supply-chain guard kept |
| `bun.lock` pinning the wrapper | stubbed; regenerated on install |

The `.vendor/` directory and `src/lib/vendor-error-reporting.ts` are inert
shims — safe to delete, kept only so a stale import can't break the build.

---

## 1. Supabase

Create a project at supabase.com. Then:

```sh
cd supabase/restore
unzip round-robin-db.backup.zip
./restore.sh "postgresql://postgres:PASSWORD@db.YOUR_REF.supabase.co:5432/postgres"
```

Details and the self-hosting alternative: `supabase/restore/README.md`.

Then apply, in the SQL editor, in order:

```
supabase/migrations/20260803120000_audit_log_and_hardening.sql
supabase/migrations/20260803130000_scope_reads_without_service_role.sql
```

The second is load-bearing. Without it every screen renders empty.

## 2. Environment

```sh
cp .env.example .env
```

Minimum to boot: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and the two
`VITE_` copies of them. AI and voice are optional and degrade to a clear
message when unset.

## 3. Run

```sh
npm install
npm run dev
```

You should see 14 clinics, 48 rounds, 79 tasks.

## 4. Deploy

Cloudflare Workers is preconfigured:

```sh
npm run build && ls .output      # expect server/index.mjs and public/
npx wrangler login
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_PUBLISHABLE_KEY
npm run deploy
```

**Another host?** Change `target` in `vite.config.ts` — `"node"`,
`"vercel"`, `"netlify"`. Nothing in the app depends on Cloudflare; the only
platform-specific file is `wrangler.jsonc`.

Remember the split: `VITE_*` are compiled into the client bundle at build time
and must be present when you run `npm run build`. Everything else is read at
runtime from secrets.

---

## Verified vs not

Static checks pass across all 127 source files: every import resolves, every
named import exists, JSX balances, all route targets and `useStore` keys are
real.

**Not executed.** My sandbox has no npm registry and no root, so I could never
run `tsc`, `vite build`, or Postgres. Two things to watch on first run:

1. **`vite.config.ts`** replaces a wrapper whose internals I couldn't inspect.
   The plugin list matches TanStack Start's documented setup, but plugin order
   or the nitro `target` may need a nudge. If the build fails here, the error
   is usually explicit about which plugin.
2. **`npm run typecheck`** has never been run against real types.

Paste any errors and I'll fix them.
