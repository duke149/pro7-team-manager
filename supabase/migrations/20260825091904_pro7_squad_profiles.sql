begin;

alter table public.profiles
  add column if not exists phone text
    constraint profiles_phone_check
    check (
      phone is null
      or (
        phone = btrim(phone)
        and char_length(phone) <= 30
      )
    ),
  add column if not exists date_of_birth date
    constraint profiles_date_of_birth_check
    check (date_of_birth is null or date_of_birth <= current_date),
  add column if not exists height_cm smallint
    constraint profiles_height_cm_check
    check (height_cm is null or height_cm between 100 and 250),
  add column if not exists weight_kg numeric(5,2)
    constraint profiles_weight_kg_check
    check (weight_kg is null or (weight_kg > 30 and weight_kg <= 300)),
  add column if not exists preferred_positions text[] not null default '{}'::text[]
    constraint profiles_preferred_positions_check
    check (
      preferred_positions <@ array['GK', 'DEF', 'MID', 'ATT']::text[]
      and cardinality(preferred_positions) <= 4
      and cardinality(array_positions(preferred_positions, 'GK')) <= 1
      and cardinality(array_positions(preferred_positions, 'DEF')) <= 1
      and cardinality(array_positions(preferred_positions, 'MID')) <= 1
      and cardinality(array_positions(preferred_positions, 'ATT')) <= 1
    ),
  add column if not exists avatar_path text
    constraint profiles_avatar_path_check
    check (
      avatar_path is null
      or (
        avatar_path = btrim(avatar_path)
        and char_length(avatar_path) <= 300
        and avatar_path like id::text || '/%'
      )
    );

create table public.team_player_profiles (
  team_id uuid not null,
  user_id uuid not null,
  shirt_number smallint
    constraint team_player_profiles_shirt_number_check
    check (shirt_number is null or shirt_number between 1 and 99),
  official_position text
    constraint team_player_profiles_official_position_check
    check (
      official_position is null
      or official_position in ('GK', 'DEF', 'MID', 'ATT')
    ),
  player_status text not null default 'available'
    constraint team_player_profiles_player_status_check
    check (player_status in ('available', 'injured', 'unavailable')),
  join_date date not null default current_date
    constraint team_player_profiles_join_date_check
    check (join_date <= current_date),
  admin_notes text
    constraint team_player_profiles_admin_notes_check
    check (
      admin_notes is null
      or (
        admin_notes = btrim(admin_notes)
        and char_length(admin_notes) <= 1000
      )
    ),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint team_player_profiles_pkey primary key (team_id, user_id),
  constraint team_player_profiles_membership_fkey
    foreign key (team_id, user_id)
    references public.memberships (team_id, user_id)
    on delete restrict
);

create unique index team_player_profiles_team_shirt_number_key
  on public.team_player_profiles (team_id, shirt_number)
  where shirt_number is not null;

create index team_player_profiles_team_status_position_idx
  on public.team_player_profiles (team_id, player_status, official_position);

create index team_player_profiles_user_id_team_id_idx
  on public.team_player_profiles (user_id, team_id);

insert into public.team_player_profiles (team_id, user_id, join_date)
select
  m.team_id,
  m.user_id,
  least(m.joined_at::date, current_date)
from public.memberships as m
where m.status = 'active'
on conflict (team_id, user_id) do nothing;

create or replace function private.ensure_team_player_profile()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  insert into public.team_player_profiles (team_id, user_id, join_date)
  values (
    new.team_id,
    new.user_id,
    least(new.joined_at::date, current_date)
  )
  on conflict (team_id, user_id) do nothing;

  return new;
end;
$function$;

alter function private.ensure_team_player_profile() owner to postgres;
revoke execute on function private.ensure_team_player_profile()
from public, anon, authenticated, service_role;

drop trigger if exists trg_memberships_ensure_team_player_profile
  on public.memberships;
create trigger trg_memberships_ensure_team_player_profile
after insert or update of status on public.memberships
for each row
when (new.status = 'active')
execute function private.ensure_team_player_profile();

drop trigger if exists trg_team_player_profiles_set_updated_at
  on public.team_player_profiles;
create trigger trg_team_player_profiles_set_updated_at
before update on public.team_player_profiles
for each row execute function private.set_updated_at();

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'player-avatars',
  'player-avatars',
  false,
  3145728,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update
