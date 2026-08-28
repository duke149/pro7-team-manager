create or replace function public.update_team_settings_section(
  p_team_id uuid,
  p_section text,
  p_value jsonb,
  p_expected_updated_at timestamptz
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_user_id uuid := (select auth.uid());
  v_settings public.team_settings%rowtype;
  v_updated_at timestamptz;
begin
  if v_actor_user_id is null then
    raise exception using errcode = '28000', message = 'Authentication required';
  end if;
  if not private.has_team_permission(p_team_id, 'settings.update') then
    raise exception using errcode = '42501', message = 'Settings update permission required';
  end if;
  if p_section not in ('notifications', 'payments')
    or p_value is null
    or pg_catalog.jsonb_typeof(p_value) <> 'object'
    or pg_catalog.pg_column_size(p_value) > 4096
    or p_expected_updated_at is null then
    raise exception using errcode = '22023', message = 'Invalid settings section';
  end if;

  if p_section = 'notifications' then
    if not (p_value ?& array['matchInvitations', 'matchReminders', 'reminderHoursBefore'])
      or p_value - array['matchInvitations', 'matchReminders', 'reminderHoursBefore'] <> '{}'::jsonb
      or pg_catalog.jsonb_typeof(p_value -> 'matchInvitations') <> 'boolean'
      or pg_catalog.jsonb_typeof(p_value -> 'matchReminders') <> 'boolean'
      or pg_catalog.jsonb_typeof(p_value -> 'reminderHoursBefore') <> 'number' then
      raise exception using errcode = '22023', message = 'Invalid notification settings';
    end if;
    if (p_value ->> 'reminderHoursBefore') !~ '^[0-9]{1,3}$'
      or (p_value ->> 'reminderHoursBefore')::integer not between 1 and 168 then
      raise exception using errcode = '22023', message = 'Invalid notification reminder';
    end if;
  else
    if not (p_value ?& array['bankCode', 'accountNumber', 'accountHolder', 'transferPrefix'])
      or p_value - array['bankCode', 'accountNumber', 'accountHolder', 'transferPrefix'] <> '{}'::jsonb
      or pg_catalog.jsonb_typeof(p_value -> 'bankCode') <> 'string'
      or pg_catalog.jsonb_typeof(p_value -> 'accountNumber') <> 'string'
      or pg_catalog.jsonb_typeof(p_value -> 'accountHolder') <> 'string'
      or pg_catalog.jsonb_typeof(p_value -> 'transferPrefix') not in ('string', 'null') then
      raise exception using errcode = '22023', message = 'Invalid payment settings';
    end if;
    if (p_value ->> 'bankCode') !~ '^[A-Z0-9]{2,12}$'
      or (p_value ->> 'accountNumber') !~ '^[0-9]{4,32}$'
      or (p_value ->> 'accountHolder') <> pg_catalog.btrim(p_value ->> 'accountHolder')
      or pg_catalog.char_length(p_value ->> 'accountHolder') not between 2 and 100
      or (
        pg_catalog.jsonb_typeof(p_value -> 'transferPrefix') = 'string'
        and (
          (p_value ->> 'transferPrefix') <> pg_catalog.btrim(p_value ->> 'transferPrefix')
          or pg_catalog.char_length(p_value ->> 'transferPrefix') not between 1 and 40
        )
      ) then
      raise exception using errcode = '22023', message = 'Invalid payment settings';
    end if;
  end if;

  select settings_row.* into v_settings
  from public.team_settings as settings_row
  where settings_row.team_id = p_team_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Team settings not found';
  end if;
  if p_expected_updated_at is distinct from v_settings.updated_at then
    raise exception using errcode = '40001', message = 'Team settings changed; refresh and retry';
  end if;

  update public.team_settings as settings_row
  set settings = settings_row.settings || pg_catalog.jsonb_build_object(p_section, p_value)
  where settings_row.team_id = p_team_id
  returning settings_row.updated_at into v_updated_at;

  return v_updated_at;
end;
$function$;

alter function public.update_team_settings_section(uuid, text, jsonb, timestamptz) owner to postgres;
revoke execute on function public.update_team_settings_section(uuid, text, jsonb, timestamptz)
from public, anon, authenticated, service_role;
grant execute on function public.update_team_settings_section(uuid, text, jsonb, timestamptz) to authenticated;

revoke update (settings) on table public.team_settings from authenticated;
