alter table public.profiles
  add column if not exists requires_password_change boolean not null default false;

alter table public.teams
  drop constraint if exists teams_slug_check;

alter table public.teams
  add constraint teams_slug_check
  check (
    slug = lower(slug)
    and char_length(slug) between 1 and 48
    and slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    and slug <> all (array['setup', 'account', 'api', 'login', 'auth']::text[])
  );

alter table public.memberships
  add column if not exists status text not null default 'active',
  add column if not exists updated_at timestamptz not null default now();

alter table public.memberships
  add constraint memberships_status_check
  check (status in ('active', 'inactive'));

create index if not exists memberships_team_id_status_idx
  on public.memberships (team_id, status);

drop trigger if exists trg_memberships_set_updated_at on public.memberships;
create trigger trg_memberships_set_updated_at
before update on public.memberships
for each row execute function private.set_updated_at();

insert into public.permissions (code, description) values
  ('players.read', 'View player records'),
  ('players.manage', 'Manage player records'),
  ('matches.read', 'View matches'),
  ('matches.manage', 'Manage matches'),
  ('matches.respond', 'Respond to own match attendance'),
  ('tactics.read', 'View applied tactics'),
  ('tactics.manage', 'Manage tactics'),
  ('news.read', 'View team news'),
  ('news.manage', 'Manage team news'),
  ('finance.read', 'View team finance'),
  ('finance.manage', 'Manage team finance')
on conflict (code) do update set description = excluded.description;

delete from public.role_permissions as rp
using public.roles as r
where rp.role_id = r.id
  and r.is_system
  and r.slug = any (array['owner', 'admin', 'member']::text[]);

insert into public.role_permissions (role_id, permission_code)
select r.id, p.code
from public.roles as r
cross join public.permissions as p
where r.is_system
  and r.slug = any (array['owner', 'admin', 'member']::text[])
  and case r.slug
    when 'owner' then true
    when 'admin' then p.code <> 'team.delete'
    when 'member' then p.code = any (array[
      'team.read', 'members.read', 'roles.read', 'players.read',
      'matches.read', 'matches.respond', 'tactics.read', 'news.read'
    ]::text[])
    else false
  end;

create or replace function private.is_trusted_product_user()
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
      from public.profiles as p
      where p.id = (select auth.uid())
        and p.requires_password_change = false
    );
$function$;

alter function private.is_trusted_product_user() owner to postgres;
revoke execute on function private.is_trusted_product_user() from public, anon, authenticated, service_role;
grant execute on function private.is_trusted_product_user() to authenticated;

create or replace function private.is_team_member(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select
    private.is_trusted_product_user()
    and exists (
      select 1
      from public.memberships as m
      where m.team_id = p_team_id
        and m.user_id = (select auth.uid())
        and m.status = 'active'
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
    private.is_trusted_product_user()
    and exists (
      select 1
      from public.memberships as m
      join public.role_permissions as rp
        on rp.role_id = m.role_id
      where m.team_id = p_team_id
        and m.user_id = (select auth.uid())
        and m.status = 'active'
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
    or (
      private.is_trusted_product_user()
      and exists (
        select 1
        from public.memberships as viewer
        join public.memberships as subject
          on subject.team_id = viewer.team_id
         and subject.user_id = p_profile_user_id
         and subject.status = 'active'
        join public.role_permissions as rp
          on rp.role_id = viewer.role_id
         and rp.permission_code = 'members.read'
        where viewer.user_id = (select auth.uid())
          and viewer.status = 'active'
      )
    );
$function$;

alter function private.can_view_profile(uuid) owner to postgres;
revoke execute on function private.can_view_profile(uuid) from public, anon, authenticated, service_role;
grant execute on function private.can_view_profile(uuid) to authenticated;

drop policy if exists teams_select_authorized on public.teams;
create policy teams_select_authorized
on public.teams
for select
to authenticated
using (
  private.has_team_permission(id, 'team.read')
  or private.has_team_permission(id, 'team.update')
  or private.has_team_permission(id, 'team.delete')
);

drop policy if exists teams_insert_own on public.teams;
revoke insert on table public.teams from authenticated;
revoke insert (name, slug) on table public.teams from authenticated;

drop policy if exists memberships_select_authorized on public.memberships;
create policy memberships_select_authorized
on public.memberships
for select
to authenticated
using (
  (
    user_id = (select auth.uid())
    and private.is_trusted_product_user()
  )
  or private.has_team_permission(team_id, 'members.read')
  or private.has_team_permission(team_id, 'members.manage')
);

drop policy if exists roles_select_authorized on public.roles;
create policy roles_select_authorized
on public.roles
for select
to authenticated
using (
  private.has_team_permission(team_id, 'roles.read')
  or private.has_team_permission(team_id, 'roles.manage')
);

drop policy if exists role_permissions_select_authorized on public.role_permissions;
create policy role_permissions_select_authorized
on public.role_permissions
for select
to authenticated
using (
  private.can_view_role(role_id)
);

create or replace function public.get_current_team_access_contexts()
returns table (
  team_id uuid,
  team_name text,
  team_slug text,
  role_id uuid,
  role_slug text,
  role_name text,
  permission_codes text[]
)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    t.id as team_id,
    t.name as team_name,
    t.slug as team_slug,
    r.id as role_id,
    r.slug as role_slug,
    r.name as role_name,
    coalesce(
      pg_catalog.array_agg(rp.permission_code order by rp.permission_code)
        filter (where rp.permission_code is not null),
      array[]::text[]
    ) as permission_codes
  from public.memberships as m
  join public.teams as t
    on t.id = m.team_id
  join public.roles as r
    on r.id = m.role_id
   and r.team_id = m.team_id
  left join public.role_permissions as rp
    on rp.role_id = r.id
  where private.is_trusted_product_user()
    and m.user_id = (select auth.uid())
    and m.status = 'active'
  group by t.id, t.name, t.slug, r.id, r.slug, r.name
  order by t.name, t.slug, t.id;
$function$;

alter function public.get_current_team_access_contexts() owner to postgres;
revoke execute on function public.get_current_team_access_contexts() from public, anon, authenticated, service_role;
grant execute on function public.get_current_team_access_contexts() to authenticated;

create or replace function public.create_team(p_name text, p_slug text)
returns table (
  id uuid,
  name text,
  slug text
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null or not private.is_trusted_product_user() then
    raise exception using
      errcode = '28000',
      message = 'Trusted product access required';
  end if;

  begin
    return query
    insert into public.teams (name, slug, owner_user_id)
    values (p_name, p_slug, v_user_id)
    returning teams.id, teams.name, teams.slug;
  exception
    when unique_violation then
      return query
      select t.id, t.name, t.slug
      from public.teams as t
      where t.slug = p_slug
        and t.name = p_name
        and t.owner_user_id = v_user_id;

      if not found then
        raise;
      end if;
  end;
end;
$function$;

alter function public.create_team(text, text) owner to postgres;
revoke execute on function public.create_team(text, text) from public, anon, authenticated, service_role;
grant execute on function public.create_team(text, text) to authenticated;

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

  if not private.is_trusted_product_user() then
    raise exception using
      errcode = 'P0001',
      message = v_failure_message;
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
      'players.read',
      'matches.read',
      'matches.respond',
      'tactics.read',
      'news.read'
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
