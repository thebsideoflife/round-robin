# Demo script — clinic leadership

**Audience:** practice managers, directors, VPs of ambulatory ops.
**Length:** 10–12 minutes.
**Device:** your phone, screen-mirrored. Not a laptop. The whole argument is
that this works in a hallway.

---

## The one sentence to open with

> "Leadership rounding programs don't fail because people don't round. They
> fail because what gets said in the hallway never turns into anything, and
> nobody can tell you who owns it."

Then don't explain the product. Show a round.

---

## Beat 1 — Round with your voice (3 min)

**Do:** Home screen icon → app opens full screen, no browser chrome. Tap the mic
button. Pick a clinic, tap **Say name**, speak a provider's name. Next.

On the conversation step, tap **Dictate** under "What barriers are getting in
your way?" and talk the way a manager actually would:

> "Referrals are backing up because we're down a scheduler. Sarah's covering
> two panels and patients are waiting eleven days for a callback."

**Say while it transcribes:** "This is a manager standing outside an exam room
between patients. Not somebody at a desk after hours filling in a form they
already forgot the details of."

**The point to land:** the transcript is *editable text*, not a submission. You
review your own wording before it becomes part of the record.

> If someone asks about accuracy — it handles clinical vocabulary because the
> model gets a domain prompt. It will not get every drug name right. It gets you
> to 90% and you fix the rest with your thumb, which beats typing it all.

## Beat 2 — The conversation becomes owned work (3 min)

**Do:** Step 3. Add an action item. Point at the **Owner** dropdown.

**Say:** "It defaulted to the person actually accountable for this clinic — not
me, because I logged it. And look here—" *(point at the escalation tier)* "—the
system already decided this is a Director-level issue, because the same theme is
open at three other clinics. That's not a dropdown I had to think about."

Step 4 → **Summarize this conversation** → save.

**The point to land:** the manager did not do any triage. They talked, and the
system routed.

## Beat 3 — Escalation has a name on it (2 min)

**Do:** Work tab → open an escalated item → scroll to **Escalation path**.

**Say:** "Every rounding tool I've seen shows you a label that says 'Director
Review.' This shows you *Karen*. And Karen sees it on her own home screen under
'Needs your decision' — not buried in a report of everything happening in her
region."

**This is the single strongest moment in the demo.** Let it sit. Ask directly:
"How do you currently know an escalated issue landed on a specific person?"

## Beat 4 — Top-down, without leaving the phone (2 min)

**Do:** Avatar menu → **View as** → pick an Executive Director. Today reloads.
Scroll to **My organization**. Tap a director, then a manager, then a clinic.

**Say:** "Same app, same four tabs. A VP isn't using a different product — they
just have people under them, so the org section drills. A manager has no one
under them and sees their clinics directly."

**Say:** "Sorted worst-health-first, always. You never hunt for the problem."

## Beat 5 — Close on validation (1 min)

**Do:** Back to a round → the **Validate open issues** step. Point at "Resolved"
/ "Still a problem."

**Say:** "This is the part that makes it a loop instead of a suggestion box. Next
time you round at this clinic, the app asks whether the thing you promised
actually got fixed. That's what turns rounding into a program somebody can
audit."

---

## Questions you will get

**"How long does a round take?"**
Two to three minutes talking. Show the timer if they push — don't claim a number
you haven't measured on their workflow.

**"Is this HIPAA compliant?"**
Be straight: not yet, and deliberately so. There's no PHI in it today — it's
staff-facing operational data. `SECURITY.md` is the roadmap: RLS on every table,
an append-only audit log, automatic logoff, and voice audio that's never
persisted. What's outstanding is BAAs and a formal review. Offer to walk their
security lead through it. **Do not say "yes."**

**"What happens to the voice recordings?"**
Nothing. Audio is transcribed in one request and discarded — never written to a
database or storage. Only the text you reviewed is kept.

**"Our managers aren't technical."**
Four tabs, one big button. Show them the home screen icon again — as far as a
manager is concerned it's an app on their phone, and it updates itself.

**"What if there's no signal in the building?"**
Right now it tells you you're offline rather than showing stale numbers, which
is the deliberate choice for clinical data. Offline round capture is a real
roadmap item — don't imply it exists.

**"Can it integrate with Epic / our HRIS?"**
Nothing is built. The org hierarchy and clinic assignments are the natural sync
points. Take it as a requirement, don't design it live.

---

## Pre-flight, day of

- [ ] Demo data loaded and **spot-checked** — open Today and confirm it looks
      populated, not empty
- [ ] Signed in on the phone already; session not timed out (20 min idle logout)
- [ ] Mic permission already granted for the origin
- [ ] Tested on the **actual network** in the room
- [ ] One round pre-filled by typing, as a fallback if transcription fails
- [ ] Screen mirroring tested
- [ ] Notifications off, Do Not Disturb on

## If the mic fails live

Don't debug it. Say: "Transcription's a network call and this wifi isn't having
it — here's the same flow typed," and keep moving. You lose thirty seconds. If
you start troubleshooting you lose the room.
