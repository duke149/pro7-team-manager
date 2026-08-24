-- Live verification for the reviewed Supabase MVP core migration.
--
-- This script is intentionally rollback-only. Synthetic invitation tokens are
-- generated inside the anonymous block, are never selected or logged, and are
-- discarded with the transaction.

begin;

do $verification$
declare
  v_owner_a constant uuid := '00000000-0000-4000-8000-000000004101';
  v_admin_a constant uuid := '00000000-0000-4000-8000-000000004102';
  v_member_a constant uuid := '00000000-0000-4000-8000-000000004103';
  v_owner_b constant uuid := '00000000-0000-4000-8000-000000004104';
  v_invitee_confirmed constant uuid := '00000000-0000-4000-8000-000000004105';
  v_invitee_unconfirmed constant uuid := '00000000-0000-4000-8000-000000004106';
  v_outsider constant uuid := '00000000-0000-4000-8000-000000004107';
  v_team_a uuid;
  v_team_b uuid;
  v_disposable_team uuid;
  v_owner_role_a uuid;
  v_admin_role_a uuid;
  v_member_role_a uuid;
  v_member_role_b uuid;
  v_custom_role_a uuid;
  v_invitation_confirmed uuid;
  v_invitation_unconfirmed uuid;
  v_invitation_mismatch uuid;
  v_accepted_team uuid;
  v_token_confirmed text;
  v_token_unconfirmed text;
  v_token_mismatch text;
  v_token_unknown text;
  v_actual text[];
  v_count bigint;
  v_rows bigint;
  v_failed boolean;
  v_error_state text;
  v_error_message text;
