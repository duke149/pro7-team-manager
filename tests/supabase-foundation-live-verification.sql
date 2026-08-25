-- Rollback-only PostgreSQL 17 verification for PRO7 foundation permissions.
-- Run after the core and pending RLS migrations on a disposable local database.

begin;

do $verification$
declare
  v_owner constant uuid := '00000000-0000-4000-8000-000000005101';
  v_admin constant uuid := '00000000-0000-4000-8000-000000005102';
  v_member constant uuid := '00000000-0000-4000-8000-000000005103';
  v_custom_user constant uuid := '00000000-0000-4000-8000-000000005104';
  v_invalid_status_user constant uuid := '00000000-0000-4000-8000-000000005105';
  v_team uuid;
  v_owner_role uuid;
  v_admin_role uuid;
  v_member_role uuid;
  v_custom_role uuid;
  v_actual text[];
  v_failed boolean;
  v_error_state text;
  v_updated_at timestamptz;
begin
  if (select pg_catalog.count(*) from public.permissions) <> 21 then
    raise exception 'foundation live verification: expected 21 permission seeds';
  end if;

  insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values
    (v_owner, 'foundation-owner@example.invalid', '{}'::jsonb, '{}'::jsonb, pg_catalog.now(), pg_catalog.now()),
    (v_admin, 'foundation-admin@example.invalid', '{}'::jsonb, '{}'::jsonb, pg_catalog.now(), pg_catalog.now()),
    (v_member, 'foundation-member@example.invalid', '{}'::jsonb, '{}'::jsonb, pg_catalog.now(), pg_catalog.now()),
    (v_custom_user, 'foundation-custom@example.invalid', '{}'::jsonb, '{}'::jsonb, pg_catalog.now(), pg_catalog.now()),
    (v_invalid_status_user, 'foundation-invalid-status@example.invalid', '{}'::jsonb, '{}'::jsonb, pg_catalog.now(), pg_catalog.now());

  if exists (
    select 1
    from public.profiles
    where id = any (array[v_owner, v_admin, v_member, v_custom_user, v_invalid_status_user]::uuid[])
      and requires_password_change is distinct from false
  ) then
    raise exception 'foundation live verification: profile password flag default differs';
  end if;

  perform pg_catalog.set_config('request.jwt.claim.sub', v_owner::text, true);
  perform pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.jsonb_build_object('sub', v_owner, 'role', 'authenticated')::text,
    true
  );
  execute 'set local role authenticated';
  insert into public.teams (name, slug)
  values ('Foundation Verification', 'foundation-verification-20260825');
  execute 'reset role';

  select id into strict v_team
  from public.teams
  where slug = 'foundation-verification-20260825';

  select id into strict v_owner_role from public.roles where team_id = v_team and slug = 'owner';
  select id into strict v_admin_role from public.roles where team_id = v_team and slug = 'admin';
  select id into strict v_member_role from public.roles where team_id = v_team and slug = 'member';

  insert into public.roles (team_id, slug, name, description)
  values (v_team, 'custom-foundation', 'Custom foundation', 'fixture-only custom role')
  returning id into v_custom_role;
  insert into public.role_permissions (role_id, permission_code)
  values (v_custom_role, 'finance.manage');

  insert into public.memberships (team_id, user_id, role_id)
  values
    (v_team, v_admin, v_admin_role),
    (v_team, v_member, v_member_role),
    (v_team, v_custom_user, v_custom_role);

  if exists (
    select 1
    from public.memberships
    where team_id = v_team
      and user_id = any (array[v_owner, v_admin, v_member, v_custom_user]::uuid[])
      and status is distinct from 'active'
  ) then
    raise exception 'foundation live verification: membership status default differs';
  end if;

  select pg_catalog.array_agg(permission_code order by permission_code)
  into v_actual
  from public.role_permissions
  where role_id = v_owner_role;
  if v_actual is distinct from array[
    'finance.manage', 'finance.read', 'matches.manage', 'matches.read', 'matches.respond',
    'members.invite', 'members.manage', 'members.read', 'news.manage', 'news.read',
    'players.manage', 'players.read', 'roles.manage', 'roles.read', 'settings.read',
    'settings.update', 'tactics.manage', 'tactics.read', 'team.delete', 'team.read', 'team.update'
  ]::text[] then
    raise exception 'foundation live verification: Owner permissions differ: %', v_actual;
  end if;

  select pg_catalog.array_agg(permission_code order by permission_code)
  into v_actual
  from public.role_permissions
  where role_id = v_admin_role;
  if v_actual is distinct from array[
    'finance.manage', 'finance.read', 'matches.manage', 'matches.read', 'matches.respond',
    'members.invite', 'members.manage', 'members.read', 'news.manage', 'news.read',
    'players.manage', 'players.read', 'roles.manage', 'roles.read', 'settings.read',
    'settings.update', 'tactics.manage', 'tactics.read', 'team.read', 'team.update'
  ]::text[] then
    raise exception 'foundation live verification: Admin permissions differ: %', v_actual;
  end if;

  select pg_catalog.array_agg(permission_code order by permission_code)
  into v_actual
  from public.role_permissions
  where role_id = v_member_role;
  if v_actual is distinct from array[
    'matches.read', 'matches.respond', 'members.read', 'news.read',
    'players.read', 'roles.read', 'tactics.read', 'team.read'
  ]::text[] then
    raise exception 'foundation live verification: Member permissions differ: %', v_actual;
  end if;

  if exists (
    select 1
    from public.role_permissions
    where role_id = v_member_role
      and permission_code = any (array[
        'settings.read', 'finance.read', 'finance.manage', 'players.manage',
        'matches.manage', 'tactics.manage', 'news.manage'
      ]::text[])
  ) then
    raise exception 'foundation live verification: Member retained a forbidden permission';
  end if;

  select pg_catalog.array_agg(permission_code order by permission_code)
  into v_actual
  from public.role_permissions
  where role_id = v_custom_role;
  if v_actual is distinct from array['finance.manage']::text[] then
    raise exception 'foundation live verification: custom mappings changed: %', v_actual;
  end if;

  v_failed := false;
  v_error_state := null;
  begin
    insert into public.memberships (team_id, user_id, role_id, status)
    values (v_team, v_invalid_status_user, v_member_role, 'unknown');
  exception
    when others then
      v_failed := true;
      v_error_state := sqlstate;
  end;
  if not v_failed or v_error_state <> '23514' then
    raise exception 'foundation live verification: unknown status was not rejected (state=%)', v_error_state;
  end if;

  perform pg_catalog.set_config('request.jwt.claim.sub', v_member::text, true);
  perform pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.jsonb_build_object('sub', v_member, 'role', 'authenticated')::text,
    true
  );
  execute 'set local role authenticated';
  v_failed := false;
  v_error_state := null;
  begin
    update public.memberships
    set status = 'inactive'
    where team_id = v_team and user_id = v_member;
  exception
    when others then
      v_failed := true;
      v_error_state := sqlstate;
  end;
  execute 'reset role';
  if not v_failed or v_error_state <> '42501' then
    raise exception 'foundation live verification: authenticated status update was not denied (state=%)', v_error_state;
  end if;

  select updated_at into strict v_updated_at
  from public.memberships
  where team_id = v_team and user_id = v_member;
  update public.memberships
  set status = 'inactive'
  where team_id = v_team and user_id = v_member;
  if not exists (
    select 1
    from public.memberships
    where team_id = v_team
      and user_id = v_member
      and status = 'inactive'
      and updated_at >= v_updated_at
  ) then
    raise exception 'foundation live verification: membership update timestamp was not maintained';
  end if;

  if private.is_team_member(v_team)
    or private.has_team_permission(v_team, 'team.read')
    or private.can_view_profile(v_owner) then
    raise exception 'foundation live verification: inactive membership remained in context reads';
  end if;

  if not exists (
    select 1
    from private.audit_events
    where table_name = 'memberships'
      and action = 'UPDATE'
      and new_data ->> 'user_id' = v_member::text
      and new_data ->> 'status' = 'inactive'
  ) then
    raise exception 'foundation live verification: membership status audit event is missing';
  end if;
end;
$verification$;

rollback;

select
  'ok'::text as status,
  11::integer as assertions,
  8::integer as coverage_groups,
  'password default; membership lifecycle; status constraint and ACL; active-only context; Owner/Admin/Member mappings; custom mapping; membership audit'::text as coverage,
  'rolled back'::text as fixtures;
