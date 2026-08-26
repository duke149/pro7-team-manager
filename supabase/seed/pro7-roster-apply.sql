begin;

select pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('PRO7-ROSTER-20260826', 0)
);

do $pro7_roster_apply$
declare
  v_roster constant jsonb := '[
    {"username":"hunglt","display_name":"Lê Thành Hưng","role_slug":"admin"},
    {"username":"quyenbh","display_name":"Bùi Hữu Quyền","role_slug":"member"},
    {"username":"buikien","display_name":"Bùi Kiên","role_slug":"member"},
    {"username":"danhtuan","display_name":"Danh Tuấn","role_slug":"member"},
    {"username":"datlt","display_name":"Lê Tuấn Đạt","role_slug":"admin"},
    {"username":"duclee","display_name":"Lê Anh Đức","role_slug":"admin"},
    {"username":"ducmanh","display_name":"Đức Mạnh","role_slug":"member"},
    {"username":"giakhai","display_name":"Gia Khải","role_slug":"member"},
    {"username":"nguyenhung","display_name":"Nguyễn Hùng","role_slug":"member"},
    {"username":"lehuy","display_name":"Huy Lê","role_slug":"member"},
    {"username":"tunglk","display_name":"Tùng Lê","role_slug":"member"},
    {"username":"kimson","display_name":"Kim Sơn","role_slug":"member"},
    {"username":"hieult","display_name":"Lê Trung Hiếu","role_slug":"member"},
    {"username":"vietld","display_name":"Lương Đức Việt","role_slug":"member"},
    {"username":"luuminh","display_name":"Minh Lưu","role_slug":"member"},
    {"username":"minhphong","display_name":"Minh Phong","role_slug":"member"},
    {"username":"hieunc","display_name":"Nguyễn Công Hiếu","role_slug":"member"},
    {"username":"toannh","display_name":"Nguyễn Hữu Toàn","role_slug":"member"},
    {"username":"quannm","display_name":"Nguyễn Minh Quân","role_slug":"member"},
    {"username":"thanhnp","display_name":"Nguyễn Phú Thành","role_slug":"member"},
    {"username":"minhnq","display_name":"Nguyễn Quang Minh","role_slug":"member"},
    {"username":"anhlt","display_name":"Trần Lê Anh","role_slug":"member"},
    {"username":"vulong","display_name":"Long Vũ","role_slug":"member"}
  ]'::jsonb;
  v_team_id uuid;
  v_owner_user_id uuid;
  v_phi_user_id uuid;
  v_admin_role_id uuid;
  v_member_role_id uuid;
  v_owner_role_id uuid;
  v_count integer;