begin
  -- Structural assertions fail before fixture creation when the migration is
  -- absent, providing the required TDD red signal without leaving any data.
  select pg_catalog.array_agg(
    n.nspname || '.' || c.relname
    order by n.nspname, c.relname
  )
  into v_actual
  from pg_catalog.pg_class as c
  join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
  where c.relkind in ('r', 'p')
    and (
      (n.nspname = 'public' and c.relname = any (array[
        'invitations',
        'memberships',
        'permissions',
        'profiles',
        'role_permissions',
        'roles',
        'team_settings',
        'teams'
      ]::text[]))
      or (n.nspname = 'private' and c.relname = 'audit_events')
    );

  if v_actual is distinct from array[
    'private.audit_events',
    'public.invitations',
    'public.memberships',
    'public.permissions',
    'public.profiles',
    'public.role_permissions',
    'public.roles',
    'public.team_settings',
    'public.teams'
  ]::text[] then
    raise exception 'live verification: expected application tables, got %', v_actual;
  end if;

  select pg_catalog.count(*)
  into v_count
  from pg_catalog.pg_class as c
  join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = any (array[
      'invitations',
      'memberships',
      'permissions',
      'profiles',
      'role_permissions',
      'roles',
      'team_settings',
      'teams'
    ]::text[])
    and c.relrowsecurity;

  if v_count <> 8 then
    raise exception 'live verification: expected RLS on 8 public tables, got %', v_count;
  end if;

  select pg_catalog.array_agg(policyname order by policyname)
  into v_actual
  from pg_catalog.pg_policies
  where schemaname = 'public'
    and tablename = any (array[
      'invitations',
      'memberships',
      'permissions',
      'profiles',
      'role_permissions',
      'roles',
      'team_settings',
      'teams'
    ]::text[]);

  if v_actual is distinct from array[
    'invitations_select_authorized',
    'memberships_delete_authorized',
    'memberships_select_authorized',
    'memberships_update_authorized',
    'permissions_select_authenticated',
    'profiles_select_visible',
    'profiles_update_own',
    'role_permissions_delete_authorized',
    'role_permissions_insert_authorized',
    'role_permissions_select_authorized',
    'roles_delete_custom',
    'roles_insert_custom',
    'roles_select_authorized',
    'roles_update_custom',
    'team_settings_select_authorized',
    'team_settings_update_authorized',
    'teams_delete_authorized',
    'teams_insert_own',
    'teams_select_authorized',
    'teams_update_authorized'
  ]::text[] then
    raise exception 'live verification: expected exactly 20 reviewed policies, got %', v_actual;
  end if;

  select pg_catalog.array_agg(
    n.nspname || '.' || c.relname || '.' || t.tgname
    order by n.nspname, c.relname, t.tgname
  )
  into v_actual
  from pg_catalog.pg_trigger as t
  join pg_catalog.pg_class as c on c.oid = t.tgrelid
  join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
  where not t.tgisinternal
    and (
      (
        n.nspname = 'public'
        and c.relname = any (array[
          'invitations',
          'memberships',
          'profiles',
          'role_permissions',
          'roles',
          'team_settings',
          'teams'
        ]::text[])
      )
      or (
        n.nspname = 'auth'
        and c.relname = 'users'
        and t.tgname = 'on_auth_user_created'
      )
    );

  if v_actual is distinct from array[
    'auth.users.on_auth_user_created',
    'public.invitations.trg_invitations_audit',
    'public.invitations.trg_invitations_set_updated_at',
    'public.memberships.trg_memberships_audit',
    'public.profiles.trg_profiles_set_updated_at',
    'public.role_permissions.trg_role_permissions_audit',
    'public.roles.trg_roles_audit',
    'public.roles.trg_roles_set_updated_at',
    'public.team_settings.trg_team_settings_audit',
    'public.team_settings.trg_team_settings_set_updated_at',
    'public.teams.trg_teams_audit',
    'public.teams.trg_teams_bootstrap',
    'public.teams.trg_teams_set_updated_at'
  ]::text[] then
    raise exception 'live verification: expected exactly 13 reviewed triggers, got %', v_actual;
  end if;

  select pg_catalog.array_agg(code order by code)
  into v_actual
  from public.permissions;

  if v_actual is distinct from array[
    'members.invite',
    'members.manage',
    'members.read',
    'roles.manage',
    'roles.read',
    'settings.read',
    'settings.update',
    'team.delete',
    'team.read',
    'team.update'
  ]::text[] then
    raise exception 'live verification: permission catalog differs: %', v_actual;
  end if;

  -- Object, column, schema, function, and default ACLs are an independent
  -- authorization layer in addition to RLS.
  if exists (
    select 1
    from pg_catalog.pg_class as c
    join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
    where n.nspname in ('public', 'private')
      and c.relname = any (array[
        'audit_events',
        'invitations',
        'memberships',
        'permissions',
        'profiles',
        'role_permissions',
        'roles',
        'team_settings',
        'teams'
      ]::text[])
      and (
        pg_catalog.has_table_privilege('anon', c.oid, 'SELECT')
        or pg_catalog.has_table_privilege('anon', c.oid, 'INSERT')
        or pg_catalog.has_table_privilege('anon', c.oid, 'UPDATE')
        or pg_catalog.has_table_privilege('anon', c.oid, 'DELETE')
      )
  ) then
    raise exception 'live verification: anon has an application-table privilege';
  end if;

  if pg_catalog.has_schema_privilege('anon', 'private', 'USAGE')
    or pg_catalog.has_schema_privilege('authenticated', 'private', 'USAGE')
    or pg_catalog.has_schema_privilege('service_role', 'private', 'USAGE') then
    raise exception 'live verification: an API role can use the private schema';
  end if;

  if pg_catalog.has_function_privilege(
      'anon',
      'public.accept_team_invitation(text)',
      'EXECUTE'
    )
    or pg_catalog.has_function_privilege(
      'service_role',
      'public.accept_team_invitation(text)',
      'EXECUTE'
    )
    or not pg_catalog.has_function_privilege(
      'authenticated',
      'public.accept_team_invitation(text)',
      'EXECUTE'
    ) then
    raise exception 'live verification: invitation RPC execute ACL differs';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc as p
    join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
    where n.nspname = 'private'
      and p.proname = any (array[
        'audit_row_change',
        'bootstrap_team',
        'can_manage_membership',
        'can_manage_role',
        'can_view_profile',
        'can_view_role',
        'handle_new_user',
        'has_team_permission',
        'is_team_member',
        'role_belongs_to_team',
        'set_updated_at'
      ]::text[])
      and (
        pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')
        or pg_catalog.has_function_privilege('service_role', p.oid, 'EXECUTE')
      )
  ) then
    raise exception 'live verification: anon/service_role can execute a private helper';
  end if;

  select pg_catalog.count(*)
  into v_count
  from pg_catalog.pg_proc as p
  join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
  where n.nspname = 'private'
    and p.proname = any (array[
      'can_manage_membership',
      'can_manage_role',
      'can_view_profile',
      'can_view_role',
      'has_team_permission',
      'role_belongs_to_team'
    ]::text[])
    and pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE');

  if v_count <> 6 then
    raise exception 'live verification: expected 6 authenticated policy helper grants, got %', v_count;
  end if;

  if not (
    pg_catalog.has_column_privilege('authenticated', 'public.profiles', 'display_name', 'UPDATE')
    and pg_catalog.has_column_privilege('authenticated', 'public.profiles', 'avatar_url', 'UPDATE')
    and pg_catalog.has_column_privilege('authenticated', 'public.teams', 'name', 'INSERT')
    and pg_catalog.has_column_privilege('authenticated', 'public.teams', 'slug', 'INSERT')
    and pg_catalog.has_column_privilege('authenticated', 'public.teams', 'name', 'UPDATE')
    and pg_catalog.has_column_privilege('authenticated', 'public.teams', 'slug', 'UPDATE')
    and pg_catalog.has_column_privilege('authenticated', 'public.roles', 'team_id', 'INSERT')
    and pg_catalog.has_column_privilege('authenticated', 'public.roles', 'name', 'UPDATE')
    and pg_catalog.has_column_privilege('authenticated', 'public.memberships', 'role_id', 'UPDATE')
    and pg_catalog.has_column_privilege('authenticated', 'public.team_settings', 'settings', 'UPDATE')
  ) then
    raise exception 'live verification: required authenticated column grants are missing';
  end if;

  if pg_catalog.has_column_privilege('authenticated', 'public.invitations', 'token_hash', 'SELECT')
    or pg_catalog.has_column_privilege('authenticated', 'public.teams', 'owner_user_id', 'INSERT')
    or pg_catalog.has_column_privilege('authenticated', 'public.teams', 'owner_user_id', 'UPDATE')
    or pg_catalog.has_column_privilege('authenticated', 'public.roles', 'is_system', 'INSERT')
    or pg_catalog.has_column_privilege('authenticated', 'public.roles', 'is_system', 'UPDATE')
    or pg_catalog.has_column_privilege('authenticated', 'public.memberships', 'user_id', 'INSERT')
    or pg_catalog.has_column_privilege('authenticated', 'public.invitations', 'status', 'UPDATE')
    or pg_catalog.has_column_privilege('authenticated', 'public.team_settings', 'updated_at', 'UPDATE') then
    raise exception 'live verification: a protected column is exposed';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_default_acl as d
    cross join lateral pg_catalog.aclexplode(d.defaclacl) as a
    where d.defaclrole = 'postgres'::pg_catalog.regrole
      and a.grantee = any (array[
        0::oid,
        'anon'::pg_catalog.regrole::oid,
        'authenticated'::pg_catalog.regrole::oid,
        'service_role'::pg_catalog.regrole::oid
      ])
      and (
        (
          d.defaclobjtype = 'r'
          and d.defaclnamespace = 'public'::pg_catalog.regnamespace
          and a.privilege_type = any (array['SELECT', 'INSERT', 'UPDATE', 'DELETE']::text[])
        )
        or (
          d.defaclobjtype = 'S'
          and d.defaclnamespace = 'public'::pg_catalog.regnamespace
          and a.privilege_type = any (array['USAGE', 'SELECT']::text[])
        )
        or (
          d.defaclobjtype = 'f'
          and d.defaclnamespace in (0, 'public'::pg_catalog.regnamespace::oid)
          and a.privilege_type = 'EXECUTE'
        )
      )
  ) then
    raise exception 'live verification: broad postgres default ACL remains';
  end if;

  -- Auth fixture insertion exercises the profile trigger. User metadata includes
  -- forged authorization-shaped values to prove they are not persisted or used.
  insert into auth.users (
    id,
    email,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at
  )
  values
    (
      v_owner_a,
      'codex-live-verification-owner-a@example.invalid',
      pg_catalog.now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"display_name":"Live Owner A","avatar_url":"https://example.invalid/owner-a.png","authorization_role":"owner"}'::jsonb,
      pg_catalog.now(),
      pg_catalog.now()
    ),
    (
      v_admin_a,
      'codex-live-verification-admin-a@example.invalid',
      pg_catalog.now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"display_name":"Live Admin A"}'::jsonb,
      pg_catalog.now(),
      pg_catalog.now()
    ),
    (
      v_member_a,
      'codex-live-verification-member-a@example.invalid',
      pg_catalog.now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"display_name":"Live Member A"}'::jsonb,
      pg_catalog.now(),
      pg_catalog.now()
    ),
    (
      v_owner_b,
      'codex-live-verification-owner-b@example.invalid',
      pg_catalog.now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"display_name":"Live Owner B"}'::jsonb,
      pg_catalog.now(),
      pg_catalog.now()
    ),
    (
      v_invitee_confirmed,
      'codex-live-verification-confirmed@example.invalid',
      pg_catalog.now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"display_name":"Live Confirmed Invitee"}'::jsonb,
      pg_catalog.now(),
      pg_catalog.now()
    ),
    (
      v_invitee_unconfirmed,
      'codex-live-verification-unconfirmed@example.invalid',
      null,
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"display_name":"Live Unconfirmed Invitee"}'::jsonb,
      pg_catalog.now(),
      pg_catalog.now()
    ),
    (
      v_outsider,
      'codex-live-verification-outsider@example.invalid',
      pg_catalog.now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"display_name":"Live Outsider","role":"owner"}'::jsonb,
      pg_catalog.now(),
      pg_catalog.now()
    );

  select pg_catalog.count(*)
  into v_count
  from public.profiles
  where id = any (array[
    v_owner_a,
    v_admin_a,
    v_member_a,
    v_owner_b,
    v_invitee_confirmed,
    v_invitee_unconfirmed,
    v_outsider
  ]::uuid[]);

  if v_count <> 7 then
    raise exception 'live verification: profile bootstrap expected 7 rows, got %', v_count;
  end if;

  if not exists (
    select 1
    from public.profiles
    where id = v_owner_a
      and display_name = 'Live Owner A'
      and avatar_url = 'https://example.invalid/owner-a.png'
  ) then
    raise exception 'live verification: bounded presentation metadata did not bootstrap';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = any (array[
        'email',
        'role',
        'team_id',
        'authorization_role'
      ]::text[])
  ) then
    raise exception 'live verification: profile schema contains authorization/email metadata';
  end if;

  -- Team creation is performed with the exact authenticated role and JWT claim
  -- shape used by Supabase RLS testing guidance.
  perform pg_catalog.set_config('request.jwt.claim.sub', v_owner_a::text, true);
  perform pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.jsonb_build_object(
      'sub', v_owner_a,
      'role', 'authenticated',
      'user_metadata', pg_catalog.jsonb_build_object('role', 'forged-owner')
    )::text,
    true
  );
  execute 'set local role authenticated';

  insert into public.teams (name, slug)
  values ('Live Verification Alpha', 'codex-live-verification-alpha-20260824');

  select id into strict v_team_a
  from public.teams
  where slug = 'codex-live-verification-alpha-20260824';

  insert into public.teams (name, slug)
  values ('Live Verification Disposable', 'codex-live-verification-disposable-20260824');

  select id into strict v_disposable_team
  from public.teams
  where slug = 'codex-live-verification-disposable-20260824';

  execute 'reset role';

  perform pg_catalog.set_config('request.jwt.claim.sub', v_owner_b::text, true);
  perform pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.jsonb_build_object('sub', v_owner_b, 'role', 'authenticated')::text,
    true
  );
  execute 'set local role authenticated';

  insert into public.teams (name, slug)
  values ('Live Verification Bravo', 'codex-live-verification-bravo-20260824');

  select id into strict v_team_b
  from public.teams
  where slug = 'codex-live-verification-bravo-20260824';

  execute 'reset role';

  select id into strict v_owner_role_a
  from public.roles
  where team_id = v_team_a and slug = 'owner';

  select id into strict v_admin_role_a
  from public.roles
  where team_id = v_team_a and slug = 'admin';

  select id into strict v_member_role_a
  from public.roles
  where team_id = v_team_a and slug = 'member';

  select id into strict v_member_role_b
  from public.roles
  where team_id = v_team_b and slug = 'member';

  select pg_catalog.array_agg(
    slug || ':' || name || ':' || description || ':' || is_system::text
    order by slug
  )
  into v_actual
  from public.roles
  where team_id = v_team_a;

  if v_actual is distinct from array[
    'admin:admin:team administration:true',
    'member:member:standard team membership:true',
    'owner:owner:full team ownership:true'
  ]::text[] then
    raise exception 'live verification: system roles differ: %', v_actual;
  end if;

  select pg_catalog.array_agg(rp.permission_code order by rp.permission_code)
  into v_actual
  from public.role_permissions as rp
  where rp.role_id = v_owner_role_a;

  if v_actual is distinct from array[
    'members.invite',
    'members.manage',
    'members.read',
    'roles.manage',
    'roles.read',
    'settings.read',
    'settings.update',
    'team.delete',
    'team.read',
    'team.update'
  ]::text[] then
    raise exception 'live verification: owner mapping differs: %', v_actual;
  end if;

  select pg_catalog.array_agg(rp.permission_code order by rp.permission_code)
  into v_actual
  from public.role_permissions as rp
  where rp.role_id = v_admin_role_a;

  if v_actual is distinct from array[
    'members.invite',
    'members.manage',
    'members.read',
    'roles.manage',
    'roles.read',
    'settings.read',
    'settings.update',
    'team.read',
    'team.update'
  ]::text[] then
    raise exception 'live verification: admin mapping differs: %', v_actual;
  end if;

  select pg_catalog.array_agg(rp.permission_code order by rp.permission_code)
  into v_actual
  from public.role_permissions as rp
  where rp.role_id = v_member_role_a;

  if v_actual is distinct from array[
    'members.read',
    'roles.read',
    'settings.read',
    'team.read'
  ]::text[] then
    raise exception 'live verification: member mapping differs: %', v_actual;
  end if;

  if not exists (
    select 1
    from public.memberships
    where team_id = v_team_a
      and user_id = v_owner_a
      and role_id = v_owner_role_a
  ) then
    raise exception 'live verification: owner membership did not bootstrap';
  end if;

  if not exists (
    select 1
    from public.team_settings
    where team_id = v_team_a
      and settings = '{}'::jsonb
  ) then
    raise exception 'live verification: default team settings did not bootstrap';
  end if;

  select pg_catalog.count(*)
  into v_count
  from public.role_permissions as rp
  join public.roles as r on r.id = rp.role_id
  where r.team_id = v_team_a;

  if v_count <> 23 then
    raise exception 'live verification: team bootstrap expected 23 mappings, got %', v_count;
  end if;

  -- Trusted fixture setup: client roles intentionally have no membership or
  -- invitation INSERT grants.
  insert into public.memberships (team_id, user_id, role_id)
  values
    (v_team_a, v_admin_a, v_admin_role_a),
    (v_team_a, v_member_a, v_member_role_a);

  v_token_confirmed := pg_catalog.encode(extensions.gen_random_bytes(32), 'hex');
  v_token_unconfirmed := pg_catalog.encode(extensions.gen_random_bytes(32), 'hex');
  v_token_mismatch := pg_catalog.encode(extensions.gen_random_bytes(32), 'hex');
  v_token_unknown := pg_catalog.encode(extensions.gen_random_bytes(32), 'hex');

  insert into public.invitations (
    team_id,
    email,
    role_id,
    inviter_user_id,
    token_hash,
    expires_at
  )
  values (
    v_team_a,
    'codex-live-verification-confirmed@example.invalid',
    v_member_role_a,
    v_owner_a,
    extensions.digest(v_token_confirmed, 'sha256'),
    pg_catalog.now() + interval '1 day'
  )
  returning id into v_invitation_confirmed;

  insert into public.invitations (
    team_id,
    email,
    role_id,
    inviter_user_id,
    token_hash,
    expires_at
  )
  values (
    v_team_a,
    'codex-live-verification-unconfirmed@example.invalid',
    v_member_role_a,
    v_owner_a,
    extensions.digest(v_token_unconfirmed, 'sha256'),
    pg_catalog.now() + interval '1 day'
  )
  returning id into v_invitation_unconfirmed;

  insert into public.invitations (
    team_id,
    email,
    role_id,
    inviter_user_id,
    token_hash,
    expires_at
  )
  values (
    v_team_a,
    'codex-live-verification-not-outsider@example.invalid',
    v_member_role_a,
    v_owner_a,
    extensions.digest(v_token_mismatch, 'sha256'),
    pg_catalog.now() + interval '1 day'
  )
  returning id into v_invitation_mismatch;

  if exists (
    select 1
    from private.audit_events
    where table_name = 'invitations'
      and (
        coalesce(old_data ? 'token_hash', false)
        or coalesce(new_data ? 'token_hash', false)
      )
  ) then
    raise exception 'live verification: invitation token hash entered the audit log';
  end if;

  -- Tenant B cannot observe any tenant A data, including profiles. Forged
  -- user_metadata is irrelevant because authorization comes from memberships.
  perform pg_catalog.set_config('request.jwt.claim.sub', v_owner_b::text, true);
  perform pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.jsonb_build_object(
      'sub', v_owner_b,
      'role', 'authenticated',
      'user_metadata', pg_catalog.jsonb_build_object('role', 'owner')
    )::text,
    true
  );
  execute 'set local role authenticated';

  select pg_catalog.count(*) into v_count
  from public.teams
  where id in (v_team_a, v_team_b);
  if v_count <> 1 then
    raise exception 'live verification: tenant team isolation returned % rows', v_count;
  end if;

  select pg_catalog.count(*) into v_count
  from public.roles
  where team_id = v_team_a;
  if v_count <> 0 then
    raise exception 'live verification: cross-tenant roles are visible';
  end if;

  select pg_catalog.count(*) into v_count
  from public.memberships
  where team_id = v_team_a;
  if v_count <> 0 then
    raise exception 'live verification: cross-tenant memberships are visible';
  end if;

  select pg_catalog.count(*) into v_count
  from public.team_settings
  where team_id = v_team_a;
  if v_count <> 0 then
    raise exception 'live verification: cross-tenant settings are visible';
  end if;

  select pg_catalog.count(*) into v_count
  from public.invitations
  where team_id = v_team_a;
  if v_count <> 0 then
    raise exception 'live verification: cross-tenant invitations are visible';
  end if;

  select pg_catalog.count(*) into v_count
  from public.profiles
  where id = v_owner_a;
  if v_count <> 0 then
    raise exception 'live verification: cross-tenant profile is visible';
  end if;

  execute 'reset role';

  -- Owner capabilities and immutable owner/system invariants.
  perform pg_catalog.set_config('request.jwt.claim.sub', v_owner_a::text, true);
  perform pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.jsonb_build_object('sub', v_owner_a, 'role', 'authenticated')::text,
    true
  );
  execute 'set local role authenticated';

  update public.teams
  set name = 'Live Verification Alpha Owner Updated'
  where id = v_team_a;
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception 'live verification: owner could not update team';
  end if;

  update public.team_settings
  set settings = '{"timezone":"UTC"}'::jsonb
  where team_id = v_team_a;
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception 'live verification: owner could not update settings';
  end if;

  insert into public.roles (team_id, slug, name, description)
  values (v_team_a, 'coach', 'coach', 'live verification custom role');

  select id into strict v_custom_role_a
  from public.roles
  where team_id = v_team_a and slug = 'coach';

  insert into public.role_permissions (role_id, permission_code)
  values (v_custom_role_a, 'team.read');

  v_failed := false;
  v_error_state := null;
  begin
    insert into public.role_permissions (role_id, permission_code)
    values (v_custom_role_a, 'team.delete');
  exception
    when others then
      v_failed := true;
      v_error_state := sqlstate;
  end;
  if not v_failed or v_error_state <> '42501' then
    raise exception 'live verification: custom team.delete was not denied with 42501 (state=%)', v_error_state;
  end if;

  if exists (
    select 1
    from public.role_permissions
    where role_id = v_custom_role_a
      and permission_code = 'team.delete'
  ) then
    raise exception 'live verification: custom role received team.delete';
  end if;

  update public.memberships
  set role_id = v_admin_role_a
  where team_id = v_team_a and user_id = v_owner_a;
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then
    raise exception 'live verification: owner membership was mutable';
  end if;

  delete from public.memberships
  where team_id = v_team_a and user_id = v_owner_a;
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then
    raise exception 'live verification: owner membership was deletable';
  end if;

  update public.roles
  set name = 'mutated owner'
  where id = v_owner_role_a;
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then
    raise exception 'live verification: system owner role was mutable';
  end if;

  delete from public.roles
  where id = v_owner_role_a;
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then
    raise exception 'live verification: system owner role was deletable';
  end if;

  delete from public.teams
  where id = v_disposable_team;
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception 'live verification: owner team.delete did not delete disposable team';
  end if;

  execute 'reset role';

  -- Admin may manage the team, settings, custom roles, and non-owner members,
  -- but never system roles, the owner membership, or the team itself.
  perform pg_catalog.set_config('request.jwt.claim.sub', v_admin_a::text, true);
  perform pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.jsonb_build_object('sub', v_admin_a, 'role', 'authenticated')::text,
    true
  );
  execute 'set local role authenticated';

  update public.teams
  set name = 'Live Verification Alpha Admin Updated'
  where id = v_team_a;
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception 'live verification: admin could not update team';
  end if;

  update public.team_settings
  set settings = '{"timezone":"Asia/Ho_Chi_Minh"}'::jsonb
  where team_id = v_team_a;
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception 'live verification: admin could not update settings';
  end if;

  update public.roles
  set name = 'team coach'
  where id = v_custom_role_a;
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception 'live verification: admin could not update custom role';
  end if;

  update public.memberships
  set role_id = v_custom_role_a
  where team_id = v_team_a and user_id = v_member_a;
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception 'live verification: admin could not manage non-owner member';
  end if;

  update public.memberships
  set role_id = v_member_role_a
  where team_id = v_team_a and user_id = v_member_a;
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception 'live verification: admin could not restore member role';
  end if;

  update public.memberships
  set role_id = v_admin_role_a
  where team_id = v_team_a and user_id = v_owner_a;
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then
    raise exception 'live verification: admin changed owner membership';
  end if;

  delete from public.memberships
  where team_id = v_team_a and user_id = v_owner_a;
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then
    raise exception 'live verification: admin deleted owner membership';
  end if;

  update public.roles
  set name = 'mutated admin'
  where id = v_admin_role_a;
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then
    raise exception 'live verification: admin system role was mutable';
  end if;

  delete from public.roles
  where id = v_admin_role_a;
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then
    raise exception 'live verification: admin system role was deletable';
  end if;

  delete from public.teams
  where id = v_team_a;
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then
    raise exception 'live verification: admin exercised team.delete';
  end if;

  select pg_catalog.count(*) into v_count
  from public.invitations
  where team_id = v_team_a;
  if v_count <> 3 then
    raise exception 'live verification: admin could not read safe invitation metadata';
  end if;

  v_failed := false;
  v_error_state := null;
  begin
    perform token_hash
    from public.invitations
    where id = v_invitation_confirmed;
  exception
    when others then
      v_failed := true;
      v_error_state := sqlstate;
  end;
  if not v_failed or v_error_state <> '42501' then
    raise exception 'live verification: token_hash SELECT was not denied with 42501 (state=%)', v_error_state;
  end if;

  -- Same-team membership policy rejects a role from tenant B.
  v_failed := false;
  v_error_state := null;
  begin
    update public.memberships
    set role_id = v_member_role_b
    where team_id = v_team_a and user_id = v_member_a;
  exception
    when others then
      v_failed := true;
      v_error_state := sqlstate;
  end;
  if not v_failed or v_error_state <> '42501' then
    raise exception 'live verification: cross-team role update was not denied with 42501 (state=%)', v_error_state;
  end if;

  execute 'reset role';

  if not exists (
    select 1
    from public.memberships
    where team_id = v_team_a
      and user_id = v_member_a
      and role_id = v_member_role_a
  ) then
    raise exception 'live verification: rejected cross-team update changed membership';
  end if;

  -- The composite FK independently rejects trusted/server-side cross-team role
  -- insertion as defense in depth.
  v_failed := false;
  v_error_state := null;
  begin
    insert into public.invitations (
      team_id,
      email,
      role_id,
      token_hash,
      expires_at
    )
    values (
      v_team_a,
      'codex-live-verification-cross-team@example.invalid',
      v_member_role_b,
      extensions.digest(v_token_unknown, 'sha256'),
      pg_catalog.now() + interval '1 day'
    );
  exception
    when others then
      v_failed := true;
      v_error_state := sqlstate;
  end;
  if not v_failed or v_error_state <> '23503' then
    raise exception 'live verification: cross-team invitation FK did not reject with 23503 (state=%)', v_error_state;
  end if;

  -- Members receive only the four read capabilities in their mapping.
  perform pg_catalog.set_config('request.jwt.claim.sub', v_member_a::text, true);
  perform pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.jsonb_build_object('sub', v_member_a, 'role', 'authenticated')::text,
    true
  );
  execute 'set local role authenticated';

  select pg_catalog.count(*) into v_count
  from public.teams
  where id = v_team_a;
  if v_count <> 1 then
    raise exception 'live verification: member lacks team.read';
  end if;

  select pg_catalog.count(*) into v_count
  from public.memberships
  where team_id = v_team_a;
  if v_count <> 3 then
    raise exception 'live verification: member lacks members.read';
  end if;

  select pg_catalog.count(*) into v_count
  from public.roles
  where team_id = v_team_a;
  if v_count <> 4 then
    raise exception 'live verification: member lacks roles.read';
  end if;

  select pg_catalog.count(*) into v_count
  from public.team_settings
  where team_id = v_team_a;
  if v_count <> 1 then
    raise exception 'live verification: member lacks settings.read';
  end if;

  select pg_catalog.count(*) into v_count
  from public.invitations
  where team_id = v_team_a;
  if v_count <> 0 then
    raise exception 'live verification: member received members.invite';
  end if;

  update public.teams
  set name = 'Member Mutation'
  where id = v_team_a;
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then
    raise exception 'live verification: member received team.update';
  end if;

  update public.team_settings
  set settings = '{"member":"mutation"}'::jsonb
  where team_id = v_team_a;
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then
    raise exception 'live verification: member received settings.update';
  end if;

  update public.memberships
  set role_id = v_custom_role_a
  where team_id = v_team_a and user_id = v_admin_a;
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then
    raise exception 'live verification: member received members.manage';
  end if;

  v_failed := false;
  v_error_state := null;
  begin
    insert into public.roles (team_id, slug, name)
    values (v_team_a, 'member-created', 'member created');
  exception
    when others then
      v_failed := true;
      v_error_state := sqlstate;
  end;
  if not v_failed or v_error_state <> '42501' then
    raise exception 'live verification: member roles.manage insert was not denied with 42501 (state=%)', v_error_state;
  end if;

  execute 'reset role';

  -- Confirmed-email invitation acceptance succeeds exactly once. All other
  -- availability failures intentionally share one generic message.
  perform pg_catalog.set_config('request.jwt.claim.sub', v_invitee_confirmed::text, true);
  perform pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.jsonb_build_object('sub', v_invitee_confirmed, 'role', 'authenticated')::text,
    true
  );
  execute 'set local role authenticated';

  v_accepted_team := public.accept_team_invitation(v_token_confirmed);
  if v_accepted_team <> v_team_a then
    raise exception 'live verification: invitation RPC returned wrong team';
  end if;

  v_failed := false;
  v_error_state := null;
  v_error_message := null;
  begin
    perform public.accept_team_invitation(v_token_confirmed);
  exception
    when others then
      v_failed := true;
      v_error_state := sqlstate;
      v_error_message := sqlerrm;
  end;
  if not v_failed
    or v_error_state <> 'P0001'
    or v_error_message <> 'Invitation is invalid or unavailable' then
    raise exception 'live verification: reused invitation did not fail generically (state=%, message=%)',
      v_error_state,
      v_error_message;
  end if;

  execute 'reset role';

  if not exists (
    select 1
    from public.invitations
    where id = v_invitation_confirmed
      and status = 'accepted'
      and accepted_at is not null
      and accepted_by_user_id = v_invitee_confirmed
  ) then
    raise exception 'live verification: accepted invitation state is incomplete';
  end if;

  if not exists (
    select 1
    from public.memberships
    where team_id = v_team_a
      and user_id = v_invitee_confirmed
      and role_id = v_member_role_a
  ) then
    raise exception 'live verification: accepted invitation did not create membership';
  end if;

  perform pg_catalog.set_config('request.jwt.claim.sub', v_invitee_unconfirmed::text, true);
  perform pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.jsonb_build_object('sub', v_invitee_unconfirmed, 'role', 'authenticated')::text,
    true
  );
  execute 'set local role authenticated';

  v_failed := false;
  v_error_state := null;
  v_error_message := null;
  begin
    perform public.accept_team_invitation(v_token_unconfirmed);
  exception
    when others then
      v_failed := true;
      v_error_state := sqlstate;
      v_error_message := sqlerrm;
  end;
  if not v_failed
    or v_error_state <> 'P0001'
    or v_error_message <> 'Invitation is invalid or unavailable' then
    raise exception 'live verification: unconfirmed email did not fail generically (state=%, message=%)',
      v_error_state,
      v_error_message;
  end if;

  execute 'reset role';

  perform pg_catalog.set_config('request.jwt.claim.sub', v_outsider::text, true);
  perform pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.jsonb_build_object(
      'sub', v_outsider,
      'role', 'authenticated',
      'user_metadata', pg_catalog.jsonb_build_object('role', 'owner')
    )::text,
    true
  );
  execute 'set local role authenticated';

  v_failed := false;
  v_error_state := null;
  v_error_message := null;
  begin
    perform public.accept_team_invitation(v_token_mismatch);
  exception
    when others then
      v_failed := true;
      v_error_state := sqlstate;
      v_error_message := sqlerrm;
  end;
  if not v_failed
    or v_error_state <> 'P0001'
    or v_error_message <> 'Invitation is invalid or unavailable' then
    raise exception 'live verification: mismatched email did not fail generically (state=%, message=%)',
      v_error_state,
      v_error_message;
  end if;

  v_failed := false;
  v_error_state := null;
  v_error_message := null;
  begin
    perform public.accept_team_invitation(v_token_unknown);
  exception
    when others then
      v_failed := true;
      v_error_state := sqlstate;
      v_error_message := sqlerrm;
  end;
  if not v_failed
    or v_error_state <> 'P0001'
    or v_error_message <> 'Invitation is invalid or unavailable' then
    raise exception 'live verification: unknown token did not fail generically (state=%, message=%)',
      v_error_state,
      v_error_message;
  end if;

  execute 'reset role';

  if exists (
    select 1
    from public.memberships
    where team_id = v_team_a
      and user_id in (v_invitee_unconfirmed, v_outsider)
  ) then
    raise exception 'live verification: failed invitation created a membership';
  end if;

  if not exists (
    select 1
    from public.invitations
    where id in (v_invitation_unconfirmed, v_invitation_mismatch)
      and status = 'pending'
    group by team_id
    having pg_catalog.count(*) = 2
  ) then
    raise exception 'live verification: failed invitations did not remain pending';
  end if;

  -- Anon cannot read application objects or execute the RPC.
  perform pg_catalog.set_config('request.jwt.claim.sub', '', true);
  perform pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.jsonb_build_object('role', 'anon')::text,
    true
  );
  execute 'set local role anon';

  v_failed := false;
  v_error_state := null;
  begin
    perform id from public.profiles limit 1;
  exception
    when others then
      v_failed := true;
      v_error_state := sqlstate;
  end;
  if not v_failed or v_error_state <> '42501' then
    raise exception 'live verification: anon profile SELECT was not denied with 42501 (state=%)', v_error_state;
  end if;

  v_failed := false;
  v_error_state := null;
  begin
    perform public.accept_team_invitation(v_token_unknown);
  exception
    when others then
      v_failed := true;
      v_error_state := sqlstate;
  end;
  if not v_failed or v_error_state <> '42501' then
    raise exception 'live verification: anon RPC execute was not denied with 42501 (state=%)', v_error_state;
  end if;

  execute 'reset role';

  -- Audit events are private, carry the authenticated actor for the accepted
  -- invitation, and never contain token_hash in old/new JSON.
  if exists (
    select 1
    from private.audit_events
    where table_name = 'invitations'
      and (
        coalesce(old_data ? 'token_hash', false)
        or coalesce(new_data ? 'token_hash', false)
      )
  ) then
    raise exception 'live verification: invitation token hash entered audit JSON';
  end if;

  if not exists (
    select 1
    from private.audit_events
    where table_name = 'invitations'
      and action = 'UPDATE'
      and actor_user_id = v_invitee_confirmed
      and new_data ->> 'status' = 'accepted'
  ) then
    raise exception 'live verification: invitation acceptance audit actor/state missing';
  end if;

  if pg_catalog.has_table_privilege('anon', 'private.audit_events', 'SELECT')
    or pg_catalog.has_table_privilege('authenticated', 'private.audit_events', 'SELECT')
    or pg_catalog.has_table_privilege('service_role', 'private.audit_events', 'SELECT')
    or pg_catalog.has_sequence_privilege('anon', 'private.audit_events_id_seq', 'USAGE')
    or pg_catalog.has_sequence_privilege('authenticated', 'private.audit_events_id_seq', 'USAGE')
    or pg_catalog.has_sequence_privilege('service_role', 'private.audit_events_id_seq', 'USAGE') then
    raise exception 'live verification: audit table/sequence is exposed to an API role';
  end if;
end;
$verification$;

rollback;

select
  'ok'::text as status,
  16::integer as coverage_groups,
  'profile/team bootstrap; exact roles/mappings/settings; tenant isolation; owner/admin/member permissions; owner/system immutability; cross-team role rejection; custom team.delete denial; invitation secrecy/confirmed-email/single-use/generic failure; audit redaction; ACLs; functions; RLS/policies/triggers'::text as coverage,
  'rolled back'::text as fixtures;
