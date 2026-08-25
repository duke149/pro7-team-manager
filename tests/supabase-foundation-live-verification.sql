-- Rollback-only verification after the harness applies the foundation migration.
-- Existing fixtures were committed before that migration; post-foundation
-- bootstrap fixtures and lifecycle mutations below are rolled back.

begin;

do $verification$
declare
  v_owner constant uuid := '00000000-0000-4000-8000-000000005101';
  v_member constant uuid := '00000000-0000-4000-8000-000000005103';
  v_invalid_user constant uuid := '00000000-0000-4000-8000-000000005105';
  v_existing_team uuid;
  v_existing_owner_role uuid;
  v_existing_admin_role uuid;
  v_existing_member_role uuid;
  v_existing_custom_role uuid;
  v_post_team uuid;
  v_post_owner_role uuid;
  v_post_admin_role uuid;
  v_post_member_role uuid;
  v_context_role uuid;
  v_context record;
  v_actual text[];
  v_count integer;
  v_failed boolean;
  v_error_state text;
  v_slug text;
  v_old_updated_at constant timestamptz := '2000-01-01 00:00:00+00';
begin
  if (select pg_catalog.count(*) from public.permissions) <> 21 then
    raise exception 'foundation live verification: expected 21 permission seeds';
  end if;

  if exists (
    select 1
    from public.profiles
    where id = any (array[v_owner, v_member, v_invalid_user]::uuid[])
      and requires_password_change is distinct from false
  ) then
    raise exception 'foundation live verification: profile password flag default differs';
  end if;

  select id into strict v_existing_team
  from public.teams
  where slug = 'foundation-existing-verification-20260825';
  select id into strict v_existing_owner_role from public.roles where team_id = v_existing_team and slug = 'owner';
  select id into strict v_existing_admin_role from public.roles where team_id = v_existing_team and slug = 'admin';
  select id into strict v_existing_member_role from public.roles where team_id = v_existing_team and slug = 'member';
  select id into strict v_existing_custom_role from public.roles where team_id = v_existing_team and slug = 'custom-pre-foundation';

  if exists (
    select 1
    from public.memberships
    where team_id = v_existing_team
      and status is distinct from 'active'
  ) then
    raise exception 'foundation live verification: existing membership default differs';
  end if;

  select pg_catalog.array_agg(permission_code order by permission_code)
  into v_actual
  from public.role_permissions
  where role_id = v_existing_owner_role;
  if v_actual is distinct from array[
    'finance.manage', 'finance.read', 'matches.manage', 'matches.read', 'matches.respond',
    'members.invite', 'members.manage', 'members.read', 'news.manage', 'news.read',
    'players.manage', 'players.read', 'roles.manage', 'roles.read', 'settings.read',
    'settings.update', 'tactics.manage', 'tactics.read', 'team.delete', 'team.read', 'team.update'
  ]::text[] then
    raise exception 'foundation live verification: existing Owner permissions differ: %', v_actual;
  end if;

  select pg_catalog.array_agg(permission_code order by permission_code)
  into v_actual
  from public.role_permissions
  where role_id = v_existing_admin_role;
  if v_actual is distinct from array[
    'finance.manage', 'finance.read', 'matches.manage', 'matches.read', 'matches.respond',
    'members.invite', 'members.manage', 'members.read', 'news.manage', 'news.read',
    'players.manage', 'players.read', 'roles.manage', 'roles.read', 'settings.read',
    'settings.update', 'tactics.manage', 'tactics.read', 'team.read', 'team.update'
  ]::text[] then
    raise exception 'foundation live verification: existing Admin permissions differ: %', v_actual;
  end if;

  select pg_catalog.array_agg(permission_code order by permission_code)
  into v_actual
  from public.role_permissions
  where role_id = v_existing_member_role;
  if v_actual is distinct from array[
    'matches.read', 'matches.respond', 'members.read', 'news.read',
    'players.read', 'roles.read', 'tactics.read', 'team.read'
  ]::text[] then
    raise exception 'foundation live verification: existing Member permissions differ: %', v_actual;
  end if;

  select pg_catalog.array_agg(permission_code order by permission_code)
  into v_actual
  from public.role_permissions
  where role_id = v_existing_custom_role;
  if v_actual is distinct from array['settings.update']::text[] then
    raise exception 'foundation live verification: pre-existing custom mapping changed: %', v_actual;
  end if;

  perform pg_catalog.set_config('request.jwt.claim.sub', v_owner::text, true);
  perform pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.jsonb_build_object('sub', v_owner, 'role', 'authenticated')::text,
    true
  );
  execute 'set local role authenticated';

  v_failed := false;
  v_error_state := null;
  begin
    insert into public.teams (name, slug)
    values ('Overlong Slug Verification', repeat('a', 49));
  exception
    when others then
      v_failed := true;
      v_error_state := sqlstate;
  end;
  if not v_failed or v_error_state <> '23514' then
    raise exception 'foundation live verification: 49-character team slug was not rejected (state=%)', v_error_state;
  end if;

  foreach v_slug in array array['setup', 'account', 'api', 'login', 'auth']::text[] loop
    v_failed := false;
    v_error_state := null;
    begin
      insert into public.teams (name, slug)
      values ('Reserved Slug Verification', v_slug);
    exception
      when others then
        v_failed := true;
        v_error_state := sqlstate;
    end;
    if not v_failed or v_error_state <> '23514' then
      raise exception 'foundation live verification: reserved team slug % was not rejected (state=%)', v_slug, v_error_state;
    end if;
  end loop;

  insert into public.teams (name, slug)
  values ('Maximum Slug Verification', repeat('a', 48));
  if not exists (select 1 from public.teams where slug = repeat('a', 48)) then
    raise exception 'foundation live verification: valid 48-character team slug was not retained';
  end if;

  insert into public.teams (name, slug)
  values ('Foundation Post Migration', 'foundation-post-verification-20260825');
  execute 'reset role';

  select id into strict v_post_team
  from public.teams
  where slug = 'foundation-post-verification-20260825';
  select id into strict v_post_owner_role from public.roles where team_id = v_post_team and slug = 'owner';
  select id into strict v_post_admin_role from public.roles where team_id = v_post_team and slug = 'admin';
  select id into strict v_post_member_role from public.roles where team_id = v_post_team and slug = 'member';

  select pg_catalog.array_agg(permission_code order by permission_code)
  into v_actual
  from public.role_permissions
  where role_id = v_post_owner_role;
  if v_actual is distinct from array[
    'finance.manage', 'finance.read', 'matches.manage', 'matches.read', 'matches.respond',
    'members.invite', 'members.manage', 'members.read', 'news.manage', 'news.read',
    'players.manage', 'players.read', 'roles.manage', 'roles.read', 'settings.read',
    'settings.update', 'tactics.manage', 'tactics.read', 'team.delete', 'team.read', 'team.update'
  ]::text[] then
    raise exception 'foundation live verification: bootstrap Owner permissions differ: %', v_actual;
  end if;

  select pg_catalog.array_agg(permission_code order by permission_code)
  into v_actual
  from public.role_permissions
  where role_id = v_post_admin_role;
  if v_actual is distinct from array[
    'finance.manage', 'finance.read', 'matches.manage', 'matches.read', 'matches.respond',
    'members.invite', 'members.manage', 'members.read', 'news.manage', 'news.read',
    'players.manage', 'players.read', 'roles.manage', 'roles.read', 'settings.read',
    'settings.update', 'tactics.manage', 'tactics.read', 'team.read', 'team.update'
  ]::text[] then
    raise exception 'foundation live verification: bootstrap Admin permissions differ: %', v_actual;
  end if;

  select pg_catalog.array_agg(permission_code order by permission_code)
  into v_actual
  from public.role_permissions
  where role_id = v_post_member_role;
  if v_actual is distinct from array[
    'matches.read', 'matches.respond', 'members.read', 'news.read',
    'players.read', 'roles.read', 'tactics.read', 'team.read'
  ]::text[] then
    raise exception 'foundation live verification: bootstrap Member permissions differ: %', v_actual;
  end if;

  insert into public.roles (team_id, slug, name, description)
  values (v_existing_team, 'finance-context', 'Finance context', 'context-only fixture')
  returning id into v_context_role;

  insert into public.role_permissions (role_id, permission_code)
  values (v_context_role, 'finance.read');

  insert into public.memberships (team_id, user_id, role_id)
  values (v_existing_team, v_invalid_user, v_context_role);

  perform pg_catalog.set_config('request.jwt.claim.sub', v_invalid_user::text, true);
  perform pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.jsonb_build_object('sub', v_invalid_user, 'role', 'authenticated')::text,
    true
  );
  execute 'set local role authenticated';

  select * into v_context
  from public.get_current_team_access_contexts();
  if not found
    or v_context.team_id is distinct from v_existing_team
    or v_context.team_name is distinct from 'Foundation Existing Verification'
    or v_context.team_slug is distinct from 'foundation-existing-verification-20260825'
    or v_context.role_id is distinct from v_context_role
    or v_context.role_slug is distinct from 'finance-context'
    or v_context.role_name is distinct from 'Finance context'
    or v_context.permission_codes is distinct from array['finance.read']::text[] then
    raise exception 'foundation live verification: context RPC returned unexpected fields';
  end if;

  select pg_catalog.count(*) into v_count
  from public.get_current_team_access_contexts();
  if v_count <> 1 then
    raise exception 'foundation live verification: context RPC exposed unrelated teams';
  end if;

  select pronargs into v_count
  from pg_catalog.pg_proc
  where oid = 'public.get_current_team_access_contexts()'::regprocedure;
  if v_count <> 0 then
    raise exception 'foundation live verification: context RPC accepts unexpected arguments';
  end if;

  select pg_catalog.count(*) into v_count
  from public.teams
  where id = v_existing_team;
  if v_count <> 0 then
    raise exception 'foundation live verification: finance-only role can read base team rows';
  end if;

  select pg_catalog.count(*) into v_count
  from public.roles
  where id = v_context_role;
  if v_count <> 0 then
    raise exception 'foundation live verification: finance-only role can read base role rows';
  end if;

  select pg_catalog.count(*) into v_count
  from public.role_permissions
  where role_id = v_context_role;
  if v_count <> 0 then
    raise exception 'foundation live verification: finance-only role can read base role-permission rows';
  end if;

  if pg_catalog.has_schema_privilege('authenticated', 'private', 'usage') then
    raise exception 'foundation live verification: authenticated gained private schema usage';
  end if;

  v_failed := false;
  v_error_state := null;
  begin
    perform private.has_team_permission(v_existing_team, 'finance.read');
  exception
    when others then
      v_failed := true;
      v_error_state := sqlstate;
  end;
  if not v_failed or v_error_state <> '42501' then
    raise exception 'foundation live verification: authenticated private helper access was not denied (state=%)', v_error_state;
  end if;

  v_failed := false;
  v_error_state := null;
  begin
    perform 1 from private.audit_events;
  exception
    when others then
      v_failed := true;
      v_error_state := sqlstate;
  end;
  if not v_failed or v_error_state <> '42501' then
    raise exception 'foundation live verification: authenticated private table access was not denied (state=%)', v_error_state;
  end if;

  execute 'reset role';
  if not private.has_team_permission(v_existing_team, 'finance.read')
    or private.has_team_permission(v_existing_team, 'team.read')
    or private.has_team_permission(v_existing_team, 'roles.read') then
    raise exception 'foundation live verification: finance-only route permission boundary differs';
  end if;

  update public.memberships
  set status = 'inactive'
  where team_id = v_existing_team and user_id = v_invalid_user;

  execute 'set local role authenticated';
  select pg_catalog.count(*) into v_count
  from public.get_current_team_access_contexts();
  if v_count <> 0 then
    raise exception 'foundation live verification: inactive finance-only role received RPC context';
  end if;
  execute 'reset role';

  execute 'set local role anon';
  v_failed := false;
  v_error_state := null;
  begin
    perform public.get_current_team_access_contexts();
  exception
    when others then
      v_failed := true;
      v_error_state := sqlstate;
  end;
  execute 'reset role';
  if not v_failed or v_error_state <> '42501' then
    raise exception 'foundation live verification: anon context RPC execution was not denied (state=%)', v_error_state;
  end if;

  execute 'set local role service_role';
  v_failed := false;
  v_error_state := null;
  begin
    perform public.get_current_team_access_contexts();
  exception
    when others then
      v_failed := true;
      v_error_state := sqlstate;
  end;
  execute 'reset role';
  if not v_failed or v_error_state <> '42501'
    or pg_catalog.has_function_privilege('public', 'public.get_current_team_access_contexts()', 'execute') then
    raise exception 'foundation live verification: context RPC ACL is broader than authenticated (state=%)', v_error_state;
  end if;

  v_failed := false;
  v_error_state := null;
  begin
    insert into public.memberships (team_id, user_id, role_id, status)
    values (v_existing_team, v_invalid_user, v_existing_member_role, 'unknown');
  exception
    when others then
      v_failed := true;
      v_error_state := sqlstate;
  end;
  if not v_failed or v_error_state <> '23514' then
    raise exception 'foundation live verification: unknown lifecycle value was not rejected (state=%)', v_error_state;
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
    where team_id = v_existing_team and user_id = v_member;
  exception
    when others then
      v_failed := true;
      v_error_state := sqlstate;
  end;
  execute 'reset role';
  if not v_failed or v_error_state <> '42501' then
    raise exception 'foundation live verification: authenticated lifecycle update was not denied (state=%)', v_error_state;
  end if;

  perform pg_catalog.set_config('session_replication_role', 'replica', true);
  update public.memberships
  set updated_at = v_old_updated_at
  where team_id = v_existing_team and user_id = v_member;
  perform pg_catalog.set_config('session_replication_role', 'origin', true);
  update public.memberships
  set status = 'inactive'
  where team_id = v_existing_team and user_id = v_member;

  if not exists (
    select 1
    from public.memberships
    where team_id = v_existing_team
      and user_id = v_member
      and status = 'inactive'
      and updated_at > v_old_updated_at
  ) then
    raise exception 'foundation live verification: lifecycle update timestamp was not strictly advanced';
  end if;

  if private.is_team_member(v_existing_team)
    or private.has_team_permission(v_existing_team, 'team.read')
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
    raise exception 'foundation live verification: lifecycle audit event is missing';
  end if;
end;
$verification$;

rollback;

select
  'ok'::text as status,
  35::integer as assertions,
  12::integer as coverage_groups,
  'existing remap; custom preservation; bootstrap mappings; password default; route-safe team slugs; lifecycle constraint, ACL, timestamp, audit, active context, and hardened finance-only context RPC'::text as coverage,
  'post-migration fixtures rolled back; pre-migration fixtures require cleanup'::text as fixtures;
