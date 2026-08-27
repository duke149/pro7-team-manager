-- Populated-project checkpoint for the still-pending RLS and foundation files.
-- Run only after explicit read-only authorization. Inspect every result set and
-- stop before DDL when any conflict/mismatch is present or evidence is missing.

begin transaction read only;

with expected_migrations(version, expected_name, source_sha256, expected_applied) as (
  values
    ('20260824170300', 'supabase_mvp_core', 'b0c13b47538e07c02666672fc9e83b13a49167c0590deed782bb50596e7cf363', true),
    ('20260824183536', 'rls_mutation_visibility', '2c2b1ca30529b1ddc0d0dc66a899384d118ec763ef94f7222ba669b39fbe605b', false),
    ('20260825013307', 'pro7_foundation_permissions', 'a319ee4e03bc94973063bb5568e542a98b9eaa4afae4b26cf38431f416d9ca83', false)
),
migration_history as (
  select
    m.version,
    m.name,
    pg_catalog.md5(
      coalesce(pg_catalog.array_to_string(m.statements, E'\n'), '')
    ) as recorded_statements_md5
  from supabase_migrations.schema_migrations as m
  where m.version = any (
    array['20260824170300', '20260824183536', '20260825013307']::text[]
  )
)
select
  'migration_history'::text as check_name,
  e.version,
  e.expected_name,
  e.source_sha256,
  e.expected_applied,
  (m.version is not null) as is_applied,
  m.name as recorded_name,
  m.recorded_statements_md5,
  (
    (m.version is not null) = e.expected_applied
    and (m.version is null or m.name = e.expected_name)
  ) as matches_expected_state
from expected_migrations as e
left join migration_history as m using (version)
order by e.version;

with team_slug_conflicts as (
  select t.id, t.name, t.slug
  from public.teams as t
  where t.slug <> pg_catalog.lower(t.slug)
    or pg_catalog.char_length(t.slug) not between 1 and 48
    or t.slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    or t.slug = any (array['setup', 'account', 'api', 'login', 'auth']::text[])
)
select
  'team_slug_conflicts'::text as check_name,
  pg_catalog.count(*) as conflict_count,
  coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object('id', id, 'name', name, 'slug', slug)
      order by slug, id
    ),
    '[]'::jsonb
  ) as conflicts
from team_slug_conflicts;

with auth_user_profile_gaps as (
  select 'auth_without_profile'::text as gap, u.id
  from auth.users as u
  left join public.profiles as p on p.id = u.id
  where p.id is null
  union all
  select 'profile_without_auth'::text as gap, p.id
  from public.profiles as p
  left join auth.users as u on u.id = p.id
  where u.id is null
)
select
  'auth_user_profile_gaps'::text as check_name,
  pg_catalog.count(*) as gap_count,
  coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object('gap', gap, 'user_id', id)
      order by gap, id
    ),
    '[]'::jsonb
  ) as gaps
from auth_user_profile_gaps;

with expected_permission_codes(code) as (
  values
    ('team.read'), ('team.update'), ('team.delete'),
    ('members.read'), ('members.invite'), ('members.manage'),
    ('roles.read'), ('roles.manage'),
    ('settings.read'), ('settings.update')
),
permission_catalog as (
  select
    p.code,
    p.description,
    (e.code is not null) as is_expected_pre_apply
  from public.permissions as p
  left join expected_permission_codes as e using (code)
)
select
  'permission_catalog'::text as check_name,
  pg_catalog.count(*) as current_count,
  pg_catalog.count(*) filter (where not is_expected_pre_apply) as unexpected_count,
  coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'code', code,
        'description', description,
        'is_expected_pre_apply', is_expected_pre_apply
      )
      order by code
    ),
    '[]'::jsonb
  ) as current_catalog
from permission_catalog;

