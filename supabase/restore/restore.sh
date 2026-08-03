#!/usr/bin/env bash
#
# Restore the Round Robin database into a Supabase project you own.
#
#   ./restore.sh "postgresql://postgres:PASSWORD@db.<ref>.supabase.co:5432/postgres"
#
# The dump is a pg_dump custom-format archive of a whole Supabase database
# (PostgreSQL 17, zstd-compressed). You cannot restore it wholesale into a new
# project: the auth, storage and realtime schemas already exist there, owned by
# Supabase's own roles, and a blind restore fights them.
#
# So this restores in two passes:
#   1. the public schema — all of the application's own tables and data
#   2. auth.users and auth.identities, data only, so existing logins keep working
#
# Everything else (storage, realtime, vault, extensions) is left to the target
# project, which already has its own correct copies.
set -euo pipefail

DB_URL="${1:-}"
BACKUP="${2:-$(dirname "$0")/a8f43c5a-0750-425d-817f-ccc65e2177b7_260803.backup}"

if [[ -z "$DB_URL" ]]; then
  echo "usage: $0 <postgres-connection-url> [path-to-.backup]" >&2
  echo "Find the URL in Supabase → Project settings → Database → Connection string → URI" >&2
  exit 1
fi
if [[ ! -f "$BACKUP" ]]; then
  echo "Backup not found at $BACKUP" >&2
  echo "Unzip round-robin-db.backup.zip in this directory first." >&2
  exit 1
fi

command -v pg_restore >/dev/null || { echo "pg_restore not found. brew install libpq (macOS)" >&2; exit 1; }

echo "==> 1/3  Restoring the public schema (tables, data, functions, RLS policies)"
pg_restore \
  --dbname="$DB_URL" \
  --schema=public \
  --no-owner --no-privileges --no-comments \
  --clean --if-exists \
  --exit-on-error=false \
  "$BACKUP" 2>&1 | grep -v "already exists\|does not exist" || true

echo "==> 2/3  Restoring auth.users and auth.identities (data only)"
# --data-only avoids touching the GoTrue-owned table definitions.
pg_restore \
  --dbname="$DB_URL" \
  --data-only \
  --table=users --table=identities \
  --schema=auth \
  --no-owner --no-privileges \
  --exit-on-error=false \
  "$BACKUP" 2>&1 | grep -v "already exists\|duplicate key" || true

echo "==> 3/3  Verifying"
psql "$DB_URL" -v ON_ERROR_STOP=1 <<'SQL'
SELECT 'clinics'    AS table, count(*) FROM public.clinics
UNION ALL SELECT 'rounds',    count(*) FROM public.rounds
UNION ALL SELECT 'tasks',     count(*) FROM public.tasks
UNION ALL SELECT 'reports',   count(*) FROM public.reports
UNION ALL SELECT 'profiles',  count(*) FROM public.profiles
UNION ALL SELECT 'user_roles',count(*) FROM public.user_roles
UNION ALL SELECT 'auth.users',count(*) FROM auth.users
ORDER BY 1;
SQL

cat <<'DONE'

Expected roughly: 14 clinics, 48 rounds, 79 tasks, 6 reports, 23 profiles,
23 user_roles, 24 auth users.

Next:
  1. Apply the two migrations in supabase/migrations/ that are dated 20260803.
  2. Point .env at this project (URL + publishable key + service role key).
  3. npm run dev
DONE
