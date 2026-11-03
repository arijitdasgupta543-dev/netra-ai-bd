#!/bin/sh
# Recreate a test database, apply all migrations and run the behaviour checks.
# Usage: P="psql -h localhost -p 5432 -U postgres" ROOT=/path/to/netra-ai-bd sh reset.sh
: "${P:=psql}"; : "${ROOT:=..}"
$P -c "drop database if exists t" -c "create database t" \
 && $P -d t -f "$ROOT/research/database_tests/shim.sql" \
 && for f in "$ROOT"/drizzle/migrations/00*.sql; do $P -d t -f "$f" || exit 1; done \
 && $P -d t -f "$ROOT/research/database_tests/behaviour.sql" 2>&1 | grep -E "expect|NOTICE|FAIL|ERROR"
