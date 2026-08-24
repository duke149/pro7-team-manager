begin;

-- The verified project baseline grants API roles broad default privileges.
-- Close those defaults before any application object can be created.
alter default privileges for role postgres in schema public
  revoke select, insert, update, delete on tables from public, anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke usage, select on sequences from anon, authenticated, service_role;

create schema if not exists private;

revoke all on schema private from public, anon, authenticated, service_role;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text
    constraint profiles_display_name_check
    check (
      display_name is null
      or (
        display_name = btrim(display_name)
        and char_length(display_name) between 1 and 100
      )
    ),
  avatar_url text
    constraint profiles_avatar_url_check
    check (
      avatar_url is null
      or (
        avatar_url = btrim(avatar_url)
        and char_length(avatar_url) between 1 and 2048
      )
    ),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

create table if not exists public.teams (
  id uuid primary key default extensions.gen_random_uuid(),
  name text not null
    constraint teams_name_check
    check (
      name = btrim(name)
      and char_length(name) between 1 and 100
    ),
  slug text not null
    constraint teams_slug_check
    check (
      slug = lower(slug)
      and char_length(slug) between 1 and 63
      and slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    ),
  owner_user_id uuid not null default auth.uid()
    references auth.users (id) on delete restrict,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

create table if not exists public.roles (
  id uuid primary key default extensions.gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  slug text not null
    constraint roles_slug_check
    check (
      slug = lower(slug)
      and char_length(slug) between 1 and 50
      and slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    ),
  name text not null
    constraint roles_name_check
    check (
      name = btrim(name)
      and char_length(name) between 1 and 100
    ),
  description text
    constraint roles_description_check
    check (
      description is null
      or (
        description = btrim(description)
        and char_length(description) between 1 and 1000
      )
    ),
  is_system boolean not null default false,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint roles_team_slug_key unique (team_id, slug),
  constraint roles_id_team_id_key unique (id, team_id)
);

create table if not exists public.permissions (
  code text primary key
    constraint permissions_code_check
    check (code ~ '^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$'),
  description text not null
    constraint permissions_description_check
    check (
      description = btrim(description)
      and char_length(description) between 1 and 500
    )
);

create table if not exists public.role_permissions (
  role_id uuid not null references public.roles (id) on delete cascade,
  permission_code text not null references public.permissions (code) on delete cascade,
  constraint role_permissions_pkey primary key (role_id, permission_code)
);

create table if not exists public.memberships (
  team_id uuid not null references public.teams (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role_id uuid not null,
  joined_at timestamptz not null default pg_catalog.now(),
  constraint memberships_pkey primary key (team_id, user_id),
  constraint memberships_role_team_fkey
    foreign key (role_id, team_id)
    references public.roles (id, team_id)
    on delete restrict
);

create table if not exists public.invitations (
  id uuid primary key default extensions.gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  email text not null
    constraint invitations_email_check
    check (
      email = lower(btrim(email))
      and char_length(email) between 3 and 320
    ),
  role_id uuid not null,
  inviter_user_id uuid references auth.users (id) on delete set null,
  token_hash bytea not null unique
    constraint invitations_token_hash_sha256_check
    check (octet_length(token_hash) = 32),
  status text not null default 'pending'
    constraint invitations_status_check
    check (status in ('pending', 'accepted', 'revoked')),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint invitations_role_team_fkey
    foreign key (role_id, team_id)
    references public.roles (id, team_id)
    on delete restrict,
  constraint invitations_acceptance_check
    check (
      (
        status = 'accepted'
        and accepted_at is not null
      )
      or (
        status in ('pending', 'revoked')
        and accepted_at is null
        and accepted_by_user_id is null
      )
    ),
  constraint invitations_expiry_check
    check (expires_at > created_at)
);

create table if not exists public.team_settings (
  team_id uuid primary key references public.teams (id) on delete cascade,
  settings jsonb not null default '{}'::jsonb
    constraint team_settings_object_size_check
    check (
      jsonb_typeof(settings) = 'object'
      and pg_column_size(settings) <= 65536
    ),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

create table if not exists private.audit_events (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default pg_catalog.clock_timestamp(),
  actor_user_id uuid,
  team_id uuid,
  table_name text not null,
  action text not null
    constraint audit_events_action_check
    check (action in ('INSERT', 'UPDATE', 'DELETE')),
  row_key jsonb not null,
  old_data jsonb,
  new_data jsonb,
  request_id text
);

create unique index if not exists teams_slug_lower_key
  on public.teams (lower(slug));

create index if not exists teams_owner_user_id_idx
  on public.teams (owner_user_id);

create index if not exists roles_team_id_idx
  on public.roles (team_id);

create index if not exists memberships_user_id_team_id_idx
  on public.memberships (user_id, team_id);

create index if not exists memberships_role_id_idx
  on public.memberships (role_id);

create index if not exists role_permissions_permission_code_idx
  on public.role_permissions (permission_code);

create index if not exists invitations_team_status_expires_at_idx
  on public.invitations (team_id, status, expires_at);

create index if not exists invitations_role_id_idx
  on public.invitations (role_id);

create index if not exists invitations_inviter_user_id_idx
  on public.invitations (inviter_user_id)
  where inviter_user_id is not null;

create index if not exists invitations_accepted_by_user_id_idx
  on public.invitations (accepted_by_user_id)
  where accepted_by_user_id is not null;

create unique index if not exists invitations_pending_team_email_key
  on public.invitations (team_id, lower(email))
  where status = 'pending';

insert into public.permissions (code, description)
values
  ('team.read', 'View team details'),
  ('team.update', 'Update team details'),
  ('team.delete', 'Delete the team'),
  ('members.read', 'View team memberships'),
  ('members.invite', 'View and create team invitations through trusted services'),
  ('members.manage', 'Change or remove non-owner memberships'),
  ('roles.read', 'View team roles and role permissions'),
  ('roles.manage', 'Manage custom roles and their permissions'),
  ('settings.read', 'View team settings'),
  ('settings.update', 'Update team settings')
on conflict (code) do update
set description = excluded.description;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$function$;

alter function private.set_updated_at() owner to postgres;
revoke execute on function private.set_updated_at() from public, anon, authenticated, service_role;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_display_name text;
  v_avatar_url text;
begin
  if pg_catalog.jsonb_typeof(new.raw_user_meta_data -> 'display_name') = 'string' then
    v_display_name := pg_catalog.btrim(new.raw_user_meta_data ->> 'display_name');
  end if;

  if v_display_name is null
    or pg_catalog.char_length(v_display_name) not between 1 and 100 then
    v_display_name := null;
  end if;

  if pg_catalog.jsonb_typeof(new.raw_user_meta_data -> 'avatar_url') = 'string' then
    v_avatar_url := pg_catalog.btrim(new.raw_user_meta_data ->> 'avatar_url');
  end if;

  if v_avatar_url is null
    or pg_catalog.char_length(v_avatar_url) not between 1 and 2048 then
    v_avatar_url := null;
  end if;

  insert into public.profiles (id, display_name, avatar_url)
  values (new.id, v_display_name, v_avatar_url)
  on conflict (id) do nothing;

  return new;
end;
$function$;

alter function private.handle_new_user() owner to postgres;
revoke execute on function private.handle_new_user() from public, anon, authenticated, service_role;

create or replace function private.is_team_member(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select
    (select auth.uid()) is not null
    and exists (
      select 1
      from public.memberships as m
      where m.team_id = p_team_id
        and m.user_id = (select auth.uid())
    );
$function$;

alter function private.is_team_member(uuid) owner to postgres;
revoke execute on function private.is_team_member(uuid) from public, anon, authenticated, service_role;

create or replace function private.has_team_permission(
  p_team_id uuid,
  p_permission_code text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select
    (select auth.uid()) is not null
    and exists (
      select 1
      from public.memberships as m
      join public.role_permissions as rp
        on rp.role_id = m.role_id
      where m.team_id = p_team_id
        and m.user_id = (select auth.uid())
        and rp.permission_code = p_permission_code
    );
$function$;

alter function private.has_team_permission(uuid, text) owner to postgres;
revoke execute on function private.has_team_permission(uuid, text) from public, anon, authenticated, service_role;
grant execute on function private.has_team_permission(uuid, text) to authenticated;

create or replace function private.can_view_profile(p_profile_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select
    coalesce((select auth.uid()) = p_profile_user_id, false)
    or exists (
      select 1
      from public.memberships as viewer
      join public.memberships as subject
        on subject.team_id = viewer.team_id
       and subject.user_id = p_profile_user_id
      join public.role_permissions as rp
        on rp.role_id = viewer.role_id
       and rp.permission_code = 'members.read'
      where viewer.user_id = (select auth.uid())
    );
$function$;

alter function private.can_view_profile(uuid) owner to postgres;
revoke execute on function private.can_view_profile(uuid) from public, anon, authenticated, service_role;
grant execute on function private.can_view_profile(uuid) to authenticated;

create or replace function private.can_manage_membership(
  p_team_id uuid,
  p_target_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select
    (select auth.uid()) is not null
    and exists (
      select 1
      from public.teams as t
      where t.id = p_team_id
        and t.owner_user_id <> p_target_user_id
        and private.has_team_permission(p_team_id, 'members.manage')
    );
$function$;

alter function private.can_manage_membership(uuid, uuid) owner to postgres;
revoke execute on function private.can_manage_membership(uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function private.can_manage_membership(uuid, uuid) to authenticated;

create or replace function private.role_belongs_to_team(
  p_role_id uuid,
  p_team_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select
    (select auth.uid()) is not null
    and exists (
      select 1
      from public.roles as r
      where r.id = p_role_id
        and r.team_id = p_team_id
        and not (r.is_system and r.slug = 'owner')
    );
$function$;

alter function private.role_belongs_to_team(uuid, uuid) owner to postgres;
revoke execute on function private.role_belongs_to_team(uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function private.role_belongs_to_team(uuid, uuid) to authenticated;

create or replace function private.can_view_role(p_role_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select
    (select auth.uid()) is not null
    and exists (
      select 1
      from public.roles as r
      where r.id = p_role_id
        and private.has_team_permission(r.team_id, 'roles.read')
    );
$function$;

alter function private.can_view_role(uuid) owner to postgres;
revoke execute on function private.can_view_role(uuid) from public, anon, authenticated, service_role;
grant execute on function private.can_view_role(uuid) to authenticated;

create or replace function private.can_manage_role(p_role_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select
    (select auth.uid()) is not null
    and exists (
      select 1
      from public.roles as r
      where r.id = p_role_id
        and not r.is_system
        and private.has_team_permission(r.team_id, 'roles.manage')
    );
$function$;

alter function private.can_manage_role(uuid) owner to postgres;
revoke execute on function private.can_manage_role(uuid) from public, anon, authenticated, service_role;
grant execute on function private.can_manage_role(uuid) to authenticated;

create or replace function private.bootstrap_team()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_owner_role_id uuid := extensions.gen_random_uuid();
  v_admin_role_id uuid := extensions.gen_random_uuid();
  v_member_role_id uuid := extensions.gen_random_uuid();
begin
  insert into public.roles (
    id,
    team_id,
    slug,
    name,
    description,
    is_system
  )
  values
    (v_owner_role_id, new.id, 'owner', 'owner', 'full team ownership', true),
    (v_admin_role_id, new.id, 'admin', 'admin', 'team administration', true),
    (v_member_role_id, new.id, 'member', 'member', 'standard team membership', true);

  insert into public.role_permissions (role_id, permission_code)
  select v_owner_role_id, p.code
  from public.permissions as p;

  insert into public.role_permissions (role_id, permission_code)
  select v_admin_role_id, p.code
  from public.permissions as p
  where p.code <> 'team.delete';

  insert into public.role_permissions (role_id, permission_code)
  select v_member_role_id, p.code
  from public.permissions as p
  where p.code = any (
    array[
      'team.read',
      'members.read',
      'roles.read',
      'settings.read'
    ]::text[]
  );

  insert into public.memberships (team_id, user_id, role_id)
  values (new.id, new.owner_user_id, v_owner_role_id);

  insert into public.team_settings (team_id)
  values (new.id);

  return new;
end;
$function$;

alter function private.bootstrap_team() owner to postgres;
revoke execute on function private.bootstrap_team() from public, anon, authenticated, service_role;

create or replace function private.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  old_data jsonb;
  new_data jsonb;
  v_row jsonb;
  v_team_id uuid;
  v_row_key jsonb;
  v_actor_user_id uuid := (select auth.uid());
  v_request_id text;
begin
  if tg_op = 'INSERT' then
    old_data := null;
    new_data := pg_catalog.to_jsonb(new);
  elsif tg_op = 'UPDATE' then
    old_data := pg_catalog.to_jsonb(old);
    new_data := pg_catalog.to_jsonb(new);
  else
    old_data := pg_catalog.to_jsonb(old);
    new_data := null;
  end if;

  if tg_table_name = 'invitations' then
    old_data := old_data - 'token_hash';
    new_data := new_data - 'token_hash';
  end if;

  v_row := coalesce(new_data, old_data);

  case tg_table_name
    when 'teams' then
      v_team_id := (v_row ->> 'id')::uuid;
      v_row_key := pg_catalog.jsonb_build_object('id', v_row ->> 'id');
    when 'memberships' then
      v_team_id := (v_row ->> 'team_id')::uuid;
      v_row_key := pg_catalog.jsonb_build_object(
        'team_id', v_row ->> 'team_id',
        'user_id', v_row ->> 'user_id'
      );
    when 'roles' then
      v_team_id := (v_row ->> 'team_id')::uuid;
      v_row_key := pg_catalog.jsonb_build_object('id', v_row ->> 'id');
    when 'role_permissions' then
      select r.team_id
      into v_team_id
      from public.roles as r
      where r.id = (v_row ->> 'role_id')::uuid;

      v_row_key := pg_catalog.jsonb_build_object(
        'role_id', v_row ->> 'role_id',
        'permission_code', v_row ->> 'permission_code'
      );
    when 'invitations' then
      v_team_id := (v_row ->> 'team_id')::uuid;
      v_row_key := pg_catalog.jsonb_build_object('id', v_row ->> 'id');
    when 'team_settings' then
      v_team_id := (v_row ->> 'team_id')::uuid;
      v_row_key := pg_catalog.jsonb_build_object('team_id', v_row ->> 'team_id');
    else
      raise exception using
        errcode = 'P0001',
        message = 'Unsupported audit table';
  end case;

  begin
    v_request_id := nullif(
      pg_catalog.current_setting('request.headers', true)::jsonb ->> 'x-request-id',
      ''
    );
  exception
    when others then
      v_request_id := null;
  end;

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
    v_team_id,
    tg_table_name,
    tg_op,
    v_row_key,
    old_data,
    new_data,
    v_request_id
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$function$;

alter function private.audit_row_change() owner to postgres;
revoke execute on function private.audit_row_change() from public, anon, authenticated, service_role;

create or replace function public.accept_team_invitation(token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_failure_message constant text := 'Invitation is invalid or unavailable';
  v_user_id uuid;
  v_confirmed_email text;
  v_invitation public.invitations%rowtype;
  v_affected_rows integer;
begin
  v_user_id := (select auth.uid());

  if v_user_id is null then
    raise exception using
      errcode = '28000',
      message = 'Authentication required';
  end if;

  select i.*
  into v_invitation
  from public.invitations as i
  where i.token_hash = extensions.digest(token, 'sha256')
    and i.status = 'pending'
    and i.expires_at > pg_catalog.now()
    and exists (
      select 1
      from public.roles as invitation_role
      where invitation_role.id = i.role_id
        and invitation_role.team_id = i.team_id
        and not (
          invitation_role.is_system
          and invitation_role.slug = 'owner'
        )
    )
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = v_failure_message;
  end if;

  select lower(btrim(u.email))
  into v_confirmed_email
  from auth.users as u
  where u.id = v_user_id
    and u.email_confirmed_at is not null
    and u.email is not null;

  if not found
    or v_confirmed_email is null
    or v_confirmed_email <> v_invitation.email then
    raise exception using
      errcode = 'P0001',
      message = v_failure_message;
  end if;

  insert into public.memberships (team_id, user_id, role_id)
  values (v_invitation.team_id, v_user_id, v_invitation.role_id)
  on conflict (team_id, user_id) do nothing;

  get diagnostics v_affected_rows = row_count;
  if v_affected_rows <> 1 then
    raise exception using
      errcode = 'P0001',
      message = v_failure_message;
  end if;

  update public.invitations
  set
    status = 'accepted',
    accepted_at = pg_catalog.now(),
    accepted_by_user_id = v_user_id
  where id = v_invitation.id
    and status = 'pending';

  get diagnostics v_affected_rows = row_count;
  if v_affected_rows <> 1 then
    raise exception using
      errcode = 'P0001',
      message = v_failure_message;
  end if;

  return v_invitation.team_id;
exception
  when unique_violation or foreign_key_violation or check_violation then
    raise exception using
      errcode = 'P0001',
      message = v_failure_message;
end;
$function$;

alter function public.accept_team_invitation(text) owner to postgres;
revoke execute on function public.accept_team_invitation(text) from public, anon, authenticated, service_role;
grant execute on function public.accept_team_invitation(text) to authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_user();

drop trigger if exists trg_teams_bootstrap on public.teams;
create trigger trg_teams_bootstrap
after insert on public.teams
for each row execute function private.bootstrap_team();

drop trigger if exists trg_profiles_set_updated_at on public.profiles;
create trigger trg_profiles_set_updated_at
before update on public.profiles
for each row execute function private.set_updated_at();

drop trigger if exists trg_teams_set_updated_at on public.teams;
create trigger trg_teams_set_updated_at
before update on public.teams
for each row execute function private.set_updated_at();

drop trigger if exists trg_roles_set_updated_at on public.roles;
create trigger trg_roles_set_updated_at
before update on public.roles
for each row execute function private.set_updated_at();

drop trigger if exists trg_invitations_set_updated_at on public.invitations;
create trigger trg_invitations_set_updated_at
before update on public.invitations
for each row execute function private.set_updated_at();

drop trigger if exists trg_team_settings_set_updated_at on public.team_settings;
create trigger trg_team_settings_set_updated_at
before update on public.team_settings
for each row execute function private.set_updated_at();

drop trigger if exists trg_teams_audit on public.teams;
create trigger trg_teams_audit
after insert or update or delete on public.teams
for each row execute function private.audit_row_change();

drop trigger if exists trg_memberships_audit on public.memberships;
create trigger trg_memberships_audit
after insert or update or delete on public.memberships
for each row execute function private.audit_row_change();

drop trigger if exists trg_roles_audit on public.roles;
create trigger trg_roles_audit
after insert or update or delete on public.roles
for each row execute function private.audit_row_change();

drop trigger if exists trg_role_permissions_audit on public.role_permissions;
create trigger trg_role_permissions_audit
after insert or update or delete on public.role_permissions
for each row execute function private.audit_row_change();

drop trigger if exists trg_invitations_audit on public.invitations;
create trigger trg_invitations_audit
after insert or update or delete on public.invitations
for each row execute function private.audit_row_change();

drop trigger if exists trg_team_settings_audit on public.team_settings;
create trigger trg_team_settings_audit
after insert or update or delete on public.team_settings
for each row execute function private.audit_row_change();

alter table public.profiles enable row level security;
alter table public.teams enable row level security;
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.memberships enable row level security;
alter table public.invitations enable row level security;
alter table public.team_settings enable row level security;

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

drop policy if exists teams_select_authorized on public.teams;
create policy teams_select_authorized
on public.teams
for select
to authenticated
using (private.has_team_permission(id, 'team.read'));

drop policy if exists teams_insert_own on public.teams;
create policy teams_insert_own
on public.teams
for insert
to authenticated
with check ((select auth.uid()) = owner_user_id);

drop policy if exists teams_update_authorized on public.teams;
create policy teams_update_authorized
on public.teams
for update
to authenticated
using (private.has_team_permission(id, 'team.update'))
with check (private.has_team_permission(id, 'team.update'));

drop policy if exists teams_delete_authorized on public.teams;
create policy teams_delete_authorized
on public.teams
for delete
to authenticated
using (private.has_team_permission(id, 'team.delete'));

drop policy if exists memberships_select_authorized on public.memberships;
create policy memberships_select_authorized
on public.memberships
for select
to authenticated
using (
  user_id = (select auth.uid())
  or private.has_team_permission(team_id, 'members.read')
);

drop policy if exists memberships_update_authorized on public.memberships;
create policy memberships_update_authorized
on public.memberships
for update
to authenticated
using (private.can_manage_membership(team_id, user_id))
with check (
  private.can_manage_membership(team_id, user_id)
  and private.role_belongs_to_team(role_id, team_id)
);

drop policy if exists memberships_delete_authorized on public.memberships;
create policy memberships_delete_authorized
on public.memberships
for delete
to authenticated
using (private.can_manage_membership(team_id, user_id));

drop policy if exists roles_select_authorized on public.roles;
create policy roles_select_authorized
on public.roles
for select
to authenticated
using (private.can_view_role(id));

drop policy if exists roles_insert_custom on public.roles;
create policy roles_insert_custom
on public.roles
for insert
to authenticated
with check (
  not is_system
  and private.has_team_permission(team_id, 'roles.manage')
);

drop policy if exists roles_update_custom on public.roles;
create policy roles_update_custom
on public.roles
for update
to authenticated
using (
  not is_system
  and private.has_team_permission(team_id, 'roles.manage')
)
with check (
  not is_system
  and private.has_team_permission(team_id, 'roles.manage')
);

drop policy if exists roles_delete_custom on public.roles;
create policy roles_delete_custom
on public.roles
for delete
to authenticated
using (
  not is_system
  and private.has_team_permission(team_id, 'roles.manage')
);

drop policy if exists permissions_select_authenticated on public.permissions;
create policy permissions_select_authenticated
on public.permissions
for select
to authenticated
using (true);

drop policy if exists role_permissions_select_authorized on public.role_permissions;
create policy role_permissions_select_authorized
on public.role_permissions
for select
to authenticated
using (private.can_view_role(role_id));

drop policy if exists role_permissions_insert_authorized on public.role_permissions;
create policy role_permissions_insert_authorized
on public.role_permissions
for insert
to authenticated
with check (
  private.can_manage_role(role_id)
  and permission_code <> 'team.delete'
);

drop policy if exists role_permissions_delete_authorized on public.role_permissions;
create policy role_permissions_delete_authorized
on public.role_permissions
for delete
to authenticated
using (private.can_manage_role(role_id));

drop policy if exists invitations_select_authorized on public.invitations;
create policy invitations_select_authorized
on public.invitations
for select
to authenticated
using (private.has_team_permission(team_id, 'members.invite'));

drop policy if exists team_settings_select_authorized on public.team_settings;
create policy team_settings_select_authorized
on public.team_settings
for select
to authenticated
using (private.has_team_permission(team_id, 'settings.read'));

drop policy if exists team_settings_update_authorized on public.team_settings;
create policy team_settings_update_authorized
on public.team_settings
for update
to authenticated
using (private.has_team_permission(team_id, 'settings.update'))
with check (private.has_team_permission(team_id, 'settings.update'));

revoke all privileges on table
  public.profiles,
  public.teams,
  public.roles,
  public.permissions,
  public.role_permissions,
  public.memberships,
  public.invitations,
  public.team_settings
from public, anon, authenticated, service_role;

revoke all privileges on table private.audit_events
from public, anon, authenticated, service_role;

revoke all privileges on sequence private.audit_events_id_seq
from public, anon, authenticated, service_role;

grant select on table public.profiles to authenticated;
grant update (display_name, avatar_url) on table public.profiles to authenticated;

grant select, delete on table public.teams to authenticated;
grant insert (name, slug) on table public.teams to authenticated;
grant update (name, slug) on table public.teams to authenticated;

grant select, delete on table public.memberships to authenticated;
grant update (role_id) on table public.memberships to authenticated;

grant select, delete on table public.roles to authenticated;
grant insert (team_id, slug, name, description) on table public.roles to authenticated;
grant update (name, description) on table public.roles to authenticated;

grant select on table public.permissions to authenticated;
grant select, insert, delete on table public.role_permissions to authenticated;

grant select (
  id,
  team_id,
  email,
  role_id,
  inviter_user_id,
  status,
  expires_at,
  accepted_at,
  accepted_by_user_id,
  created_at,
  updated_at
) on table public.invitations to authenticated;

grant select on table public.team_settings to authenticated;
grant update (settings) on table public.team_settings to authenticated;

grant select, insert, update, delete on table
  public.profiles,
  public.teams,
  public.roles,
  public.permissions,
  public.role_permissions,
  public.memberships,
  public.invitations,
  public.team_settings
to service_role;

commit;
