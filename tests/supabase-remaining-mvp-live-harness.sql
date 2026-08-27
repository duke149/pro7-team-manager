-- Disposable PostgreSQL 17 harness. Prerequisite migrations must already exist.
\set ON_ERROR_STOP on
\ir ../supabase/migrations/20260826043803_pro7_remaining_mvp.sql
\ir supabase-remaining-mvp-live-verification.sql
select 'remaining_mvp_live_harness_ok' as result;
