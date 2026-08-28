\set ON_ERROR_STOP on
\ir ../supabase/migrations/20260828120720_pro7_web_push_rsvp.sql
\ir supabase-web-push-live-verification.sql
select 'web_push_live_harness_ok' as result;
