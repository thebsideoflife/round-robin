# Restoring the database into your own Supabase

## 1. Create a project

supabase.com → new project. Note the project ref, the database password you
set, and grab **Project settings → API** for the keys.

Because it's yours, you get a real `service_role` key — which the previous host
never issued. Nothing on the app's critical path needs it, but it makes the
legacy admin functions and the in-app demo seeder work again.

## 2. Restore

```sh
cd supabase/restore
unzip round-robin-db.backup.zip
./restore.sh "postgresql://postgres:YOUR_PASSWORD@db.YOUR_REF.supabase.co:5432/postgres"
```

Needs `pg_restore` and `psql` — `brew install libpq` on macOS, then add
`/opt/homebrew/opt/libpq/bin` to your PATH.

### Why two passes

The archive is a dump of an entire Supabase database. A new project already has
`auth`, `storage`, `realtime` and `vault`, owned by Supabase's internal roles.
Restoring those wholesale fights the existing objects and usually leaves the
project in a worse state than when you started.

So the script restores the `public` schema in full, then restores **only the
data** for `auth.users` and `auth.identities`. That keeps every existing login
working — `encrypted_password` comes across, so people's passwords are
unchanged — without touching GoTrue's own table definitions.

Expect noisy "already exists" lines on the first pass. They're filtered where
possible and are harmless; the verification query at the end is what matters.

## 3. Apply the migrations

In the SQL editor, in order:

```
supabase/migrations/20260803120000_audit_log_and_hardening.sql
supabase/migrations/20260803130000_scope_reads_without_service_role.sql
```

The second one is load-bearing: without it the app reads nothing.

## 4. Point the app at it

Update `.env`:

```
SUPABASE_URL="https://YOUR_REF.supabase.co"
SUPABASE_PUBLISHABLE_KEY="sb_publishable_..."
SUPABASE_SERVICE_ROLE_KEY="sb_secret_..."
VITE_SUPABASE_URL="https://YOUR_REF.supabase.co"
VITE_SUPABASE_PUBLISHABLE_KEY="sb_publishable_..."
```

## If you'd rather not use hosted Supabase

The app needs Postgres **plus** GoTrue (for `auth.uid()` in RLS policies) and
PostgREST. Self-hosting via `supabase/docker` works and the same restore script
applies — point `DB_URL` at your own instance. Plain Postgres alone is not
enough: every RLS policy in this schema calls `auth.uid()`.
