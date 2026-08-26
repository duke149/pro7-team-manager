begin;

-- Existing Auth users already own a global profile. Team attachment must not
-- replace that identity or clear an outstanding first-login password change.
create or replace function public.attach_team_member(
  p_verified_actor_user_id uuid,
  p_team_id uuid,
  p_user_id uuid,
  p_display_name text,
  p_requires_password_change boolean,
  p_role_id uuid,
  p_shirt_number smallint,
  p_official_position text,
  p_join_date date
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_requested_role public.roles%rowtype;
  v_existing_membership public.memberships%rowtype;
begin
  if p_verified_actor_user_id is null
    or p_team_id is null
    or p_user_id is null
    or p_requires_password_change is null
    or p_role_id is null
    or p_join_date is null then
    raise exception using
      errcode = '22023',
      message = 'Invalid attachment fields';
  end if;

  if not exists (
    select 1
    from public.memberships as m
    join public.profiles as p
      on p.id = m.user_id
     and p.requires_password_change = false
    join public.role_permissions as rp
      on rp.role_id = m.role_id
    where m.team_id = p_team_id
      and m.user_id = p_verified_actor_user_id
      and m.status = 'active'
      and rp.permission_code = any (
        array['players.manage', 'members.manage']::text[]
      )
    group by m.team_id, m.user_id
    having count(distinct rp.permission_code) = 2
  ) then
    raise exception using
      errcode = '42501',
      message = 'Verified actor lacks attachment permission';
  end if;

  if p_display_name is not null
    and (
      p_display_name <> pg_catalog.btrim(p_display_name)
      or pg_catalog.char_length(p_display_name) not between 1 and 100
    ) then
    raise exception using
      errcode = '22023',
      message = 'Invalid attachment fields';
  end if;

  if (p_shirt_number is not null and p_shirt_number not between 1 and 99)
    or (
      p_official_position is not null
      and p_official_position not in ('GK', 'DEF', 'MID', 'ATT')
    )
    or p_join_date > current_date then
    raise exception using
      errcode = '22023',
      message = 'Invalid attachment fields';
  end if;

  select r.*
  into v_requested_role
  from public.roles as r
  where r.id = p_role_id
    and r.team_id = p_team_id;

  if not found
    or (v_requested_role.is_system and v_requested_role.slug = 'owner')
    or exists (
      select 1
      from public.role_permissions as rp
      where rp.role_id = p_role_id
        and rp.permission_code = 'team.delete'
    ) then
    raise exception using
      errcode = '42501',
      message = 'Role cannot be assigned';
  end if;

  select existing.*
  into v_existing_membership
  from public.memberships as existing
  where existing.team_id = p_team_id
    and existing.user_id = p_user_id
  for update;

  if found and v_existing_membership.status = 'active' then
    raise exception using
      errcode = '23505',
      message = 'Active membership already exists';
  elsif found then
    raise exception using
      errcode = '55000',
      message = 'Membership reactivation is not supported';
  end if;

  insert into public.profiles (
    id,
    display_name,
    requires_password_change
  )
  values (
    p_user_id,
    p_display_name,
    p_requires_password_change
  )
  on conflict (id) do update
  set
    display_name = profiles.display_name,
    requires_password_change =
      profiles.requires_password_change
      or excluded.requires_password_change;

  insert into public.memberships (
    team_id,
    user_id,
    role_id,
    status
  )
  values (
    p_team_id,
    p_user_id,
    p_role_id,
    'active'
  );

  insert into public.team_player_profiles (
    team_id,
    user_id,
    shirt_number,
    official_position,
    join_date
  )
  values (
    p_team_id,
    p_user_id,
    p_shirt_number,
    p_official_position,
    p_join_date
  )
  on conflict (team_id, user_id) do update
  set
    shirt_number = excluded.shirt_number,
    official_position = excluded.official_position,
    join_date = excluded.join_date;

  insert into private.audit_events (
    actor_user_id,
    team_id,
    table_name,
    action,
    row_key,
    old_data,
    new_data,
    request_id
  )
  values (
    p_verified_actor_user_id,
    p_team_id,
    'team_player_profiles',
    'INSERT',
    pg_catalog.jsonb_build_object(
      'team_id', p_team_id,
      'user_id', p_user_id
    ),
    null,
    pg_catalog.jsonb_build_object(
      'role_id', p_role_id,
      'membership_status', 'active',
      'shirt_number', p_shirt_number,
      'official_position', p_official_position,
      'player_status', 'available',
      'join_date', p_join_date
    ),
    null
  );
end;
$function$;

alter function public.attach_team_member(
  uuid,
  uuid,
  uuid,
  text,
  boolean,
  uuid,
  smallint,
  text,
  date
) owner to postgres;
revoke execute on function public.attach_team_member(
  uuid,
  uuid,
  uuid,
  text,
  boolean,
  uuid,
  smallint,
  text,
  date
) from public, anon, authenticated, service_role;
grant execute on function public.attach_team_member(
  uuid,
  uuid,
  uuid,
  text,
  boolean,
  uuid,
  smallint,
  text,
  date
) to service_role;

commit;
