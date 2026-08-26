do $pro7_roster_verification$
declare
  v_team constant uuid := '91000000-0000-4000-8000-000000000010';
  v_owner constant uuid := '91000000-0000-4000-8000-000000000001';
  v_duclee constant uuid := '91000000-0000-4000-8000-000000000002';
  v_datlt constant uuid := '91000000-0000-4000-8000-000000000003';
  v_hieult constant uuid := '91000000-0000-4000-8000-000000000004';
  v_phi constant uuid := '91000000-0000-4000-8000-000000000005';
  v_count integer;
begin
  select count(*) into v_count
  from public.memberships
  where team_id = v_team and status = 'active';
  if v_count <> 24 then
    raise exception 'roster live: expected 24 active memberships, got %', v_count;
  end if;

  select count(*) into v_count
  from public.memberships as membership
  join auth.users as auth_user on auth_user.id = membership.user_id
  join public.roles as role on role.id = membership.role_id
  where membership.team_id = v_team
    and membership.status = 'active'
    and lower(auth_user.email) like '%@pro7.test'
    and role.slug = 'admin';
  if v_count <> 3 then
    raise exception 'roster live: expected 3 Admin players, got %', v_count;
  end if;

  select count(*) into v_count
  from public.memberships as membership
  join auth.users as auth_user on auth_user.id = membership.user_id
  join public.roles as role on role.id = membership.role_id
  where membership.team_id = v_team
    and membership.status = 'active'
    and lower(auth_user.email) like '%@pro7.test'
    and role.slug = 'member';
  if v_count <> 20 then
    raise exception 'roster live: expected 20 Member players, got %', v_count;
  end if;

  if (select id from auth.users where lower(email) = 'duclee@pro7.test') <> v_duclee
    or (select id from auth.users where lower(email) = 'datlt@pro7.test') <> v_datlt
    or (select id from auth.users where lower(email) = 'hieult@pro7.test') <> v_hieult then
    raise exception 'roster live: reused Auth UUID changed';
  end if;

  if not exists (
    select 1 from public.profiles
    where id = v_duclee
      and display_name = 'Lê Anh Đức'
      and requires_password_change
      and phone = '0900000000'
      and height_cm = 178
      and preferred_positions = array['MID']::text[]
  ) then
    raise exception 'roster live: reused profile fields were not preserved';
  end if;

  if (select count(*) from public.profiles as profile
      join auth.users as auth_user on auth_user.id = profile.id
      where lower(auth_user.email) like '%@pro7.test'
        and profile.requires_password_change) <> 23 then
    raise exception 'roster live: password-change flags differ';
  end if;

  if not exists (
    select 1 from public.memberships as membership
    join public.roles as role on role.id = membership.role_id
    where membership.team_id = v_team
      and membership.user_id = v_owner
      and membership.status = 'active'
      and role.slug = 'owner'
  ) or (select requires_password_change from public.profiles where id = v_owner) then
    raise exception 'roster live: canonical Owner changed';
  end if;

  if not exists (
    select 1 from public.memberships
    where team_id = v_team and user_id = v_phi and status = 'inactive'
  ) then
    raise exception 'roster live: Phi membership was not retained inactive';
  end if;

  if (select count(*) from public.team_player_profiles as player
      join auth.users as auth_user on auth_user.id = player.user_id
      where player.team_id = v_team and lower(auth_user.email) like '%@pro7.test') <> 23 then
    raise exception 'roster live: player-profile coverage differs';
  end if;

  if exists (
    select 1 from public.team_player_profiles as player
    join auth.users as auth_user on auth_user.id = player.user_id
    where player.team_id = v_team
      and lower(auth_user.email) like '%@pro7.test'
      and auth_user.id not in (v_duclee, v_datlt, v_hieult)
      and (
        player.shirt_number is not null
        or player.official_position is not null
        or player.admin_notes is not null
        or player.player_status <> 'available'
      )
  ) then
    raise exception 'roster live: new player facts were invented';
  end if;

  select count(*) into v_count
  from private.audit_events
  where request_id in ('PRO7-ROSTER-20260826', 'PRO7-ROSTER-20260826-PHI');
  if v_count <> 24 then
    raise exception 'roster live: audit event count is not idempotent, got %', v_count;
  end if;

  if exists (
    select 1 from private.audit_events
    where request_id in ('PRO7-ROSTER-20260826', 'PRO7-ROSTER-20260826-PHI')
      and (coalesce(old_data::text, '') || coalesce(new_data::text, '')) ~* '(password|secret|@123)'
  ) then
    raise exception 'roster live: credential material leaked into audit';
  end if;
end;
$pro7_roster_verification$;

select 'pro7_roster_live_verification_ok' as result;
