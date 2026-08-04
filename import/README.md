# Filling in your organization

`round-robin-org-template.xlsx` — three yellow tabs to complete, in this order:

1. **People** — everyone who will sign in (email, name, title, role)
2. **Clinics** — every site
3. **Assignments** — who covers which clinic, at which level

The **Checks** tab totals everything as you type. Get the three "must be 0" rows to zero
and the counts matching, and the file is ready.

## The part people get wrong

Assignments, not roles, are what the database checks. A director with the `director` role
but no rows in Assignments sees an empty app. Give every clinic three rows — a manager, a
director and an executive director.

## Turning it into the database

Send the completed file back and I'll generate the SQL, or run it yourself:

```sh
node scripts/import-org.mjs import/round-robin-org-template.xlsx > import/org.sql
```

Then paste `org.sql` into the Supabase SQL editor. It's idempotent — re-running updates
rather than duplicating, so you can correct the spreadsheet and run it again.

## What it creates

- A row in `clinics` per clinic
- A pending invitation per person, with their role attached
- A row in `clinic_assignments` per assignment
- `teams` / `team_members` derived from the assignments, so the supervisor chain works

People aren't created as accounts with passwords. When someone signs up with the email in
the sheet, the existing database trigger grants their role automatically — no approval step.
