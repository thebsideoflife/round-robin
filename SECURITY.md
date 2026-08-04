# Security posture

Written for the state of the app today: **no PHI is stored yet**, and the goal
is to be ready for a HIPAA-eligible release without a rewrite.

---

## What's in place now

| Control | Where | Notes |
|---|---|---|
| Row-level security on every table | `supabase/migrations/*` | RLS is the authorization boundary, not the client. |
| Clinic-scoped access via `can_access_clinic()` | migration 1 | Resolves through `clinic_assignments` + supervisor chain. |
| Role checks in a separate table | `user_roles` + `has_role()` | Roles are never read off the JWT or a user-editable column. |
| Bearer-token verification on every server function | `auth-middleware.ts` | `getClaims` is verified server-side; no trust in client claims. |
| Append-only audit log | `20260803120000_audit_log_and_hardening.sql` | Insert/update/delete triggers on all clinical tables + `log_read()` for explicit read logging. |
| Security response headers | `src/lib/security-headers.ts` | CSP, HSTS, `X-Frame-Options: DENY`, `Permissions-Policy: microphone=(self)`. |
| Automatic logoff | `src/hooks/use-idle-logout.ts` | 20 minutes default, configurable. HIPAA §164.312(a)(2)(iii). |
| Voice audio never persisted | `src/lib/transcribe.functions.ts` | Held in memory for one request; only byte length is logged. |
| Rate limiting on transcription | `src/lib/transcribe.functions.ts` | Per-user sliding window. |

---

## Findings from this pass

### 1. `.env` was tracked in git — **action required**
The repo shipped a committed `.env`. The Supabase *publishable* key in it is
public by design, so nothing is currently exposed. The risk is structural: the
moment someone adds `SUPABASE_SERVICE_ROLE_KEY` to that file it gets committed
too, and that key bypasses RLS entirely.

Done here: `.env` and `.env.*` added to `.gitignore`, `.env.example` added.

**You still need to** run `git rm --cached .env` and commit, so it stops being
tracked. If a service-role key was ever in there, rotate it in the Supabase
dashboard.

### 2. CSP ships in Report-Only mode
TanStack Start emits inline hydration scripts, so a strict `script-src` needs a
per-request nonce. Rather than risk breaking the app, the policy is
Report-Only. Watch it for one release, then set `CSP_ENFORCE=1`.

### 3. "View as" is a client-side preview only
`canViewAs` is computed in the browser. This is **not** currently a
vulnerability — the server only ever returns the real user's scope, so
previewing another leader cannot reveal data they aren't already entitled to.
But it does mean the feature is cosmetic. If you ever want a true impersonation
mode, it has to move server-side with its own audit event.

### 4. Rate limiting is per-instance
The transcription limiter is an in-memory `Map`. Fine on one node; move it to
Postgres or KV before scaling horizontally.

### 5. Read logging is opt-in
Postgres can't trigger on `SELECT`. `log_read()` exists but has to be called
from server functions on the paths that matter. Wire it into report and task
detail loads before PHI lands.

---

### 6. Robin can read round notes

`ROBIN_READ_NOTES` defaults to `1`, which lets the assistant quote what staff
actually said in a rounding conversation. That text is sent to Gemini.

Everything else Robin sees is numeric — counts, scores, clinic names. Set
`ROBIN_READ_NOTES=0` to restrict it to those and keep free text out of the
model entirely. Do that before this system holds anything PHI-adjacent, or
confirm your Gemini terms cover it.

Robin is read-only by design: it has no tool that writes. It also loads data
through the same RLS-scoped query the app uses, so it can never surface a
clinic the asker isn't entitled to see.

## Before you touch PHI

- [ ] **BAAs**: Supabase, your hosting provider, and whichever transcription
      vendor you configure. Pin `WHISPER_API_KEY` to the vendor you signed with
      rather than falling through to the AI gateway.
- [ ] **Rotate** the Supabase service-role key and confirm it exists only as a
      server-side environment variable.
- [ ] **Enforce CSP** (`CSP_ENFORCE=1`).
- [ ] **Encryption at rest** — confirm it's on for the Postgres instance and any
      object storage holding uploaded scorecards.
- [ ] **Call `log_read()`** on report detail, task detail and any export.
- [ ] **Backup and recovery test** — a documented, actually-executed restore.
- [ ] **Breach notification runbook** — who is called, in what order, by when.
- [ ] **Workforce access review** — a scheduled recertification of
      `user_roles` and `clinic_assignments`.
- [ ] **MFA** on Supabase Auth for anyone with director-level access or above.
- [ ] **De-identify AI prompts** or confirm the BAA covers what's sent. Round
      notes today contain staff names and can contain patient-adjacent detail.

## Not required yet, worth knowing

- Voice notes are the highest-risk surface you're adding. A manager dictating
  "the patient in room 4" turns a non-PHI app into a PHI app instantly. Consider
  an in-app reminder on the record screen, and decide deliberately whether
  transcripts get the same retention treatment as the rest of the record.
