-- Run against PostgreSQL 17 with the core, RLS-visibility, and foundation
-- migrations already applied:
-- psql -X -v ON_ERROR_STOP=1 -f tests/supabase-squad-live-harness.sql

\set ON_ERROR_STOP on
set role postgres;
\ir ../supabase/migrations/20260825091904_pro7_squad_profiles.sql
\ir supabase-squad-live-verification.sql
