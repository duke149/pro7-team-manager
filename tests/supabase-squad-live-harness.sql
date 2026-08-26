-- Run against PostgreSQL 17 with the core, RLS-visibility, and foundation
-- migrations already applied:
-- psql -X -v ON_ERROR_STOP=1 -f tests/supabase-squad-live-harness.sql

\set ON_ERROR_STOP on
set role postgres;
\ir supabase-squad-pre-migration-fixture.sql
\ir ../supabase/migrations/20260825091904_pro7_squad_profiles.sql
\ir supabase-squad-live-verification.sql

begin;
set local role postgres;

delete from public.team_player_profiles
where team_id = '00000000-0000-4000-8000-000000007002'::uuid
   or user_id = '00000000-0000-4000-8000-000000007001'::uuid;

delete from public.memberships
where team_id = '00000000-0000-4000-8000-000000007002'::uuid
   or user_id = '00000000-0000-4000-8000-000000007001'::uuid;

delete from public.teams
where id = '00000000-0000-4000-8000-000000007002'::uuid;

delete from auth.users
where id = '00000000-0000-4000-8000-000000007001'::uuid;

delete from private.audit_events
where team_id = '00000000-0000-4000-8000-000000007002'::uuid
   or actor_user_id = '00000000-0000-4000-8000-000000007001'::uuid
   or row_key @> pg_catalog.jsonb_build_object(
     'id', '00000000-0000-4000-8000-000000007001'::uuid
   )
   or row_key @> pg_catalog.jsonb_build_object(
     'id', '00000000-0000-4000-8000-000000007002'::uuid
   );

commit;

do $cleanup_verification$
begin
  if exists (
    select 1
    from auth.users
    where id = '00000000-0000-4000-8000-000000007001'::uuid
  ) or exists (
    select 1
    from public.profiles
    where id = '00000000-0000-4000-8000-000000007001'::uuid
  ) or exists (
    select 1
    from public.memberships
    where team_id = '00000000-0000-4000-8000-000000007002'::uuid
       or user_id = '00000000-0000-4000-8000-000000007001'::uuid
  ) or exists (
    select 1
    from public.team_player_profiles
    where team_id = '00000000-0000-4000-8000-000000007002'::uuid
       or user_id = '00000000-0000-4000-8000-000000007001'::uuid
  ) or exists (
    select 1
    from public.teams
    where id = '00000000-0000-4000-8000-000000007002'::uuid
  ) or exists (
    select 1
    from private.audit_events
    where team_id = '00000000-0000-4000-8000-000000007002'::uuid
       or actor_user_id = '00000000-0000-4000-8000-000000007001'::uuid
  ) then
    raise exception
      'squad live harness: pre-migration fixture cleanup left residue';
  end if;
end;
$cleanup_verification$;

select 'squad_pre_migration_fixture_cleanup_zero' as result;
