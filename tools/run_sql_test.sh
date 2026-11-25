#!/usr/bin/env bash
# Run a SQL test file against the linked Supabase project inside BEGIN ... ROLLBACK, so nothing it
# does is kept. Optionally run migration files first in the same transaction, to test a migration
# before it's applied.
#
#   tools/run_sql_test.sh supabase/tests/012_access.sql
#   tools/run_sql_test.sh supabase/tests/012_access.sql supabase/migrations/012_*.sql   # pre-apply
#
# Needs the Supabase CLI linked to the project (npx supabase link). Always targets --remote.

set -euo pipefail

TEST="$1"; shift
SQL_FILE="$(mktemp -t sqltest.XXXXXX.sql)"
trap 'rm -f "$SQL_FILE"' EXIT

{
  echo "begin;"
  for migration in "$@"; do cat "$migration"; echo; done
  cat "$TEST"; echo
  echo "rollback;"
} > "$SQL_FILE"

# --yes: the CLI asks before any statement that could write to a hosted project; this one always
# ends in ROLLBACK (and any error aborts the transaction), so nothing persists.
# On Windows (Git Bash) the CLI is a native binary and can't open /tmp-style paths.
FILE="$SQL_FILE"; command -v cygpath >/dev/null 2>&1 && FILE="$(cygpath -w "$SQL_FILE")"
npx supabase db query --remote --yes --file "$FILE"
