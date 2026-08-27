-- Transactional PostgreSQL 17 verification. Every fixture and mutation below
-- is rolled back; the final block proves zero fixture residue.

begin;
set local role postgres;

do $verification$
declare
  v_owner constant uuid := '00000000-0000-4000-8000-000000007101';
  v_admin constant uuid := '00000000-0000-4000-8000-000000007102';
  v_member constant uuid := '00000000-0000-4000-8000-000000007103';
  v_unrelated constant uuid := '00000000-0000-4000-8000-000000007104';
  v_attach_one constant uuid := '00000000-0000-4000-8000-000000007105';
  v_attach_two constant uuid := '00000000-0000-4000-8000-000000007106';
  v_attach_three constant uuid := '00000000-0000-4000-8000-000000007107';
  v_other_owner constant uuid := '00000000-0000-4000-8000-000000007108';
  v_players_only constant uuid := '00000000-0000-4000-8000-000000007109';
  v_members_only constant uuid := '00000000-0000-4000-8000-000000007110';
  v_attach_four constant uuid := '00000000-0000-4000-8000-000000007111';
  v_attach_five constant uuid := '00000000-0000-4000-8000-000000007112';
  v_team constant uuid := '00000000-0000-4000-8000-000000007201';
  v_other_team constant uuid := '00000000-0000-4000-8000-000000007202';
  v_prebackfill_user constant uuid := '00000000-0000-4000-8000-000000007001';
  v_prebackfill_team constant uuid := '00000000-0000-4000-8000-000000007002';
  v_owner_role uuid;
  v_admin_role uuid;
  v_member_role uuid;
  v_other_member_role uuid;
  v_unsafe_role uuid;
  v_players_only_role uuid;
  v_members_only_role uuid;
  v_actor uuid;
  v_count integer;
  v_rows integer;
  v_failed boolean;
  v_state text;
  v_notes text;
  v_attachment jsonb;
  v_previous_updated_at timestamptz;