with expected_member_permissions(code) as (
  values ('team.read'), ('members.read'), ('roles.read'), ('settings.read')
),
permission_arrays as (
  select
    pg_catalog.array_agg(p.code order by p.code) as owner_codes,
    pg_catalog.array_agg(p.code order by p.code)
      filter (where p.code <> 'team.delete') as admin_codes,
    (
      select pg_catalog.array_agg(e.code order by e.code)
      from expected_member_permissions as e
    ) as member_codes
  from public.permissions as p
),
role_permission_arrays as (
  select
    r.id,
    r.team_id,
    r.slug,
    r.is_system,
    coalesce(
      pg_catalog.array_agg(rp.permission_code order by rp.permission_code)
        filter (where rp.permission_code is not null),
      array[]::text[]
    ) as permission_codes
  from public.roles as r
  left join public.role_permissions as rp on rp.role_id = r.id
  group by r.id, r.team_id, r.slug, r.is_system
),
system_role_invariants as (
  select
    t.id as team_id,
    t.slug as team_slug,
    pg_catalog.count(*) filter (where r.is_system and r.slug = 'owner') as owner_role_count,
    pg_catalog.count(*) filter (where r.is_system and r.slug = 'admin') as admin_role_count,
    pg_catalog.count(*) filter (where r.is_system and r.slug = 'member') as member_role_count,
    pg_catalog.count(*) filter (
      where r.is_system and r.slug not in ('owner', 'admin', 'member')
    ) as unexpected_system_role_count,
    pg_catalog.bool_and(
      case r.slug
        when 'owner' then r.permission_codes = p.owner_codes
        when 'admin' then r.permission_codes = p.admin_codes
        when 'member' then r.permission_codes = p.member_codes
        else true
      end
    ) filter (where r.is_system) as permission_mappings_match,
    pg_catalog.count(m.user_id) filter (
      where r.is_system
        and r.slug = 'owner'
        and m.user_id = t.owner_user_id
    ) as canonical_owner_membership_count
  from public.teams as t
  left join role_permission_arrays as r on r.team_id = t.id
  left join public.memberships as m
    on m.team_id = t.id
   and m.role_id = r.id
  cross join permission_arrays as p
  group by t.id, t.slug
)
select
  'system_role_invariants'::text as check_name,
  pg_catalog.count(*) filter (
    where owner_role_count <> 1
      or admin_role_count <> 1
      or member_role_count <> 1
      or unexpected_system_role_count <> 0
      or permission_mappings_match is distinct from true
      or canonical_owner_membership_count <> 1
  ) as conflict_count,
  coalesce(
    pg_catalog.jsonb_agg(pg_catalog.to_jsonb(system_role_invariants) order by team_slug),
    '[]'::jsonb
  ) as team_evidence
from system_role_invariants;

with custom_role_invariants as (
  select
    r.id,
    r.team_id,
    r.slug,
    coalesce(
      pg_catalog.array_agg(rp.permission_code order by rp.permission_code)
        filter (where rp.permission_code is not null),
      array[]::text[]
    ) as permission_codes,
    pg_catalog.bool_or(rp.permission_code = 'team.delete') as has_forbidden_team_delete
  from public.roles as r
  left join public.role_permissions as rp on rp.role_id = r.id
  where not r.is_system
  group by r.id, r.team_id, r.slug
)
select
  'custom_role_invariants'::text as check_name,
  pg_catalog.count(*) as custom_role_count,
  pg_catalog.count(*) filter (where has_forbidden_team_delete) as conflict_count,
  coalesce(
    pg_catalog.jsonb_agg(pg_catalog.to_jsonb(custom_role_invariants) order by team_id, slug),
    '[]'::jsonb
  ) as preservation_evidence
from custom_role_invariants;

with expected_columns(table_name, column_name, data_type, is_nullable) as (
  values
    ('profiles', 'requires_password_change', 'boolean', 'NO'),
    ('memberships', 'status', 'text', 'NO'),
    ('memberships', 'updated_at', 'timestamp with time zone', 'NO')
),
foundation_column_conflicts as (
  select
    e.table_name,
    e.column_name,
    c.data_type as actual_data_type,
    c.is_nullable as actual_is_nullable,
    c.column_default as actual_default,
    (
      c.column_name is not null
      and (
        c.data_type <> e.data_type
        or c.is_nullable <> e.is_nullable
      )
    ) as conflicts
  from expected_columns as e
  left join information_schema.columns as c
    on c.table_schema = 'public'
   and c.table_name = e.table_name
   and c.column_name = e.column_name
)
select
  'foundation_column_conflicts'::text as check_name,
  pg_catalog.count(*) filter (where conflicts) as conflict_count,
  coalesce(
    pg_catalog.jsonb_agg(pg_catalog.to_jsonb(foundation_column_conflicts) order by table_name, column_name),
    '[]'::jsonb
  ) as catalog_evidence
from foundation_column_conflicts;

with prospective_object_conflicts as (
  select
    p.oid::pg_catalog.regprocedure::text as existing_signature,
    pg_catalog.pg_get_function_result(p.oid) as existing_result
  from pg_catalog.pg_proc as p
  join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = any (
      array['get_current_team_access_contexts', 'create_team']::text[]
    )
)
select
  'prospective_object_conflicts'::text as check_name,
  pg_catalog.count(*) as existing_count,
  coalesce(
    pg_catalog.jsonb_agg(pg_catalog.to_jsonb(prospective_object_conflicts) order by existing_signature),
    '[]'::jsonb
  ) as existing_signatures
from prospective_object_conflicts;

commit;
