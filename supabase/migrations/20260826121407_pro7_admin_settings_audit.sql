alter table private.audit_events enable row level security;

revoke all privileges on table private.audit_events
from public, anon, authenticated, service_role;

create or replace function public.get_team_audit_events(
  p_team_id uuid,
  p_limit integer default 50
)
returns table (
  event_id bigint,
  occurred_at timestamptz,
  actor_user_id uuid,
  actor_display_name text,
  table_name text,
  action text,
  row_key jsonb
)
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '28000', message = 'Authentication required';
  end if;

  if p_team_id is null or not private.has_team_permission(p_team_id, 'settings.read') then
    raise exception using errcode = '42501', message = 'Insufficient permission';
  end if;

  if p_limit < 1 or p_limit > 100 then
    raise exception using errcode = '22023', message = 'Invalid limit';
  end if;

  return query
  select
    event.id,
    event.occurred_at,
    event.actor_user_id,
    profile.display_name,
    event.table_name,
    event.action,
    event.row_key
  from private.audit_events as event
  left join public.profiles as profile on profile.id = event.actor_user_id
  where event.team_id = p_team_id
  order by event.id desc
  limit p_limit;
end;
$function$;

alter function public.get_team_audit_events(uuid, integer) owner to postgres;
revoke execute on function public.get_team_audit_events(uuid, integer)
from public, anon, service_role;
grant execute on function public.get_team_audit_events(uuid, integer) to authenticated;
