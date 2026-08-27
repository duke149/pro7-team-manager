-- Read-only checkpoint for the forward attachment-safety migration. Review all
-- result sets before applying DDL; the expected state is Squad applied, this
-- migration pending, the original service-only function intact, and no profile
-- gaps. This script intentionally returns counts/booleans rather than user data.

begin transaction read only;

with expected_migrations(
  version,
  expected_name,
  source_sha256,
  expected_applied
) as (
  values
    (
      '20260825091904',
      'pro7_squad_profiles',
      '098b2aab0089113811aae6fc4990847cf54f660267f919a9364469d575cbcede',
      true
    ),
    (
      '20260826035128',
      'preserve_existing_profile_attachment',
      'ae68719251b1c3e5908106b2b8572e5fc1fbc355b431ce5008194b3aa2120677',
      false
    )
),
migration_history as (
  select
    migration.version,
    migration.name,
    pg_catalog.md5(
      coalesce(
        pg_catalog.array_to_string(migration.statements, E'\n'),
        ''
      )
    ) as recorded_statements_md5
  from supabase_migrations.schema_migrations as migration
  where migration.version = any (
    array['20260825091904', '20260826035128']::text[]
  )
)
select
  'migration_history'::text as check_name,
  expected.version,
  expected.expected_name,
  expected.source_sha256,
  expected.expected_applied,
  (recorded.version is not null) as is_applied,
  recorded.name as recorded_name,
  recorded.recorded_statements_md5,
  (
    (recorded.version is not null) = expected.expected_applied
    and (
      recorded.version is null
      or recorded.name = expected.expected_name
    )
  ) as matches_expected_state
from expected_migrations as expected
left join migration_history as recorded using (version)
order by expected.version;

with attachment_function as (
  select
    procedure.oid,
    procedure.prosecdef,
    procedure.proconfig,
    pg_catalog.pg_get_userbyid(procedure.proowner) as owner_name,
    pg_catalog.pg_get_functiondef(procedure.oid) as definition
  from pg_catalog.pg_proc as procedure
  where procedure.oid = pg_catalog.to_regprocedure(
    'public.attach_team_member(uuid,uuid,uuid,text,boolean,uuid,smallint,text,date)'
  )
)
select
  'attachment_function'::text as check_name,
  (attachment.oid is not null) as exists,
  attachment.owner_name,
  attachment.prosecdef as security_definer,
  attachment.proconfig as function_config,
  pg_catalog.has_function_privilege(
    'service_role',
    attachment.oid,
    'EXECUTE'
  ) as service_role_can_execute,
  pg_catalog.has_function_privilege(
    'authenticated',
    attachment.oid,
    'EXECUTE'
  ) as authenticated_can_execute,
  pg_catalog.has_function_privilege(
    'anon',
    attachment.oid,
    'EXECUTE'
  ) as anon_can_execute,
  pg_catalog.strpos(
    attachment.definition,
    'display_name = excluded.display_name'
  ) > 0 as still_overwrites_existing_display_name,
  pg_catalog.strpos(
    attachment.definition,
    'requires_password_change = excluded.requires_password_change'
  ) > 0 as still_allows_password_flag_clear,
  pg_catalog.strpos(
    attachment.definition,
    'display_name = profiles.display_name'
  ) > 0 as preserves_existing_display_name,
  pg_catalog.strpos(
    attachment.definition,
    'profiles.requires_password_change'
  ) > 0 as password_flag_is_monotonic
from attachment_function as attachment;

with auth_user_profile_gaps as (
  select auth_user.id
  from auth.users as auth_user
  left join public.profiles as profile on profile.id = auth_user.id
  where profile.id is null
  union all
  select profile.id
  from public.profiles as profile
  left join auth.users as auth_user on auth_user.id = profile.id
  where auth_user.id is null
)
select
  'auth_user_profile_gaps'::text as check_name,
  pg_catalog.count(*) as gap_count
from auth_user_profile_gaps;

commit;
