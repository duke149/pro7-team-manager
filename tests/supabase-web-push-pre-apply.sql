-- Read-only checkpoint for the PRO7 Web Push migration. Review every returned
-- collision before applying DDL. No endpoint, key, email, or recipient data is returned.
begin transaction read only;

with migration_history as (
  select
    '20260828120720'::text as expected_version,
    'pro7_web_push_rsvp'::text as expected_name,
    '8604e4d7a384d4de1ba528cbfd0a5374bc418d307e07fce110d1ad86a2b49fea'::text as source_sha256,
    (migration.version is not null) as is_applied,
    migration.name as recorded_name,
    pg_catalog.md5(coalesce(pg_catalog.array_to_string(migration.statements, E'\n'), '')) as recorded_statements_md5
  from (values (true)) as singleton(present)
  left join supabase_migrations.schema_migrations as migration
    on migration.version = '20260828120720'
), prerequisites as (
  select object_name, object_type, is_present
  from (values
    ('public.notifications', 'table', pg_catalog.to_regclass('public.notifications') is not null),
    ('public.matches', 'table', pg_catalog.to_regclass('public.matches') is not null),
    ('public.match_attendance', 'table', pg_catalog.to_regclass('public.match_attendance') is not null),
    ('public.team_settings', 'table', pg_catalog.to_regclass('public.team_settings') is not null),
    ('public.invite_match_attendance(uuid,uuid,uuid[])', 'function', pg_catalog.to_regprocedure('public.invite_match_attendance(uuid,uuid,uuid[])') is not null),
    ('public.remind_match_attendance(uuid,uuid)', 'function', pg_catalog.to_regprocedure('public.remind_match_attendance(uuid,uuid)') is not null)
  ) as required(object_name, object_type, is_present)
), missing_prerequisites as (
  select object_name, object_type
  from prerequisites
  where not is_present
), prospective_objects as (
  select object_name, object_type
  from (values
    ('public.push_subscriptions', 'table', pg_catalog.to_regclass('public.push_subscriptions') is not null),
    ('private.push_outbox', 'table', pg_catalog.to_regclass('private.push_outbox') is not null),
    ('private.push_deliveries', 'table', pg_catalog.to_regclass('private.push_deliveries') is not null),
    ('public.upsert_push_subscription(text,text,text,bigint,text)', 'function', pg_catalog.to_regprocedure('public.upsert_push_subscription(text,text,text,bigint,text)') is not null),
    ('public.delete_push_subscription(text)', 'function', pg_catalog.to_regprocedure('public.delete_push_subscription(text)') is not null),
    ('public.claim_push_deliveries(integer)', 'function', pg_catalog.to_regprocedure('public.claim_push_deliveries(integer)') is not null),
    ('public.settle_push_delivery(uuid,text,text)', 'function', pg_catalog.to_regprocedure('public.settle_push_delivery(uuid,text,text)') is not null)
  ) as prospective(object_name, object_type, is_present)
  where is_present
), notification_settings_anomalies as (
  select count(*)::integer as count
  from public.team_settings as settings_row
  where settings_row.settings ? 'notifications'
    and (
      pg_catalog.jsonb_typeof(settings_row.settings -> 'notifications') <> 'object'
      or (
        settings_row.settings #> '{notifications,matchInvitations}' is not null
        and pg_catalog.jsonb_typeof(settings_row.settings #> '{notifications,matchInvitations}') <> 'boolean'
      )
      or (
        settings_row.settings #> '{notifications,matchReminders}' is not null
        and pg_catalog.jsonb_typeof(settings_row.settings #> '{notifications,matchReminders}') <> 'boolean'
      )
      or (
        settings_row.settings #>> '{notifications,reminderHoursBefore}' is not null
        and (
          (settings_row.settings #>> '{notifications,reminderHoursBefore}') !~ '^[0-9]{1,3}$'
          or (settings_row.settings #>> '{notifications,reminderHoursBefore}')::integer not between 1 and 168
        )
      )
    )
), extension_state as (
  select extension.name,
    exists (select 1 from pg_catalog.pg_extension where extname = extension.name) as installed,
    exists (select 1 from pg_catalog.pg_available_extensions where name = extension.name) as available
  from (values ('pg_net'), ('pg_cron')) as extension(name)
), vault_available as (
  select pg_catalog.to_regclass('vault.decrypted_secrets') is not null as available
)
select pg_catalog.jsonb_build_object(
  'migration_history', (select pg_catalog.to_jsonb(history) from migration_history as history),
  'missing_prerequisites', coalesce(
    (select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(required) order by required.object_type, required.object_name)
     from missing_prerequisites as required),
    '[]'::jsonb
  ),
  'prospective_objects', coalesce(
    (select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(candidate) order by candidate.object_type, candidate.object_name)
     from prospective_objects as candidate),
    '[]'::jsonb
  ),
  'notification_settings_anomalies', (select count from notification_settings_anomalies),
  'extension_state', coalesce(
    (select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(extension) order by extension.name) from extension_state as extension),
    '[]'::jsonb
  ),
  'vault_available', (select available from vault_available)
);

commit;
