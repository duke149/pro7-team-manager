-- Read-only gate for the reviewed PRO7 Squad migration. Any occurrence of a
-- new profile column is blocking: ADD COLUMN IF NOT EXISTS would preserve its
-- existing typmod, default, and checks instead of enforcing this migration's
-- contract. Run and review this result before any remote dry run or apply.

with expected_profile_column_names (column_name) as (
  values
    ('phone'),
    ('date_of_birth'),
    ('height_cm'),
    ('weight_kg'),
    ('preferred_positions'),
    ('avatar_path')
),
preexisting_profile_columns as (
  select
    columns.table_schema,
    columns.table_name,
    columns.column_name,
    columns.data_type,
    columns.udt_name,
    columns.is_nullable,
    columns.character_maximum_length,
    columns.numeric_precision,
    columns.numeric_scale,
    columns.datetime_precision,
    columns.column_default
  from information_schema.columns as columns
  join expected_profile_column_names as expected
    using (column_name)
  where columns.table_schema = 'public'
    and columns.table_name = 'profiles'
),
object_state as (
  select
    'team_player_profiles table'::text as object_name,
    pg_catalog.to_regclass('public.team_player_profiles')::text as current_value
  union all
  select
    'shirt-number index',
    pg_catalog.to_regclass(
      'public.team_player_profiles_team_shirt_number_key'
    )::text
  union all
  select
    'squad-list index',
    pg_catalog.to_regclass(
      'public.team_player_profiles_team_status_position_idx'
    )::text
  union all
  select
    'player reverse index',
    pg_catalog.to_regclass(
      'public.team_player_profiles_user_id_team_id_idx'
    )::text
  union all
  select
    'manage RPC',
    pg_catalog.to_regprocedure(
      'public.manage_team_player(uuid,uuid,uuid,smallint,text,text,date,text,boolean)'
    )::text
  union all
  select
    'admin-detail RPC',
    pg_catalog.to_regprocedure(
      'public.get_team_player_admin_detail(uuid,uuid)'
    )::text
  union all
  select
    'attachment RPC',
    pg_catalog.to_regprocedure(
      'public.attach_team_member(uuid,uuid,uuid,text,boolean,uuid,smallint,text,date)'
    )::text
),
bucket_state as (
  select id, public, file_size_limit, allowed_mime_types
  from storage.buckets
  where id = 'player-avatars'
),
legacy_grants as (
  select
    grants.grantee::text,
    grants.table_schema::text,
    grants.table_name::text,
    grants.column_name::text,
    grants.privilege_type::text
  from information_schema.column_privileges as grants
  where grants.grantee = 'authenticated'
    and grants.table_schema = 'public'
    and grants.privilege_type = 'UPDATE'
    and (
      (
        grants.table_name = 'profiles'
        and grants.column_name not in (
          'display_name',
          'phone',
          'date_of_birth',
          'height_cm',
          'weight_kg',
          'preferred_positions',
          'avatar_path'
        )
      )
      or (
        grants.table_name = 'memberships'
        and grants.column_name in ('role_id', 'status')
      )
    )
  union all
  select
    grants.grantee::text,
    grants.table_schema::text,
    grants.table_name::text,
    null::text as column_name,
    grants.privilege_type::text
  from information_schema.table_privileges as grants
  where grants.grantee = 'authenticated'
    and grants.table_schema = 'public'
    and (
      (grants.table_name = 'profiles' and grants.privilege_type = 'UPDATE')
      or (
        grants.table_name = 'memberships'
        and grants.privilege_type in ('UPDATE', 'DELETE')
      )
    )
),
backfill_state as (
  select pg_catalog.count(*)::bigint as active_memberships_to_backfill
  from public.memberships
  where status = 'active'
)
select pg_catalog.jsonb_build_object(
  'preexisting_profile_columns',
  coalesce(
    (
      select pg_catalog.jsonb_agg(
        pg_catalog.to_jsonb(columns)
        order by columns.table_schema, columns.table_name, columns.column_name
      )
      from preexisting_profile_columns as columns
    ),
    '[]'::jsonb
  ),
  'object_state',
  coalesce(
    (
      select pg_catalog.jsonb_agg(
        pg_catalog.to_jsonb(objects)
        order by objects.object_name
      )
      from object_state as objects
    ),
    '[]'::jsonb
  ),
  'bucket_state',
  coalesce(
    (
      select pg_catalog.jsonb_agg(
        pg_catalog.to_jsonb(buckets)
        order by buckets.id
      )
      from bucket_state as buckets
    ),
    '[]'::jsonb
  ),
  'legacy_grants',
  coalesce(
    (
      select pg_catalog.jsonb_agg(
        pg_catalog.to_jsonb(grants)
        order by
          grants.table_schema,
          grants.table_name,
          grants.column_name nulls first,
          grants.privilege_type
      )
      from legacy_grants as grants
    ),
    '[]'::jsonb
  ),
  'backfill_state',
  (
    select pg_catalog.to_jsonb(backfill)
    from backfill_state as backfill
  )
) as pro7_squad_preapply;