begin
  if current_setting('server_version_num')::integer < 170000 then
    raise exception 'squad live verification requires PostgreSQL 17';
  end if;

  if not exists (
    select 1
    from storage.buckets
    where id = 'player-avatars'
      and name = 'player-avatars'
      and public = false
      and file_size_limit = 3145728
      and allowed_mime_types = array[
        'image/jpeg', 'image/png', 'image/webp'
      ]::text[]
  ) then
    raise exception 'squad live verification: private avatar bucket envelope differs';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_class
    where oid = 'public.team_player_profiles'::regclass
      and relrowsecurity
  ) then
    raise exception 'squad live verification: team_player_profiles RLS is disabled';
  end if;

  if pg_catalog.has_column_privilege(
    'authenticated', 'public.profiles', 'avatar_url', 'UPDATE'
  ) or pg_catalog.has_column_privilege(
    'authenticated', 'public.profiles', 'requires_password_change', 'UPDATE'
  ) or not pg_catalog.has_column_privilege(
    'authenticated', 'public.profiles', 'display_name', 'UPDATE'
  ) or not pg_catalog.has_column_privilege(
    'authenticated', 'public.profiles', 'avatar_path', 'UPDATE'
  ) then
    raise exception 'squad live verification: profile UPDATE column grants differ';
  end if;

  if pg_catalog.has_column_privilege(
    'authenticated', 'public.team_player_profiles', 'admin_notes', 'SELECT'
  ) or not pg_catalog.has_column_privilege(
    'authenticated', 'public.team_player_profiles', 'player_status', 'SELECT'
  ) or pg_catalog.has_table_privilege(
    'authenticated', 'public.team_player_profiles', 'INSERT'
  ) or pg_catalog.has_table_privilege(
    'authenticated', 'public.team_player_profiles', 'UPDATE'
  ) or pg_catalog.has_table_privilege(
    'authenticated', 'public.team_player_profiles', 'DELETE'
  ) then
    raise exception 'squad live verification: team-player grants differ';
  end if;

  if pg_catalog.has_column_privilege(
    'authenticated', 'public.memberships', 'role_id', 'UPDATE'
  ) or pg_catalog.has_column_privilege(
    'authenticated', 'public.memberships', 'status', 'UPDATE'
  ) or pg_catalog.has_table_privilege(
    'authenticated', 'public.memberships', 'DELETE'
  ) then
    raise exception 'squad live verification: direct membership mutation survived';
  end if;

  if not pg_catalog.has_function_privilege(
    'authenticated',
    'public.manage_team_player(uuid,uuid,uuid,smallint,text,text,date,text,boolean)',
    'EXECUTE'
  ) or pg_catalog.has_function_privilege(
    'anon',
    'public.manage_team_player(uuid,uuid,uuid,smallint,text,text,date,text,boolean)',
    'EXECUTE'
  ) or pg_catalog.has_function_privilege(
    'service_role',
    'public.manage_team_player(uuid,uuid,uuid,smallint,text,text,date,text,boolean)',
    'EXECUTE'
  ) then
    raise exception 'squad live verification: manage RPC EXECUTE grants differ';
  end if;

  if not pg_catalog.has_function_privilege(
    'service_role',
    'public.attach_team_member(uuid,uuid,uuid,text,boolean,uuid,smallint,text,date)',
    'EXECUTE'
  ) or pg_catalog.has_function_privilege(
    'authenticated',
    'public.attach_team_member(uuid,uuid,uuid,text,boolean,uuid,smallint,text,date)',
    'EXECUTE'
  ) or pg_catalog.has_function_privilege(
    'anon',
    'public.attach_team_member(uuid,uuid,uuid,text,boolean,uuid,smallint,text,date)',
    'EXECUTE'
  ) then
    raise exception 'squad live verification: attachment RPC EXECUTE grants differ';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc as proc
    join pg_catalog.pg_roles as owner_role
      on owner_role.oid = proc.proowner
    where proc.oid = any (array[
      'public.manage_team_player(uuid,uuid,uuid,smallint,text,text,date,text,boolean)'::regprocedure,
      'public.get_team_player_admin_detail(uuid,uuid)'::regprocedure,
      'public.attach_team_member(uuid,uuid,uuid,text,boolean,uuid,smallint,text,date)'::regprocedure
    ]::oid[])
      and (
        not proc.prosecdef
        or proc.proconfig is distinct from array['search_path=""']::text[]
        or owner_role.rolname <> 'postgres'
      )
  ) then
    raise exception 'squad live verification: trusted function hardening differs';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_proc as proc
    join pg_catalog.pg_roles as owner_role
      on owner_role.oid = proc.proowner
    where proc.oid = 'private.ensure_team_player_profile()'::regprocedure
      and not proc.prosecdef
      and proc.proconfig = array['search_path=""']::text[]
      and owner_role.rolname = 'postgres'
  ) then
    raise exception 'squad live verification: membership sync trigger is overprivileged';
  end if;

  select pg_catalog.count(*) into v_count
  from public.memberships as membership
  join public.team_player_profiles as player
    on player.team_id = membership.team_id
   and player.user_id = membership.user_id
  where membership.team_id = v_prebackfill_team
    and membership.user_id = v_prebackfill_user
    and membership.status = 'active'
    and player.join_date = date '2024-01-15';

  if v_count <> 1 or (
    select pg_catalog.count(*)
    from public.team_player_profiles
    where team_id = v_prebackfill_team
       or user_id = v_prebackfill_user
  ) <> 1 then
    raise exception
      'squad live verification: committed pre-migration membership was not backfilled exactly once';
  end if;

  insert into auth.users (
    id,
    email,
    email_confirmed_at,
    raw_user_meta_data
  )
  select
    fixture.id,
    fixture.email,
    pg_catalog.now(),
    pg_catalog.jsonb_build_object('display_name', fixture.display_name)
  from (
    values
      (v_owner, 'squad-owner@example.test', 'Squad Owner'),
      (v_admin, 'squad-admin@example.test', 'Squad Admin'),
      (v_member, 'squad-member@example.test', 'Squad Member'),
      (v_unrelated, 'squad-unrelated@example.test', 'Unrelated User'),
      (v_attach_one, 'squad-attach-one@example.test', 'Attach One'),
      (v_attach_two, 'squad-attach-two@example.test', 'Attach Two'),
      (v_attach_three, 'squad-attach-three@example.test', 'Attach Three'),
      (v_other_owner, 'squad-other-owner@example.test', 'Other Owner'),
      (v_players_only, 'squad-players-only@example.test', 'Players Only'),
      (v_members_only, 'squad-members-only@example.test', 'Members Only'),
      (v_attach_four, 'squad-attach-four@example.test', 'Attach Four'),
      (v_attach_five, 'squad-attach-five@example.test', 'Attach Five')
  ) as fixture(id, email, display_name);

  insert into public.teams (id, name, slug, owner_user_id)
  values
    (v_team, 'Squad Verification', 'squad-verification-20260825', v_owner),
    (
      v_other_team,
      'Squad Other Verification',
      'squad-other-verification-20260825',
      v_other_owner
    );

  select id into strict v_owner_role
  from public.roles
  where team_id = v_team and slug = 'owner';

  select id into strict v_admin_role
  from public.roles
  where team_id = v_team and slug = 'admin';

  select id into strict v_member_role
  from public.roles
  where team_id = v_team and slug = 'member';

  select id into strict v_other_member_role
  from public.roles
  where team_id = v_other_team and slug = 'member';

  insert into public.roles (
    id,
    team_id,
    slug,
    name,
    description,
    is_system
  )
  values (
    extensions.gen_random_uuid(),
    v_team,
    'players-only',
    'Players Only',
    'exactly players.manage for dual-permission verification',
    false
  )
  returning id into v_players_only_role;

  insert into public.roles (
    id,
    team_id,
    slug,
    name,
    description,
    is_system
  )
  values (
    extensions.gen_random_uuid(),
    v_team,
    'members-only',
    'Members Only',
    'exactly members.manage for dual-permission verification',
    false
  )
  returning id into v_members_only_role;

  insert into public.role_permissions (role_id, permission_code)
  values
    (v_players_only_role, 'players.manage'),
    (v_members_only_role, 'members.manage');

  insert into public.memberships (team_id, user_id, role_id)
  values
    (v_team, v_admin, v_admin_role),
    (v_team, v_member, v_member_role),
    (v_team, v_players_only, v_players_only_role),
    (v_team, v_members_only, v_members_only_role);

  if (
    select pg_catalog.count(*)
    from public.team_player_profiles
    where team_id = v_team
      and user_id = any (array[v_owner, v_admin, v_member]::uuid[])
  ) <> 3 then
    raise exception 'squad live verification: active-membership trigger missed a player row';
  end if;

  if (
    select pg_catalog.count(*)
    from public.team_player_profiles
    where team_id = v_team
      and user_id = any (array[v_players_only, v_members_only]::uuid[])
  ) <> 2 then
    raise exception 'squad live verification: one-permission fixtures missed player rows';
  end if;

  foreach v_actor in array array[v_players_only, v_members_only]::uuid[] loop
    perform pg_catalog.set_config('request.jwt.claim.sub', v_actor::text, true);
    perform pg_catalog.set_config(
      'request.jwt.claims',
      pg_catalog.jsonb_build_object(
        'sub', v_actor,
        'role', 'authenticated'
      )::text,
      true
    );
    execute 'set local role authenticated';

    v_failed := false;
    v_state := null;
    begin
      perform public.manage_team_player(
        v_team,
        v_member,
        v_member_role,
        18::smallint,
        'ATT',
        'available',
        current_date - 100,
        null,
        false
      );
    exception
      when insufficient_privilege then
        v_failed := true;
        v_state := sqlstate;
    end;
    if not v_failed or v_state <> '42501' then
      raise exception
        'squad live verification: one-permission actor invoked manager RPC: %',
        v_actor;
    end if;

    v_failed := false;
    v_state := null;
    begin
      perform detail.admin_notes
      from public.get_team_player_admin_detail(v_team, v_member) as detail;
    exception
      when insufficient_privilege then
        v_failed := true;
        v_state := sqlstate;
    end;
    if not v_failed or v_state <> '42501' then
      raise exception
        'squad live verification: one-permission actor read admin detail: %',
        v_actor;
    end if;

    execute 'set local role postgres';
  end loop;

  update public.team_player_profiles
  set
    shirt_number = 18,
    official_position = 'ATT',
    player_status = 'available',
    join_date = current_date - 100,
    admin_notes = 'notes must stay private'
  where team_id = v_team
    and user_id = v_member;

  insert into public.roles (
    id,
    team_id,
    slug,
    name,
    description,
    is_system
  )
  values (
    extensions.gen_random_uuid(),
    v_team,
    'unsafe-delete',
    'Unsafe Delete',
    'must never be assigned to a player',
    false
  )
  returning id into v_unsafe_role;

  insert into public.role_permissions (role_id, permission_code)
  values (v_unsafe_role, 'team.delete');

  update public.team_player_profiles
  set shirt_number = 9
  where team_id = v_team and user_id = v_owner;

  v_failed := false;
  v_state := null;
  begin
    update public.team_player_profiles
    set shirt_number = 9
    where team_id = v_team and user_id = v_admin;
  exception
    when unique_violation then
      v_failed := true;
      v_state := sqlstate;
  end;
  if not v_failed or v_state <> '23505' then
    raise exception 'squad live verification: duplicate shirt number was accepted';
  end if;

  update public.team_player_profiles
  set shirt_number = null
  where team_id = v_team and user_id = v_owner;

  perform pg_catalog.set_config('request.jwt.claim.sub', v_member::text, true);
  perform pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.jsonb_build_object(
      'sub', v_member,
      'role', 'authenticated'
    )::text,
    true
  );
  execute 'set local role authenticated';

  select pg_catalog.count(*) into v_count
  from public.team_player_profiles
  where team_id = v_team;
  if v_count <> 5 then
    raise exception 'squad live verification: Member safe squad read returned % rows', v_count;
  end if;

  select pg_catalog.count(*) into v_count
  from public.profiles
  where id = any (array[v_owner, v_admin, v_member]::uuid[]);
  if v_count <> 3 then
    raise exception 'squad live verification: same-team profile visibility returned % rows', v_count;
  end if;

  v_failed := false;
  v_state := null;
  begin
    perform player.admin_notes
    from public.team_player_profiles as player
    where player.team_id = v_team and player.user_id = v_member;
  exception
    when insufficient_privilege then
      v_failed := true;
      v_state := sqlstate;
  end;
  if not v_failed or v_state <> '42501' then
    raise exception 'squad live verification: admin_notes leaked to authenticated';
  end if;

  update public.profiles
  set
    display_name = 'Updated Squad Member',
    phone = '+84 123 456 789',
    date_of_birth = date '1998-06-15',
    height_cm = 178,
    weight_kg = 72.50,
    preferred_positions = array['MID', 'ATT']::text[],
    avatar_path = v_member::text || '/avatar.webp'
  where id = v_member;
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception 'squad live verification: own-profile update changed % rows', v_rows;
  end if;

  update public.profiles
  set display_name = 'Cross User Mutation'
  where id = v_admin;
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then
    raise exception 'squad live verification: cross-user profile update succeeded';
  end if;

  v_failed := false;
  v_state := null;
  begin
    update public.profiles
    set height_cm = 99
    where id = v_member;
  exception
    when check_violation then
      v_failed := true;
      v_state := sqlstate;
  end;
  if not v_failed or v_state <> '23514' then
    raise exception 'squad live verification: invalid height was accepted';
  end if;

  v_failed := false;
  v_state := null;
  begin
    update public.profiles
    set preferred_positions = array['GK', 'GK']::text[]
    where id = v_member;
  exception
    when check_violation then
      v_failed := true;
      v_state := sqlstate;
  end;
  if not v_failed or v_state <> '23514' then
    raise exception 'squad live verification: duplicate preferred position was accepted';
  end if;

  v_failed := false;
  v_state := null;
  begin
    update public.profiles
    set date_of_birth = current_date + 1
    where id = v_member;
  exception
    when check_violation then
      v_failed := true;
      v_state := sqlstate;
  end;
  if not v_failed or v_state <> '23514' then
    raise exception 'squad live verification: future date of birth was accepted';
  end if;

  v_failed := false;
  v_state := null;
  begin
    update public.profiles
    set avatar_path = v_admin::text || '/avatar.png'
    where id = v_member;
  exception
    when check_violation then
      v_failed := true;
      v_state := sqlstate;
  end;
  if not v_failed or v_state <> '23514' then
    raise exception 'squad live verification: cross-owner avatar path was accepted';
  end if;

  v_failed := false;
  v_state := null;
  begin
    update public.profiles
    set avatar_url = 'https://legacy.example/avatar.png'
    where id = v_member;
  exception
    when insufficient_privilege then
      v_failed := true;
      v_state := sqlstate;
  end;
  if not v_failed or v_state <> '42501' then
    raise exception 'squad live verification: legacy avatar_url remained writable';
  end if;

  v_failed := false;
  v_state := null;
  begin
    update public.profiles
    set requires_password_change = true
    where id = v_member;
  exception
    when insufficient_privilege then
      v_failed := true;
      v_state := sqlstate;
  end;
  if not v_failed or v_state <> '42501' then
    raise exception 'squad live verification: password-change flag remained writable';
  end if;

  v_failed := false;
  v_state := null;
  begin
    update public.memberships
    set status = 'inactive'
    where team_id = v_team and user_id = v_member;
  exception
    when insufficient_privilege then
      v_failed := true;
      v_state := sqlstate;
  end;
  if not v_failed or v_state <> '42501' then
    raise exception 'squad live verification: direct membership status update survived';
  end if;

  v_failed := false;
  v_state := null;
  begin
    update public.team_player_profiles
    set player_status = 'injured'
    where team_id = v_team and user_id = v_member;
  exception
    when insufficient_privilege then
      v_failed := true;
      v_state := sqlstate;
  end;
  if not v_failed or v_state <> '42501' then
    raise exception 'squad live verification: direct team-player mutation survived';
  end if;

  v_failed := false;
  v_state := null;
  begin
    perform public.manage_team_player(
      v_team,
      v_admin,
      v_member_role,
      4::smallint,
      'DEF',
      'available',
      current_date - 10,
      null,
      false
    );
  exception
    when insufficient_privilege then
      v_failed := true;
      v_state := sqlstate;
  end;
  if not v_failed or v_state <> '42501' then
    raise exception 'squad live verification: Member invoked manager RPC';
  end if;

  v_failed := false;
  v_state := null;
  begin
    perform public.attach_team_member(
      v_admin,
      v_team,
      v_attach_one,
      'Attach One',
      false,
      v_member_role,
      31::smallint,
      'DEF',
      current_date
    );
  exception
    when insufficient_privilege then
      v_failed := true;
      v_state := sqlstate;
  end;
  if not v_failed or v_state <> '42501' then
    raise exception 'squad live verification: authenticated invoked attachment RPC';
  end if;

  execute 'set local role postgres';

  perform pg_catalog.set_config('request.jwt.claim.sub', v_unrelated::text, true);
  execute 'set local role authenticated';

  select pg_catalog.count(*) into v_count
  from public.team_player_profiles
  where team_id = v_team;
  if v_count <> 0 then
    raise exception 'squad live verification: unrelated squad read returned % rows', v_count;
  end if;

  select pg_catalog.count(*) into v_count
  from public.profiles
  where id = v_member;
  if v_count <> 0 then
    raise exception 'squad live verification: unrelated profile read returned % rows', v_count;
  end if;

  perform pg_catalog.set_config('request.jwt.claim.sub', v_owner::text, true);
  perform public.manage_team_player(
    v_team,
    v_admin,
    v_admin_role,
    7::smallint,
    'DEF',
    'available',
    current_date - 20,
    'owner-authorized private note',
    false
  );
  if not exists (
    select 1
    from public.team_player_profiles
    where team_id = v_team
      and user_id = v_admin
      and shirt_number = 7
      and official_position = 'DEF'
  ) then
    raise exception 'squad live verification: Owner manager edit was not retained';
  end if;

  perform pg_catalog.set_config('request.jwt.claim.sub', v_admin::text, true);

  v_failed := false;
  v_state := null;
  begin
    perform public.manage_team_player(
      v_team,
      v_member,
      v_other_member_role,
      18::smallint,
      'ATT',
      'available',
      current_date - 100,
      null,
      false
    );
  exception
    when insufficient_privilege then
      v_failed := true;
      v_state := sqlstate;
  end;
  if not v_failed or v_state <> '42501' then
    raise exception 'squad live verification: cross-team role assignment succeeded';
  end if;

  v_failed := false;
  v_state := null;
  begin
    perform public.manage_team_player(
      v_team,
      v_member,
      v_unsafe_role,
      18::smallint,
      'ATT',
      'available',
      current_date - 100,
      null,
      false
    );
  exception
    when insufficient_privilege then
      v_failed := true;
      v_state := sqlstate;
  end;
  if not v_failed or v_state <> '42501' then
    raise exception 'squad live verification: team.delete role assignment succeeded';
  end if;

  v_failed := false;
  v_state := null;
  begin
    perform public.manage_team_player(
      v_team,
      v_owner,
      v_admin_role,
      1::smallint,
      'GK',
      'available',
      current_date,
      null,
      false
    );
  exception
    when insufficient_privilege then
      v_failed := true;
      v_state := sqlstate;
  end;
  if not v_failed or v_state <> '42501' then
    raise exception 'squad live verification: Owner target was mutable';
  end if;

  v_failed := false;
  v_state := null;
  begin
    perform public.manage_team_player(
      v_team,
      v_member,
      v_member_role,
      18::smallint,
      'WING',
      'available',
      current_date - 100,
      null,
      false
    );
  exception
    when invalid_parameter_value then
      v_failed := true;
      v_state := sqlstate;
  end;
  if not v_failed or v_state <> '22023' then
    raise exception 'squad live verification: invalid official position was accepted';
  end if;

  v_failed := false;
  v_state := null;
  begin
    perform public.manage_team_player(
      v_team,
      v_member,
      v_member_role,
      18::smallint,
      'ATT',
      'available',
      current_date + 1,
      null,
      false
    );
  exception
    when invalid_parameter_value then
      v_failed := true;
      v_state := sqlstate;
  end;
  if not v_failed or v_state <> '22023' then
    raise exception 'squad live verification: future join date was accepted';
  end if;

  select updated_at into strict v_previous_updated_at
  from public.team_player_profiles
  where team_id = v_team and user_id = v_member;

  perform public.manage_team_player(
    v_team,
    v_member,
    v_member_role,
    12::smallint,
    'MID',
    'injured',
    current_date - 50,
    'manager-only tactical note',
    false
  );

  select detail.admin_notes into v_notes
  from public.get_team_player_admin_detail(v_team, v_member) as detail;
  if v_notes is distinct from 'manager-only tactical note' then
    raise exception 'squad live verification: authorized Admin detail differs';
  end if;

  if not exists (
    select 1
    from public.team_player_profiles
    where team_id = v_team
      and user_id = v_member
      and shirt_number = 12
      and official_position = 'MID'
      and player_status = 'injured'
      and join_date = current_date - 50
      and updated_at >= v_previous_updated_at
  ) then
    raise exception 'squad live verification: valid Admin edit was not retained';
  end if;

  execute 'set local role postgres';
  if exists (
    select 1
    from private.audit_events
    where team_id = v_team
      and actor_user_id = any (array[v_owner, v_admin]::uuid[])
      and table_name = 'team_player_profiles'
      and (
        old_data ? 'admin_notes'
        or new_data ? 'admin_notes'
        or old_data::text like '%manager-only tactical note%'
        or new_data::text like '%manager-only tactical note%'
        or old_data::text like '%owner-authorized private note%'
        or new_data::text like '%owner-authorized private note%'
        or old_data ? 'phone'
        or new_data ? 'phone'
        or old_data ? 'email'
        or new_data ? 'email'
      )
  ) then
    raise exception 'squad live verification: audit metadata leaked notes/contact data';
  end if;
  execute 'set local role authenticated';

  perform public.manage_team_player(
    v_team,
    v_member,
    v_member_role,
    12::smallint,
    'MID',
    'unavailable',
    current_date - 50,
    null,
    true
  );

  if not exists (
    select 1
    from public.memberships
    where team_id = v_team
      and user_id = v_member
      and status = 'inactive'
  ) then
    raise exception 'squad live verification: Admin deactivation was not retained';
  end if;

  perform public.manage_team_player(
    v_team,
    v_member,
    v_member_role,
    12::smallint,
    'MID',
    'unavailable',
    current_date - 50,
    null,
    false
  );
  if not exists (
    select 1
    from public.memberships
    where team_id = v_team
      and user_id = v_member
      and status = 'inactive'
  ) then
    raise exception 'squad live verification: deferred reactivation was bypassed';
  end if;

  select pg_catalog.count(*) into v_count
  from public.profiles
  where id = v_member;
  if v_count <> 1 then
    raise exception 'squad live verification: Admin lost inactive-player profile visibility';
  end if;

  select pg_catalog.count(*) into v_count
  from public.team_player_profiles
  where team_id = v_team and user_id = v_member;
  if v_count <> 1 then
    raise exception 'squad live verification: Admin lost inactive-player squad visibility';
  end if;

  perform pg_catalog.set_config('request.jwt.claim.sub', v_member::text, true);
  select pg_catalog.count(*) into v_count
  from public.profiles
  where id = v_member;
  if v_count <> 1 then
    raise exception 'squad live verification: inactive user lost own-profile visibility';
  end if;

  select pg_catalog.count(*) into v_count
  from public.team_player_profiles
  where team_id = v_team;
  if v_count <> 0 then
    raise exception 'squad live verification: inactive user retained squad visibility';
  end if;

  execute 'set local role service_role';
  perform pg_catalog.set_config('request.jwt.claim.sub', '', true);

  perform public.attach_team_member(
    v_admin,
    v_team,
    v_attach_one,
    'Attached One',
    false,
    v_member_role,
    31::smallint,
    'DEF',
    current_date - 5
  );

  execute 'set local role postgres';
  select pg_catalog.jsonb_build_object(
    'membership_status', membership.status,
    'role_id', membership.role_id,
    'shirt_number', player.shirt_number,
    'official_position', player.official_position,
    'player_status', player.player_status,
    'join_date', player.join_date,
    'display_name', profile.display_name,
    'requires_password_change', profile.requires_password_change
  )
  into v_attachment
  from public.memberships as membership
  join public.team_player_profiles as player
    on player.team_id = membership.team_id
   and player.user_id = membership.user_id
  join public.profiles as profile
    on profile.id = membership.user_id
  where membership.team_id = v_team
    and membership.user_id = v_attach_one;

  if not exists (
    select 1
    from public.memberships as membership
    join public.team_player_profiles as player
      on player.team_id = membership.team_id
     and player.user_id = membership.user_id
    join public.profiles as profile
      on profile.id = membership.user_id
    where membership.team_id = v_team
      and membership.user_id = v_attach_one
      and membership.status = 'active'
      and membership.role_id = v_member_role
      and player.shirt_number = 31
      and player.official_position = 'DEF'
      and player.player_status = 'available'
      and player.join_date = current_date - 5
      and profile.display_name = 'Attach One'
      and profile.requires_password_change = false
  ) then
    raise exception
      'squad live verification: authorized service attachment differs: %',
      v_attachment;
  end if;
  execute 'set local role service_role';

  execute 'set local role postgres';
  update public.profiles
  set
    display_name = 'Existing Cross-Team Name',
    requires_password_change = true
  where id = v_other_owner;
  execute 'set local role service_role';

  perform public.attach_team_member(
    v_admin,
    v_team,
    v_other_owner,
    'Submitted Replacement Name',
    false,
    v_member_role,
    null::smallint,
    'MID',
    current_date
  );

  execute 'set local role postgres';
  if not exists (
    select 1
    from public.profiles as profile
    where profile.id = v_other_owner
      and profile.display_name = 'Existing Cross-Team Name'
      and profile.requires_password_change = true
  ) or (
    select pg_catalog.count(*)
    from public.memberships as membership
    where membership.user_id = v_other_owner
      and membership.team_id = any (array[v_team, v_other_team]::uuid[])
      and membership.status = 'active'
  ) <> 2 then
    raise exception
      'squad live verification: cross-team attachment overwrote the global profile or cleared its password-change flag';
  end if;
  execute 'set local role service_role';

  v_failed := false;
  v_state := null;
  begin
    perform public.attach_team_member(
      v_admin,
      v_team,
      v_attach_one,
      'Attached One',
      false,
      v_member_role,
      31::smallint,
      'DEF',
      current_date - 5
    );
  exception
    when unique_violation then
      v_failed := true;
      v_state := sqlstate;
  end;
  if not v_failed or v_state <> '23505' then
    raise exception 'squad live verification: duplicate active attachment succeeded';
  end if;

  v_failed := false;
  v_state := null;
  begin
    perform public.attach_team_member(
      v_member,
      v_team,
      v_attach_two,
      'Attached Two',
      false,
      v_member_role,
      null::smallint,
      null::text,
      current_date
    );
  exception
    when insufficient_privilege then
      v_failed := true;
      v_state := sqlstate;
  end;
  if not v_failed or v_state <> '42501' then
    raise exception 'squad live verification: unauthorized service actor succeeded';
  end if;

  v_failed := false;
  v_state := null;
  begin
    perform public.attach_team_member(
      v_players_only,
      v_team,
      v_attach_four,
      'Attach Four',
      false,
      v_member_role,
      null::smallint,
      null::text,
      current_date
    );
  exception
    when insufficient_privilege then
      v_failed := true;
      v_state := sqlstate;
  end;
  if not v_failed or v_state <> '42501' then
    raise exception
      'squad live verification: players-only service actor attached a member';
  end if;

  v_failed := false;
  v_state := null;
  begin
    perform public.attach_team_member(
      v_members_only,
      v_team,
      v_attach_five,
      'Attach Five',
      false,
      v_member_role,
      null::smallint,
      null::text,
      current_date
    );
  exception
    when insufficient_privilege then
      v_failed := true;
      v_state := sqlstate;
  end;
  if not v_failed or v_state <> '42501' then
    raise exception
      'squad live verification: members-only service actor attached a member';
  end if;

  v_failed := false;
  v_state := null;
  begin
    perform public.attach_team_member(
      v_admin,
      v_team,
      v_attach_two,
      'Attached Two',
      false,
      v_other_member_role,
      null::smallint,
      null,
      current_date
    );
  exception
    when insufficient_privilege then
      v_failed := true;
      v_state := sqlstate;
  end;
  if not v_failed or v_state <> '42501' then
    raise exception 'squad live verification: service cross-team role succeeded';
  end if;

  v_failed := false;
  v_state := null;
  begin
    perform public.attach_team_member(
      v_admin,
      v_team,
      v_attach_two,
      'Attached Two',
      false,
      v_unsafe_role,
      null::smallint,
      null::text,
      current_date
    );
  exception
    when insufficient_privilege then
      v_failed := true;
      v_state := sqlstate;
  end;
  if not v_failed or v_state <> '42501' then
    raise exception 'squad live verification: unsafe service role succeeded';
  end if;

  perform public.attach_team_member(
    v_admin,
    v_team,
    v_attach_three,
    'Attached Three',
    true,
    v_member_role,
    null::smallint,
    'GK',
    current_date
  );
  execute 'set local role postgres';
  if not exists (
    select 1
    from public.profiles
    where id = v_attach_three
      and requires_password_change = true
  ) then
    raise exception 'squad live verification: new-account password flag was not retained';
  end if;

  execute 'set local role postgres';
  insert into storage.objects (bucket_id, name)
  values (
    'player-avatars',
    v_unrelated::text || '/avatar.png'
  );

  perform pg_catalog.set_config('request.jwt.claim.sub', v_admin::text, true);
  execute 'set local role authenticated';

  insert into storage.objects (bucket_id, name)
  values ('player-avatars', v_admin::text || '/avatar.png');

  select pg_catalog.count(*) into v_count
  from storage.objects
  where bucket_id = 'player-avatars';
  if v_count <> 1 then
    raise exception 'squad live verification: avatar listing exposed % rows', v_count;
  end if;

  update storage.objects
  set name = v_admin::text || '/avatar.webp'
  where bucket_id = 'player-avatars'
    and name = v_admin::text || '/avatar.png';
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception 'squad live verification: owner avatar upsert UPDATE failed';
  end if;

  v_failed := false;
  v_state := null;
  begin
    insert into storage.objects (bucket_id, name)
    values ('player-avatars', v_unrelated::text || '/cross-user.webp');
  exception
    when insufficient_privilege then
      v_failed := true;
      v_state := sqlstate;
  end;
  if not v_failed or v_state <> '42501' then
    raise exception 'squad live verification: cross-user avatar INSERT succeeded';
  end if;

  v_failed := false;
  v_state := null;
  begin
    update storage.objects
    set name = v_unrelated::text || '/cross-user.webp'
    where bucket_id = 'player-avatars'
      and name = v_admin::text || '/avatar.webp';
  exception
    when insufficient_privilege then
      v_failed := true;
      v_state := sqlstate;
  end;
  if not v_failed or v_state <> '42501' then
    raise exception 'squad live verification: cross-user avatar UPDATE succeeded';
  end if;

  delete from storage.objects
  where bucket_id = 'player-avatars'
    and name = v_admin::text || '/avatar.webp';
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception 'squad live verification: owner avatar DELETE failed';
  end if;

  execute 'set local role postgres';
