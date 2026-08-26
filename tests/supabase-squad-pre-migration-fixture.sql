-- Committed pre-Squad fixture. The live harness applies this after the three
-- prerequisite migrations and before the Squad migration so backfill behavior
-- is reproducible from repository artifacts.

set role postgres;

do $verification$
begin
  if pg_catalog.to_regclass('public.team_player_profiles') is not null then
    raise exception
      'squad pre-migration fixture: team_player_profiles already exists';
  end if;
end;
$verification$;

insert into auth.users (
  id,
  email,
  email_confirmed_at,
  raw_user_meta_data
)
values (
  '00000000-0000-4000-8000-000000007001'::uuid,
  'squad-prebackfill@example.test',
  pg_catalog.now(),
  '{"display_name":"Squad Prebackfill"}'::jsonb
);

insert into public.teams (id, name, slug, owner_user_id)
values (
  '00000000-0000-4000-8000-000000007002'::uuid,
  'Squad Prebackfill',
  'squad-prebackfill-20260826',
  '00000000-0000-4000-8000-000000007001'::uuid
);

update public.memberships
set joined_at = timestamptz '2024-01-15 12:00:00+00'
where team_id = '00000000-0000-4000-8000-000000007002'::uuid
  and user_id = '00000000-0000-4000-8000-000000007001'::uuid;

do $verification$
begin
  if (
    select pg_catalog.count(*)
    from public.memberships
    where team_id = '00000000-0000-4000-8000-000000007002'::uuid
      and user_id = '00000000-0000-4000-8000-000000007001'::uuid
      and status = 'active'
      and joined_at = timestamptz '2024-01-15 12:00:00+00'
  ) <> 1 then
    raise exception
      'squad pre-migration fixture: expected exactly one active membership';
  end if;
end;
$verification$;

select 'squad_pre_migration_fixture_ok_one_active_membership' as result;
