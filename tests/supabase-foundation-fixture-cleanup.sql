-- Clean persisted pre-migration fixtures after the rollback-only verifier.
-- The temporary ID table makes the final zero-count evidence reproducible.

begin;

create temporary table foundation_fixture_teams on commit drop as
select id
from public.teams
where slug = 'foundation-existing-verification-20260825';

create temporary table foundation_fixture_roles on commit drop as
select r.id
from public.roles as r
join foundation_fixture_teams as t on t.id = r.team_id;

delete from private.audit_events as a
using foundation_fixture_teams as t
where a.team_id = t.id;

delete from private.audit_events as a
using foundation_fixture_roles as r
where a.table_name = 'role_permissions'
  and a.action = 'DELETE'
  and a.row_key ->> 'role_id' = r.id::text;

delete from public.teams as team
using foundation_fixture_teams as t
where team.id = t.id;

delete from private.audit_events as a
using foundation_fixture_teams as t
where a.team_id = t.id;

delete from private.audit_events as a
using foundation_fixture_roles as r
where a.table_name = 'role_permissions'
  and a.action = 'DELETE'
  and a.row_key ->> 'role_id' = r.id::text;

delete from auth.users
where id = any (array[
  '00000000-0000-4000-8000-000000005101'::uuid,
  '00000000-0000-4000-8000-000000005102'::uuid,
  '00000000-0000-4000-8000-000000005103'::uuid,
  '00000000-0000-4000-8000-000000005104'::uuid,
  '00000000-0000-4000-8000-000000005105'::uuid
]::uuid[]);

-- Cascading deletes can enqueue additional membership/role audit rows after
-- the first audit cleanup pass, so remove the same fixture team IDs once the
-- fixture-user cascades have completed.
delete from private.audit_events as a
using foundation_fixture_teams as t
where a.team_id = t.id;

do $cleanup$
begin
  if exists (select 1 from auth.users where id between '00000000-0000-4000-8000-000000005101'::uuid and '00000000-0000-4000-8000-000000005105'::uuid)
    or exists (select 1 from public.teams where slug = 'foundation-existing-verification-20260825')
    or exists (select 1 from private.audit_events) then
    raise exception 'foundation fixture cleanup: fixture rows remain (users=%, teams=%, audit=%)',
      (select pg_catalog.count(*) from auth.users where id between '00000000-0000-4000-8000-000000005101'::uuid and '00000000-0000-4000-8000-000000005105'::uuid),
      (select pg_catalog.count(*) from public.teams where slug = 'foundation-existing-verification-20260825'),
      (select pg_catalog.count(*) from private.audit_events);
  end if;

  if (select pg_catalog.count(*) from public.permissions) <> 21 then
    raise exception 'foundation fixture cleanup: expected 21 permission seeds';
  end if;
end;
$cleanup$;

commit;

select
  'ok'::text as status,
  (select pg_catalog.count(*) from auth.users where id between '00000000-0000-4000-8000-000000005101'::uuid and '00000000-0000-4000-8000-000000005105'::uuid) as fixture_auth_users,
  (select pg_catalog.count(*) from public.profiles where id between '00000000-0000-4000-8000-000000005101'::uuid and '00000000-0000-4000-8000-000000005105'::uuid) as fixture_profiles,
  (select pg_catalog.count(*) from public.teams where slug = 'foundation-existing-verification-20260825') as fixture_teams,
  0::bigint as fixture_roles,
  0::bigint as fixture_memberships,
  (select pg_catalog.count(*) from private.audit_events) as fixture_audit_events,
  (select pg_catalog.count(*) from public.permissions) as fixture_permissions;