end;
$verification$;

rollback;

do $cleanup_verification$
declare
  v_fixture_users constant uuid[] := array[
    '00000000-0000-4000-8000-000000007101'::uuid,
    '00000000-0000-4000-8000-000000007102'::uuid,
    '00000000-0000-4000-8000-000000007103'::uuid,
    '00000000-0000-4000-8000-000000007104'::uuid,
    '00000000-0000-4000-8000-000000007105'::uuid,
    '00000000-0000-4000-8000-000000007106'::uuid,
    '00000000-0000-4000-8000-000000007107'::uuid,
    '00000000-0000-4000-8000-000000007108'::uuid,
    '00000000-0000-4000-8000-000000007109'::uuid,
    '00000000-0000-4000-8000-000000007110'::uuid,
    '00000000-0000-4000-8000-000000007111'::uuid,
    '00000000-0000-4000-8000-000000007112'::uuid
  ];
  v_fixture_teams constant uuid[] := array[
    '00000000-0000-4000-8000-000000007201'::uuid,
    '00000000-0000-4000-8000-000000007202'::uuid
  ];
begin
  if exists (select 1 from auth.users where id = any (v_fixture_users))
    or exists (select 1 from public.profiles where id = any (v_fixture_users))
    or exists (
      select 1
      from public.memberships
      where team_id = any (v_fixture_teams)
         or user_id = any (v_fixture_users)
    )
    or exists (
      select 1
      from public.team_player_profiles
      where team_id = any (v_fixture_teams)
         or user_id = any (v_fixture_users)
    )
    or exists (select 1 from public.teams where id = any (v_fixture_teams))
    or exists (
      select 1
      from private.audit_events
      where team_id = any (v_fixture_teams)
         or actor_user_id = any (v_fixture_users)
    )
    or exists (
      select 1
      from storage.objects
      where bucket_id = 'player-avatars'
        and (storage.foldername(name))[1] = any (
          select fixture_id::text from pg_catalog.unnest(v_fixture_users) as fixture_id
        )
    ) then
    raise exception 'squad live verification: rollback left fixture residue';
  end if;
end;
$cleanup_verification$;

select 'squad_live_verification_ok_rollback_zero_fixtures' as result;
