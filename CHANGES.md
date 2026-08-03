# What changed

Six things you asked for, in the order you listed them.

---

## 1. Mobile-first and less stale

**Design system** (`src/styles.css`)
- Brighter, more saturated indigo brand; warm-neutral canvas instead of clinical gray. The desktop sidebar went from a dark navy slab to a light rail.
- New tokens: `--surface`, `--surface-2`, `--brand`, three elevation levels, and `--appbar-h` / `--tabbar-h` for the shell.
- Mobile base layer: safe-area insets, `100dvh`, no tap-highlight, no rubber-banding, `prefers-reduced-motion` honored.
- **16px inputs on coarse pointers.** iOS Safari silently zooms the viewport whenever a focused input renders below 16px — this was happening on every form in the app.
- Utilities: `.tap-target` (44px minimum), `.scroll-rail` (snapping chip rows), `.pb-tabbar`, `.press`.

**Shell** (`src/components/app-shell.tsx`, rewritten)
- Bottom tab bar on mobile with a live overdue badge; slim rail on desktop.
- Contextual app bar with a back affordance on detail routes.
- Floating mic button for "start a round" — the single most common field action, always one tap away.
- The 200px "View as" select that was eating the mobile app bar is now compact.

## 2. De-duplication

`src/components/primitives.tsx` is new and is where most of this happened. The same metric tile, chevron row and filter chip markup was hand-rolled in nine route files with drifting spacing and tap-target sizes.

| Was | Now |
|---|---|
| `dashboards.tsx`, 689 lines, 4 near-identical role dashboards | `org-overview.tsx`, one role-adaptive drilldown |
| `SectionHeading` in `stat-card.tsx` + inline copies | one in `primitives.tsx`; `stat-card.tsx` is a shim |
| `EmptyState` in `task-row.tsx` | one in `primitives.tsx`; re-exported |
| shadcn `Tabs` bars that clipped below 380px | `FilterRail`, scrolls and snaps |

## 3. Hierarchy — top-down and bottom-up

`src/lib/domain/org.ts` is new and is the single source of truth.

**Top-down.** `branchesUnder()` walks the real reporting tree and rolls up metrics per direct report. Instead of four dashboards hard-coding a level per role, you start at yourself and drill until you hit managers, then clinics. A manager simply has no branches and sees clinics directly.

**Bottom-up.** This is the part that was missing. Escalation used to be a *label* — "Director Review" with no way to tell who that meant, so escalated items sat unowned.
- `ownerAtLevel()` resolves a tier to a named person via the clinic's manager/director/executive assignments.
- `escalationPath()` returns the full chain; rendered on the task detail screen by the new `EscalationPath` component.
- `assignmentCandidates()` ranks owners by accountability for *that clinic at that tier*, and pre-selects the right one. The old owner picker listed 40 arbitrary people.
- Today's "Needs your decision" is scoped to items where *you* are the named owner — not "everything escalated in my scope."

Date helpers moved to `domain/time.ts` so `org.ts` and `permissions.ts` can share them without a circular import. `permissions.ts` now delegates to the graph, so a director still sees a clinic that names one of their managers even if that clinic's `director_id` has drifted.

## 4. Microphone

- `hooks/use-voice-capture.ts` — MediaRecorder with iOS-safe container negotiation (`audio/mp4` on Safari, `audio/webm;codecs=opus` elsewhere), live level meter, 3-minute cap, mic track torn down on unmount/error/cancel.
- `components/voice-input.tsx` — `VoiceButton` and `VoiceTextarea`. Every free-text field on the round composer takes dictation.
- `lib/transcribe.functions.ts` — authenticated server function. Audio lives in memory for one request; never written to disk, Storage or a column. Only byte length is logged.

**Why not the Web Speech API:** it doesn't exist in iOS Safari, and most rounding happens on an iPhone in a hallway.

**Configure one of:** `WHISPER_API_KEY` (any Whisper-compatible endpoint — preferred, cheaper, and lets you pick a vendor you hold a BAA with) or fall back to the existing `LOVABLE_API_KEY`.

⚠️ The gateway fallback sends audio as an OpenAI-style `input_audio` part. Verify that against the the previous host gateway with a real clip before relying on it — it's the one piece here I couldn't execute. The Whisper path is a standard multipart upload and is the safer default.

**The round composer** (`rounds/new.tsx`) went from one 720-line scroll to four steps — Who / Conversation / Follow-up / Review — with a sticky action bar. It's now fillable one-handed while standing up.

## 5. Ship from one codebase, no terminal

Installable PWA:
- `public/manifest.webmanifest`, generated icons (incl. maskable), Apple meta tags, shortcuts for "Start a round" and "My overdue work".
- `public/sw.js` — deliberately conservative for a clinical tool. **HTML and API traffic are never served stale**; only content-hashed build assets are cached. Offline shows `offline.html` rather than yesterday's numbers.
- `components/pwa.tsx` — registration, hourly update checks for long-lived sessions on shared devices, an in-app "Update" banner, and an install prompt (native on Android, Share-sheet instructions on iOS since it has no `beforeinstallprompt`).

Deploy → new `sw.js` → installed devices pick it up on next launch, open sessions get the banner. No app store review, no terminal.

## 6. Security

See **`SECURITY.md`** for the full posture and the pre-PHI checklist. Highlights:

- `lib/security-headers.ts` — CSP, HSTS, `X-Frame-Options: DENY`, `Permissions-Policy: microphone=(self)`, COOP/CORP, `no-store` on documents. Applied in `server.ts`.
  - CSP ships **Report-Only** because TanStack Start emits inline hydration scripts; flip `CSP_ENFORCE=1` after watching a release.
- New migration: append-only `audit_log` with triggers on every clinical table, a `log_read()` function for explicit read logging, and a retention helper.
- `hooks/use-idle-logout.ts` — 20-minute automatic logoff (HIPAA §164.312(a)(2)(iii)), for phones left on nurses' stations.
- `.env` was tracked in git. Added to `.gitignore` with an `.env.example`. **You still need `git rm --cached .env`** — see SECURITY.md.

**One thing I did *not* do:** the first draft of the migration revoked `INSERT/UPDATE/DELETE` on `invitations` from `authenticated`. That would have broken the admin invite flow, which issues those writes through the user-scoped client and relies on RLS to gate them. Left in place, with a comment explaining why.

---

## Routes

Nine top-level entries became four. Every retired route is a redirect, so bookmarks and home-screen shortcuts still work.

| Old | New |
|---|---|
| `/dashboard` | `/today` |
| `/recommendations` | `/today` — "Where to round next" |
| `/weekly` | `/today` — "This week" |
| `/escalations` | `/tasks?filter=Escalated` |
| `/trends` | `/insights?tab=Themes` |
| `/clinics` | `/insights?tab=Clinics` |
| `/px` | `/insights?tab=PX` |

---

## Before you run it

```sh
npm install
npm run dev
```

I could not execute `tsc` or `vite build` — the sandbox blocks the npm registry, so there were no `node_modules` to build against. Instead I ran a static checker over all 123 source files: every local import resolves, every named import exists in its target, all JSX tags balance, every `useStore()` key exists on `StoreValue`, and every `<Link to>` and `redirect()` target matches a real route. **Expect to fix a small number of type errors on first build anyway** — most likely candidates are TanStack's generated `search` param types on the new `/today` and `/insights` links.

`src/routeTree.gen.ts` is normally regenerated by the router plugin, but I patched it by hand as well so a cold build resolves `/today` and `/insights` either way.
