-- Read-only populated-project checkpoint. Stop before DDL on any unexpected row.
begin transaction read only;

with target_tables(table_name) as (
  values
    ('matches'),
    ('match_attendance'),
    ('match_events'),
    ('match_player_stats'),
    ('match_team_stats'),
    ('team_news'),
    ('match_tactics'),
    ('lineup_slots'),
    ('finance_entries'),
    ('member_dues')
),
target_functions(function_name, identity_arguments) as (
  values
    ('manage_match', 'text, uuid, uuid, text, timestamp with time zone, text, boolean, timestamp with time zone, smallint, smallint, timestamp with time zone'),
    ('invite_match_attendance', 'uuid, uuid, uuid[]'),
    ('respond_match_attendance', 'uuid, uuid, uuid, text, text, timestamp with time zone'),
    ('manage_match_analysis', 'uuid, uuid, jsonb, jsonb, jsonb, timestamp with time zone'),
    ('save_match_tactic', 'uuid, uuid, uuid, text, text, text, smallint, text, text, jsonb, timestamp with time zone'),
    ('apply_match_tactic', 'uuid, uuid, timestamp with time zone'),
    ('manage_finance_entry', 'text, uuid, uuid, text, bigint, text, date, text, text, timestamp with time zone'),
    ('manage_member_due', 'text, uuid, uuid, uuid, date, bigint, date, text, timestamp with time zone')
),
expected_tenant_constraints(table_name, constraint_name, definition_fragment) as (
  values
    ('match_attendance', 'match_attendance_match_team_fkey', 'FOREIGN KEY (match_id, team_id) REFERENCES matches(id, team_id)'),
    ('match_attendance', 'match_attendance_membership_fkey', 'FOREIGN KEY (team_id, user_id) REFERENCES memberships(team_id, user_id)'),
    ('match_events', 'match_events_match_team_fkey', 'FOREIGN KEY (match_id, team_id) REFERENCES matches(id, team_id)'),
    ('match_player_stats', 'match_player_stats_match_team_fkey', 'FOREIGN KEY (match_id, team_id) REFERENCES matches(id, team_id)'),
    ('match_player_stats', 'match_player_stats_membership_fkey', 'FOREIGN KEY (team_id, user_id) REFERENCES memberships(team_id, user_id)'),
    ('match_team_stats', 'match_team_stats_match_team_fkey', 'FOREIGN KEY (match_id, team_id) REFERENCES matches(id, team_id)'),
    ('match_tactics', 'match_tactics_match_team_fkey', 'FOREIGN KEY (match_id, team_id) REFERENCES matches(id, team_id)'),
    ('lineup_slots', 'lineup_slots_tactic_team_fkey', 'FOREIGN KEY (tactic_id, team_id) REFERENCES match_tactics(id, team_id)'),
    ('lineup_slots', 'lineup_slots_membership_fkey', 'FOREIGN KEY (team_id, user_id) REFERENCES memberships(team_id, user_id)'),
    ('member_dues', 'member_dues_finance_entry_team_fkey', 'FOREIGN KEY (finance_entry_id, team_id) REFERENCES finance_entries(id, team_id)')
),
migration_history as (
  select
    '20260826043803'::text as expected_version,
    'pro7_remaining_mvp'::text as expected_name,
    '7b98a63b474b36d1f6cfdf39987f6ce5d599eaf09f396761a9773db53f13dc5e'::text as source_sha256,
    (migration.version is not null) as is_applied,
    migration.name as recorded_name,
    pg_catalog.md5(coalesce(pg_catalog.array_to_string(migration.statements, E'\n'), '')) as recorded_statements_md5
  from (values (true)) as singleton(present)
  left join supabase_migrations.schema_migrations as migration
    on migration.version = '20260826043803'
),
prospective_tables as (
  select
    target.table_name,
    table_catalog.table_type
  from target_tables as target
  join information_schema.tables as table_catalog
    on table_catalog.table_schema = 'public'
   and table_catalog.table_name = target.table_name
),
prospective_functions as (
  select
    target.function_name,
    pg_catalog.pg_get_function_identity_arguments(procedure.oid) as identity_arguments,
    pg_catalog.pg_get_function_result(procedure.oid) as result_type,
    procedure.prosecdef as security_definer,
    procedure.proconfig
  from target_functions as target
  join pg_catalog.pg_proc as procedure
    on procedure.proname = target.function_name
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = procedure.pronamespace
   and namespace.nspname = 'public'
),
legacy_write_grants as (
  select
    privilege.table_name,
    privilege.privilege_type
  from information_schema.table_privileges as privilege
  join target_tables as target using (table_name)
  where privilege.table_schema = 'public'
    and privilege.grantee = 'authenticated'
    and privilege.privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'TRIGGER', 'REFERENCES')
),
rls_disabled_tables as (
  select target.table_name
  from target_tables as target
  join pg_catalog.pg_class as relation
    on relation.oid = pg_catalog.to_regclass('public.' || target.table_name)
  where not relation.relrowsecurity
),
tenant_reference_conflicts as (
  select
    expected.table_name,
    expected.constraint_name,
    pg_catalog.pg_get_constraintdef(constraint_catalog.oid) as actual_definition
  from expected_tenant_constraints as expected
  left join pg_catalog.pg_constraint as constraint_catalog
    on constraint_catalog.conrelid = pg_catalog.to_regclass('public.' || expected.table_name)
   and constraint_catalog.conname = expected.constraint_name
  where pg_catalog.to_regclass('public.' || expected.table_name) is not null
    and (
      constraint_catalog.oid is null
      or pg_catalog.pg_get_constraintdef(constraint_catalog.oid) not like expected.definition_fragment || '%'
    )
)
select pg_catalog.jsonb_build_object(
  'migration_history', (select pg_catalog.to_jsonb(history) from migration_history as history),
  'prospective_tables', coalesce(
    (select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(candidate) order by candidate.table_name) from prospective_tables as candidate),
    '[]'::jsonb
  ),
  'prospective_functions', coalesce(
    (select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(candidate) order by candidate.function_name) from prospective_functions as candidate),
    '[]'::jsonb
  ),
  'legacy_write_grants', coalesce(
    (select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(candidate) order by candidate.table_name, candidate.privilege_type) from legacy_write_grants as candidate),
    '[]'::jsonb
  ),
  'rls_disabled_tables', coalesce(
    (select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(candidate) order by candidate.table_name) from rls_disabled_tables as candidate),
    '[]'::jsonb
  ),
  'tenant_reference_conflicts', coalesce(
    (select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(candidate) order by candidate.table_name, candidate.constraint_name) from tenant_reference_conflicts as candidate),
    '[]'::jsonb
  )
);

commit;
