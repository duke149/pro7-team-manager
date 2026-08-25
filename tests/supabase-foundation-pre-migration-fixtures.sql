-- Fixture setup intentionally runs after core + pending RLS and before the
-- foundation migration. These rows prove that the additive remap changes only
-- system roles while leaving an already-existing custom mapping untouched.

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-4000-8000-000000005101', 'foundation-owner@example.invalid', '{}'::jsonb, '{}'::jsonb, pg_catalog.now(), pg_catalog.now()),
  ('00000000-0000-4000-8000-000000005102', 'foundation-admin@example.invalid', '{}'::jsonb, '{}'::jsonb, pg_catalog.now(), pg_catalog.now()),
  ('00000000-0000-4000-8000-000000005103', 'foundation-member@example.invalid', '{}'::jsonb, '{}'::jsonb, pg_catalog.now(), pg_catalog.now()),
  ('00000000-0000-4000-8000-000000005104', 'foundation-custom@example.invalid', '{}'::jsonb, '{}'::jsonb, pg_catalog.now(), pg_catalog.now()),
  ('00000000-0000-4000-8000-000000005105', 'foundation-invalid@example.invalid', '{}'::jsonb, '{}'::jsonb, pg_catalog.now(), pg_catalog.now());

select pg_catalog.set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000005101', false);
select pg_catalog.set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000005101","role":"authenticated"}',
  false
);
set role authenticated;
insert into public.teams (name, slug)
values ('Foundation Existing Verification', 'foundation-existing-verification-20260825');
reset role;

do $fixtures$
declare
  v_team uuid;
  v_admin_role uuid;
  v_member_role uuid;
  v_custom_role uuid;
begin
  select id into strict v_team
  from public.teams
  where slug = 'foundation-existing-verification-20260825';

  select id into strict v_admin_role
  from public.roles
  where team_id = v_team and slug = 'admin';

  select id into strict v_member_role
  from public.roles
  where team_id = v_team and slug = 'member';

  insert into public.roles (team_id, slug, name, description)
  values (v_team, 'custom-pre-foundation', 'Custom pre-foundation', 'existing custom fixture')
  returning id into v_custom_role;

  insert into public.role_permissions (role_id, permission_code)
  values (v_custom_role, 'settings.update');

  insert into public.memberships (team_id, user_id, role_id)
  values
    (v_team, '00000000-0000-4000-8000-000000005102', v_admin_role),
    (v_team, '00000000-0000-4000-8000-000000005103', v_member_role),
    (v_team, '00000000-0000-4000-8000-000000005104', v_custom_role);
end;
$fixtures$;
