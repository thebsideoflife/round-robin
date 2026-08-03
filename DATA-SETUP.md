# Getting data into the app

## Your database already has the data

I opened the backup you sent (`pg_dump` custom format, zstd-compressed).
It contains:

| | |
|---|---|
| auth users | 24 |
| clinics | 14 |
| clinic assignments | 37 |
| rounds | 48 |
| round findings / wins | 89 / 16 |
| tasks | 79 |
| task events | 149 |
| PX reports | 6 (with 18 opportunities, 30 providers, 47 priority-index rows, 23 coaching plans) |
| user roles | 23 — 1 admin, 3 executive directors, 5 directors, 13 managers |

So the demo org was seeded at some point and has been sitting there the whole
time. **Do not run `demo_data.sql`** — you don't need it. It's still in the
repo if you ever want a clean second environment.

## What was actually wrong

`getScope()` — the one query that feeds every screen — imported the
**service-role** Supabase client to read `profiles` and `user_roles`. the previous host
Cloud doesn't issue a service-role key, so that import threw, the scope query
failed, and the app rendered empty no matter what was in the database.

That's fixed. Reads now go through the signed-in user's client, with RLS doing
the filtering. Nothing in the app requires a service-role key any more.

## Do this, in order

### 1. Run the migrations (skip the seed)

Supabase / your Supabase project → SQL editor.

**a. `supabase/migrations/20260803130000_scope_reads_without_service_role.sql`**

Adds a scoped read policy on `user_roles`, plus four SECURITY DEFINER
functions that replace the `auth.admin.*` calls: `bootstrap_first_admin`,
`admin_list_users`, `admin_set_role`, `admin_set_clinic_assignment`.

If you haven't run it yet, also apply
`supabase/migrations/20260803120000_audit_log_and_hardening.sql` first — the
bootstrap function writes to `audit_log`.

That's it. Your data is already there — the migration is what lets the app
*read* it.

`supabase/seed/demo_data.sql` exists if you ever want to populate a fresh
project (change `v_admin_email` at the top first), but you don't need it now.

### 2. Restart and reload

```sh
npm run dev
```

Demo accounts can sign in directly: `first.last@rnr-demo.org` /
`DemoRnR!2026` — e.g. `elena.vasquez@rnr-demo.org` (executive director),
`jordan.walsh@rnr-demo.org` (director), `dana.whitfield@rnr-demo.org`
(manager). Or stay admin and use **View as** in the top bar.

## Managing people

Avatar menu → **People & access** (`/admin/users`).

- **Invite** by email with a role. Since we can't create auth accounts without
  a service-role key, this writes an invitation row — when that person signs
  up with the same email, the existing database trigger grants the role
  automatically. No approval step.
- **Change a role** by tapping a person. The database refuses to remove the
  last remaining admin, so you can't lock yourself out.
- **Assign clinics.** This is the part that matters: clinic assignments are
  what decide who sees which data *and* who an issue escalates to. A director
  with no assignments sees nothing.

## One gap worth knowing about

`teams` and `team_members` have a single row each, but there are 5 directors.
Those tables back `is_supervisor_of()`, which some RLS policies consult.

It isn't breaking anything today: every clinic carries direct
`clinic_assignments` for all three tiers, so access resolves through the
assignment path instead. But if you later add someone who supervises people
*without* sharing a clinic with them, they'll see nothing until the team rows
exist. **People & access → assign clinics** is the reliable way to grant
visibility right now.

## What I could not verify

I have no way to run Postgres or Node in my sandbox — no root for `apt`, and
the npm registry is blocked. So:

- **The migration SQL is unexecuted.** I verified dollar-quote balance and
  every column and function signature against your existing migrations by
  hand. That catches the common failure modes but isn't the same as running
  it.
- **The TypeScript is uncompiled.** Import graph, JSX balance, store keys and
  route targets all check out statically.

If either throws, paste the error and I'll fix it.

---

## Brand assets

The supplied SVG is the master. `brand/round-robin-logo-ORIGINAL.svg` is a
byte-for-byte copy and is **not** served.

Everything in `public/brand/` is that same SVG with a different `viewBox` —
no paths were edited — so the mark, lockup and wordmark can never drift from
the master:

| File | viewBox | Used by |
|---|---|---|
| `round-robin-mark.svg` | mark only, transparent | app bar, desktop rail, favicon, PWA icon |
| `round-robin-lockup.svg` | mark + wordmark, transparent | sign-in |
| `round-robin-wordmark.svg` | wordmark only | wide placements |

The `.png` copies alongside them are small legacy fallbacks; nothing in `src/`
references them. `round-robin-lockup.jpg` is a leftover from the first pass and
can be deleted — my sandbox wouldn't let me remove it.

`--background` is set to `#EFF7F8`, sampled from the SVG's own backdrop rect,
so the logo never shows a box against the canvas. `theme-color` matches, so the
iOS status bar blends with the plate.

Service worker cache is at `rr-v4-vector`. Bump it whenever brand assets change
or installed devices keep the old icon.