set
  name = excluded.name,
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists player_avatars_select_own on storage.objects;
create policy player_avatars_select_own
on storage.objects
for select
to authenticated
using (
  bucket_id = 'player-avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists player_avatars_insert_own on storage.objects;
create policy player_avatars_insert_own
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'player-avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists player_avatars_update_own on storage.objects;
create policy player_avatars_update_own
on storage.objects
for update
to authenticated
using (
  bucket_id = 'player-avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'player-avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists player_avatars_delete_own on storage.objects;
create policy player_avatars_delete_own
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'player-avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create or replace function private.can_view_profile(p_profile_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select
    coalesce((select auth.uid()) = p_profile_user_id, false)
    or (
      private.is_trusted_product_user()
      and exists (
        select 1
        from public.memberships as viewer
        join public.memberships as subject
          on subject.team_id = viewer.team_id
         and subject.user_id = p_profile_user_id
        join public.role_permissions as rp
          on rp.role_id = viewer.role_id
         and rp.permission_code = 'players.read'
        where viewer.user_id = (select auth.uid())
          and viewer.status = 'active'
      )
    );
$function$;

alter function private.can_view_profile(uuid) owner to postgres;
revoke execute on function private.can_view_profile(uuid)
from public, anon, authenticated, service_role;
grant execute on function private.can_view_profile(uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.team_player_profiles enable row level security;

drop policy if exists profiles_select_visible on public.profiles;
create policy profiles_select_visible
on public.profiles
for select
to authenticated
using (private.can_view_profile(id));

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own
on public.profiles
for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

drop policy if exists team_player_profiles_select_authorized
  on public.team_player_profiles;
create policy team_player_profiles_select_authorized
on public.team_player_profiles
for select
to authenticated
using (private.has_team_permission(team_id, 'players.read'));

drop policy if exists memberships_update_authorized on public.memberships;
drop policy if exists memberships_delete_authorized on public.memberships;

revoke all privileges on table public.profiles
from public, anon, authenticated;
revoke update (avatar_url) on table public.profiles from authenticated;
revoke update (display_name) on table public.profiles from authenticated;
grant select (
  id,
  display_name,
  avatar_url,
  phone,
  date_of_birth,
  height_cm,
  weight_kg,
  preferred_positions,
  avatar_path,
  requires_password_change,
  created_at,
  updated_at
) on table public.profiles to authenticated;
grant update (
  display_name,
  phone,
  date_of_birth,
  height_cm,
  weight_kg,
  preferred_positions,
  avatar_path
) on table public.profiles to authenticated;

revoke all privileges on table public.team_player_profiles
from public, anon, authenticated, service_role;
grant select (
  team_id,
  user_id,
  shirt_number,
  official_position,
  player_status,
  join_date,
  created_at,
  updated_at
) on table public.team_player_profiles to authenticated;
grant select, insert, update, delete
on table public.team_player_profiles
to service_role;

revoke update (role_id) on table public.memberships from authenticated;
revoke update (status) on table public.memberships from authenticated;
revoke delete on table public.memberships from authenticated;

create or replace function public.manage_team_player(
  p_team_id uuid,
  p_user_id uuid,
  p_role_id uuid,
  p_shirt_number smallint,
  p_official_position text,
  p_player_status text,
  p_join_date date,
  p_admin_notes text,
  p_deactivate boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_user_id uuid := (select auth.uid());
  v_membership public.memberships%rowtype;
  v_player public.team_player_profiles%rowtype;
  v_requested_role public.roles%rowtype;
  v_old_audit jsonb;
  v_new_audit jsonb;
begin
  if v_actor_user_id is null then
    raise exception using
      errcode = '28000',
      message = 'Authentication required';
  end if;

  if not private.has_team_permission(p_team_id, 'players.manage')
    or not private.has_team_permission(p_team_id, 'members.manage') then
    raise exception using
      errcode = '42501',
      message = 'Player management permission required';
  end if;

  if p_team_id is null
    or p_user_id is null
    or p_role_id is null
    or p_player_status is null
    or p_join_date is null
    or p_deactivate is null
    or (p_shirt_number is not null and p_shirt_number not between 1 and 99)
    or (
      p_official_position is not null
      and p_official_position not in ('GK', 'DEF', 'MID', 'ATT')
    )
    or p_player_status not in ('available', 'injured', 'unavailable')
    or p_join_date > current_date
    or (
      p_admin_notes is not null
      and (
        p_admin_notes <> pg_catalog.btrim(p_admin_notes)
        or pg_catalog.char_length(p_admin_notes) > 1000
      )
    ) then
    raise exception using
      errcode = '22023',
      message = 'Invalid player fields';
  end if;

  select m.*
  into v_membership
  from public.memberships as m
  where m.team_id = p_team_id
    and m.user_id = p_user_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Team player not found';
  end if;

  if exists (
    select 1
    from public.teams as t
    where t.id = p_team_id
      and t.owner_user_id = p_user_id
  ) or exists (
    select 1
    from public.roles as target_role
    where target_role.id = v_membership.role_id
      and target_role.team_id = p_team_id
      and target_role.is_system
      and target_role.slug = 'owner'
  ) then
    raise exception using
      errcode = '42501',
      message = 'Owner membership is immutable';
  end if;

  select requested_role.*
  into v_requested_role
  from public.roles as requested_role
  where requested_role.id = p_role_id
    and requested_role.team_id = p_team_id;

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

  select player.*
  into v_player
  from public.team_player_profiles as player
  where player.team_id = p_team_id
    and player.user_id = p_user_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Team player not found';
  end if;

  v_old_audit := pg_catalog.jsonb_build_object(
    'role_id', v_membership.role_id,
    'membership_status', v_membership.status,
    'shirt_number', v_player.shirt_number,
    'official_position', v_player.official_position,
    'player_status', v_player.player_status,
    'join_date', v_player.join_date
  );

  update public.memberships as m
  set
    role_id = p_role_id,
    status = case when p_deactivate then 'inactive' else m.status end
  where m.team_id = p_team_id
    and m.user_id = p_user_id;

  update public.team_player_profiles as player
  set
    shirt_number = p_shirt_number,
    official_position = p_official_position,
    player_status = p_player_status,
    join_date = p_join_date,
    admin_notes = p_admin_notes
  where player.team_id = p_team_id
    and player.user_id = p_user_id;

  v_new_audit := pg_catalog.jsonb_build_object(
    'role_id', p_role_id,
    'membership_status',
      case when p_deactivate then 'inactive' else v_membership.status end,
    'shirt_number', p_shirt_number,
    'official_position', p_official_position,
    'player_status', p_player_status,
    'join_date', p_join_date,
    'deactivated', p_deactivate
  );

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
    v_actor_user_id,
    p_team_id,
    'team_player_profiles',
    'UPDATE',
    pg_catalog.jsonb_build_object(
      'team_id', p_team_id,
      'user_id', p_user_id
    ),
    v_old_audit,
    v_new_audit,
    null
  );
end;
$function$;

alter function public.manage_team_player(
  uuid,
  uuid,
  uuid,
  smallint,
  text,
  text,
  date,
  text,
  boolean
) owner to postgres;
revoke execute on function public.manage_team_player(
  uuid,
  uuid,
  uuid,
  smallint,
  text,
  text,
  date,
  text,
  boolean
) from public, anon, authenticated, service_role;
grant execute on function public.manage_team_player(
  uuid,
  uuid,
  uuid,
  smallint,
  text,
  text,
  date,
  text,
  boolean
) to authenticated;

create or replace function public.get_team_player_admin_detail(
  p_team_id uuid,
  p_user_id uuid
)
returns table (admin_notes text)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_actor_user_id uuid := (select auth.uid());
begin
  if v_actor_user_id is null then
    raise exception using
      errcode = '28000',
      message = 'Authentication required';
  end if;

  if not private.has_team_permission(p_team_id, 'players.manage')
    or not private.has_team_permission(p_team_id, 'members.manage') then
    raise exception using
      errcode = '42501',
      message = 'Player management permission required';
  end if;

  return query
  select player.admin_notes
  from public.team_player_profiles as player
  where player.team_id = p_team_id
    and player.user_id = p_user_id;
end;
$function$;

alter function public.get_team_player_admin_detail(uuid, uuid) owner to postgres;
revoke execute on function public.get_team_player_admin_detail(uuid, uuid)
from public, anon, authenticated, service_role;
grant execute on function public.get_team_player_admin_detail(uuid, uuid)
to authenticated;

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
    display_name = excluded.display_name,
    requires_password_change = excluded.requires_password_change;

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
