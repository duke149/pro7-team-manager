-- Run with psql after core and pending-RLS migrations:
-- psql -X -v ON_ERROR_STOP=1 -f tests/supabase-foundation-live-harness.sql
-- The include order is part of the verification contract.

\set ON_ERROR_STOP on
\ir supabase-foundation-pre-migration-fixtures.sql
\ir ../supabase/migrations/20260825013307_pro7_foundation_permissions.sql
\ir supabase-foundation-live-verification.sql
\ir supabase-foundation-fixture-cleanup.sql