begin
  if pg_catalog.jsonb_array_length(v_roster) <> 23 then
    raise exception 'PRO7 roster cardinality must be 23';
  end if;

  select team.id, team.owner_user_id
    into strict v_team_id, v_owner_user_id
  from public.teams as team
  where team.slug = 'pro7-fc'
  for update;

  if not exists (
    select 1 from auth.users
    where id = v_owner_user_id
      and lower(email) = 'pro7.demo.20260825@gmail.com'
  ) then
    raise exception 'Canonical Owner identity differs';
  end if;

  select role.id into strict v_owner_role_id
  from public.roles as role
  where role.team_id = v_team_id and role.slug = 'owner' and role.is_system;
  select role.id into strict v_admin_role_id
  from public.roles as role
  where role.team_id = v_team_id and role.slug = 'admin' and role.is_system;
  select role.id into strict v_member_role_id
  from public.roles as role
  where role.team_id = v_team_id and role.slug = 'member' and role.is_system;

  if not exists (
    select 1 from public.memberships
    where team_id = v_team_id
      and user_id = v_owner_user_id
      and role_id = v_owner_role_id
      and status = 'active'
  ) then
    raise exception 'Canonical Owner membership differs';
  end if;

  perform 1
  from auth.users as auth_user
  join pg_catalog.jsonb_to_recordset(v_roster)
    as roster(username text, display_name text, role_slug text)
    on lower(auth_user.email) = roster.username || '@pro7.test'
  for update of auth_user;

  select count(*) into v_count
  from auth.users as auth_user
  join pg_catalog.jsonb_to_recordset(v_roster)
    as roster(username text, display_name text, role_slug text)
    on lower(auth_user.email) = roster.username || '@pro7.test';
  if v_count <> 23 then
    raise exception 'Exactly 23 internal Auth identities are required';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_to_recordset(v_roster)
      as roster(username text, display_name text, role_slug text)
    group by roster.username
    having count(*) <> 1
  ) then
    raise exception 'Roster usernames must be unique';
  end if;

  select id into strict v_phi_user_id
  from auth.users
  where lower(email) = 'phi.hung.pro7@example.com';

  perform 1 from public.memberships
  where team_id = v_team_id
    and (user_id = v_phi_user_id or user_id = v_owner_user_id)
  for update;

  insert into private.audit_events (
    actor_user_id, team_id, table_name, action, row_key,
    old_data, new_data, request_id
  )
  select
    v_owner_user_id,
    v_team_id,
    'memberships',
    case when membership.user_id is null then 'INSERT' else 'UPDATE' end,
    pg_catalog.jsonb_build_object('team_id', v_team_id, 'user_id', auth_user.id),
    case when membership.user_id is null then null else pg_catalog.jsonb_build_object(
      'role_id', membership.role_id,
      'status', membership.status
    ) end,
    pg_catalog.jsonb_build_object(
      'role_id', case roster.role_slug
        when 'admin' then v_admin_role_id else v_member_role_id end,
      'status', 'active',
      'username', roster.username
    ),
    'PRO7-ROSTER-20260826'
  from pg_catalog.jsonb_to_recordset(v_roster)
    as roster(username text, display_name text, role_slug text)
  join auth.users as auth_user
    on lower(auth_user.email) = roster.username || '@pro7.test'
  left join public.memberships as membership
    on membership.team_id = v_team_id and membership.user_id = auth_user.id
  where not exists (
    select 1 from private.audit_events as audit
    where audit.request_id = 'PRO7-ROSTER-20260826'
      and audit.table_name = 'memberships'
      and audit.row_key = pg_catalog.jsonb_build_object(
        'team_id', v_team_id, 'user_id', auth_user.id
      )
  );

  insert into public.profiles (id, display_name, requires_password_change)
  select auth_user.id, roster.display_name, true
  from pg_catalog.jsonb_to_recordset(v_roster)
    as roster(username text, display_name text, role_slug text)
  join auth.users as auth_user
    on lower(auth_user.email) = roster.username || '@pro7.test'
  on conflict (id) do update
  set display_name = excluded.display_name,
      requires_password_change = true;

  insert into public.memberships (team_id, user_id, role_id, status)
  select
    v_team_id,
    auth_user.id,
    case roster.role_slug
      when 'admin' then v_admin_role_id else v_member_role_id end,
    'active'
  from pg_catalog.jsonb_to_recordset(v_roster)
    as roster(username text, display_name text, role_slug text)
  join auth.users as auth_user
    on lower(auth_user.email) = roster.username || '@pro7.test'
  on conflict (team_id, user_id) do update
  set role_id = excluded.role_id,
      status = 'active';

  insert into public.team_player_profiles (team_id, user_id)
  select v_team_id, auth_user.id
  from pg_catalog.jsonb_to_recordset(v_roster)
    as roster(username text, display_name text, role_slug text)
  join auth.users as auth_user
    on lower(auth_user.email) = roster.username || '@pro7.test'
  on conflict (team_id, user_id) do nothing;

  insert into private.audit_events (
    actor_user_id, team_id, table_name, action, row_key,
    old_data, new_data, request_id
  )
  select
    v_owner_user_id,
    v_team_id,
    'memberships',
    'UPDATE',
    pg_catalog.jsonb_build_object('team_id', v_team_id, 'user_id', v_phi_user_id),
    pg_catalog.jsonb_build_object('status', membership.status),
    pg_catalog.jsonb_build_object('status', 'inactive'),
    'PRO7-ROSTER-20260826-PHI'
  from public.memberships as membership
  where membership.team_id = v_team_id
    and membership.user_id = v_phi_user_id
    and membership.status = 'active'
    and not exists (
      select 1 from private.audit_events as audit
      where audit.request_id = 'PRO7-ROSTER-20260826-PHI'
        and audit.table_name = 'memberships'
        and audit.row_key = pg_catalog.jsonb_build_object(
          'team_id', v_team_id, 'user_id', v_phi_user_id
        )
    );

  update public.memberships
  set status = 'inactive'
  where team_id = v_team_id and user_id = v_phi_user_id;

  select count(*) into v_count
  from public.memberships
  where team_id = v_team_id and status = 'active';
  if v_count <> 24 then
    raise exception 'Team must have exactly 24 active memberships including Owner';
  end if;

  select count(*) into v_count
  from public.memberships as membership
  join auth.users as auth_user on auth_user.id = membership.user_id
  where membership.team_id = v_team_id
    and membership.status = 'active'
    and lower(auth_user.email) like '%@pro7.test';
  if v_count <> 23 then
    raise exception 'Roster must have exactly 23 active memberships';
  end if;

  select count(*) into v_count
  from public.memberships as membership
  join auth.users as auth_user on auth_user.id = membership.user_id
  where membership.team_id = v_team_id
    and membership.status = 'active'
    and membership.role_id = v_admin_role_id
    and lower(auth_user.email) like '%@pro7.test';
  if v_count <> 3 then
    raise exception 'Roster must have exactly 3 Admin memberships';
  end if;

  select count(*) into v_count
  from public.memberships as membership
  join auth.users as auth_user on auth_user.id = membership.user_id
  where membership.team_id = v_team_id
    and membership.status = 'active'
    and membership.role_id = v_member_role_id
    and lower(auth_user.email) like '%@pro7.test';
  if v_count <> 20 then
    raise exception 'Roster must have exactly 20 Member memberships';
  end if;

  if not exists (
    select 1 from public.memberships
    where team_id = v_team_id and user_id = v_phi_user_id and status = 'inactive'
  ) then
    raise exception 'Phi Hung membership was not deactivated';
  end if;

  select count(*) into v_count
  from pg_catalog.jsonb_to_recordset(v_roster)
    as roster(username text, display_name text, role_slug text)
  join auth.users as auth_user
    on lower(auth_user.email) = roster.username || '@pro7.test'
  join public.profiles as profile
    on profile.id = auth_user.id
   and profile.display_name = roster.display_name
   and profile.requires_password_change = true
  join public.team_player_profiles as player
    on player.team_id = v_team_id and player.user_id = auth_user.id;
  if v_count <> 23 then
    raise exception 'Roster profile or player rows are incomplete';
  end if;

  if not exists (
    select 1 from public.memberships
    where team_id = v_team_id
      and user_id = v_owner_user_id
      and role_id = v_owner_role_id
      and status = 'active'
  ) then
    raise exception 'Canonical Owner membership changed';
  end if;
end;
$pro7_roster_apply$;

commit;
