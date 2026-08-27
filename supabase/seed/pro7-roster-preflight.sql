-- Read-only preflight for Supabase project pficsujapinkmqsyvcfw.
with roster(username, display_name, role_slug, target_email, legacy_email) as (
  values
    ('hunglt', 'Lê Thành Hưng', 'admin', 'hunglt@pro7.test', null),
    ('quyenbh', 'Bùi Hữu Quyền', 'member', 'quyenbh@pro7.test', null),
    ('buikien', 'Bùi Kiên', 'member', 'buikien@pro7.test', null),
    ('danhtuan', 'Danh Tuấn', 'member', 'danhtuan@pro7.test', null),
    ('datlt', 'Lê Tuấn Đạt', 'admin', 'datlt@pro7.test', 'tuan.dat.pro7@example.com'),
    ('duclee', 'Lê Anh Đức', 'admin', 'duclee@pro7.test', 'duc.lee.pro7@example.com'),
    ('ducmanh', 'Đức Mạnh', 'member', 'ducmanh@pro7.test', null),
    ('giakhai', 'Gia Khải', 'member', 'giakhai@pro7.test', null),
    ('nguyenhung', 'Nguyễn Hùng', 'member', 'nguyenhung@pro7.test', null),
    ('lehuy', 'Huy Lê', 'member', 'lehuy@pro7.test', null),
    ('tunglk', 'Tùng Lê', 'member', 'tunglk@pro7.test', null),
    ('kimson', 'Kim Sơn', 'member', 'kimson@pro7.test', null),
    ('hieult', 'Lê Trung Hiếu', 'member', 'hieult@pro7.test', 'trung.hieu.pro7@example.com'),
    ('vietld', 'Lương Đức Việt', 'member', 'vietld@pro7.test', null),
    ('luuminh', 'Minh Lưu', 'member', 'luuminh@pro7.test', null),
    ('minhphong', 'Minh Phong', 'member', 'minhphong@pro7.test', null),
    ('hieunc', 'Nguyễn Công Hiếu', 'member', 'hieunc@pro7.test', null),
    ('toannh', 'Nguyễn Hữu Toàn', 'member', 'toannh@pro7.test', null),
    ('quannm', 'Nguyễn Minh Quân', 'member', 'quannm@pro7.test', null),
    ('thanhnp', 'Nguyễn Phú Thành', 'member', 'thanhnp@pro7.test', null),
    ('minhnq', 'Nguyễn Quang Minh', 'member', 'minhnq@pro7.test', null),
    ('anhlt', 'Trần Lê Anh', 'member', 'anhlt@pro7.test', null),
    ('vulong', 'Long Vũ', 'member', 'vulong@pro7.test', null)
),
team_target as (
  select id, owner_user_id from public.teams where slug = 'pro7-fc'
),
role_target as (
  select role.id, role.slug
  from public.roles as role
  join team_target as team on team.id = role.team_id
  where role.is_system and role.slug in ('owner', 'admin', 'member')
),
identity_matches as (
  select
    roster.username,
    roster.target_email,
    roster.legacy_email,
    count(auth_user.id) as identity_count,
    count(auth_user.id) filter (where lower(auth_user.email) = roster.target_email) as target_count,
    count(auth_user.id) filter (where lower(auth_user.email) = roster.legacy_email) as legacy_count,
    min(auth_user.id::text)::uuid as user_id
  from roster
  left join auth.users as auth_user
    on lower(auth_user.email) = roster.target_email
    or lower(auth_user.email) = roster.legacy_email
  group by roster.username, roster.target_email, roster.legacy_email
),
resolved as (
  select roster.*, identity.user_id, identity.identity_count,
    identity.target_count, identity.legacy_count
  from roster
  join identity_matches as identity using (username)
),
owner_check as (
  select count(*) as owner_count
  from team_target as team
  join auth.users as auth_user on auth_user.id = team.owner_user_id
  join public.memberships as membership
    on membership.team_id = team.id and membership.user_id = auth_user.id
  join role_target as role on role.id = membership.role_id and role.slug = 'owner'
  where lower(auth_user.email) = 'pro7.demo.20260825@gmail.com'
    and membership.status = 'active'
),
phi_check as (
  select count(*) as phi_count
  from auth.users as auth_user
  join team_target as team on true
  join public.memberships as membership
    on membership.team_id = team.id and membership.user_id = auth_user.id
  where lower(auth_user.email) = 'phi.hung.pro7@example.com'
)
select pg_catalog.jsonb_build_object(
  'project_ref', 'pficsujapinkmqsyvcfw',
  'team_count', (select count(*) from team_target),
  'owner_count', (select owner_count from owner_check),
  'system_role_count', (select count(*) from role_target),
  'roster_count', (select count(*) from roster),
  'admin_count', (select count(*) from roster where role_slug = 'admin'),
  'member_count', (select count(*) from roster where role_slug = 'member'),
  'resolved_identity_count', (select count(*) from resolved where identity_count = 1),
  'unresolved_identity_count', (select count(*) from resolved where identity_count = 0),
  'collision_count', (select count(*) from resolved where identity_count > 1),
  'profile_gap_count', (
    select count(*) from resolved
    where user_id is not null
      and not exists (select 1 from public.profiles where id = resolved.user_id)
  ),
  'membership_gap_count', (
    select count(*) from resolved
    join team_target as team on true
    where resolved.user_id is not null
      and not exists (
        select 1 from public.memberships
        where team_id = team.id and user_id = resolved.user_id
      )
  ),
  'phi_membership_count', (select phi_count from phi_check),
  'ready_before_auth', (
    (select count(*) from team_target) = 1
    and (select owner_count from owner_check) = 1
    and (select count(*) from role_target) = 3
    and (select count(*) from roster) = 23
    and (select count(*) from resolved where identity_count > 1) = 0
    and (
      select count(*) from resolved
      where legacy_email is not null
        and legacy_count = 1
        and target_count = 0
        and identity_count = 1
    ) = 3
    and (
      select count(*) from resolved
      where legacy_email is null and identity_count = 0
    ) = 20
    and (select phi_count from phi_check) = 1
  ),
  'ready_after_auth', (
    (select count(*) from resolved where target_count = 1 and identity_count = 1) = 23
    and (select count(*) from resolved where legacy_count <> 0) = 0
  )
) as pro7_roster_preflight;
