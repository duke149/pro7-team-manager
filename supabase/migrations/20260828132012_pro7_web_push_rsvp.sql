create table public.push_subscriptions (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null
    constraint push_subscriptions_endpoint_check
    check (
      endpoint = pg_catalog.btrim(endpoint)
      and pg_catalog.char_length(endpoint) between 10 and 2048
      and endpoint ~ '^https://[^[:space:]]+$'
    ),
  endpoint_hash bytea generated always as (extensions.digest(endpoint, 'sha256'::text)) stored,
  p256dh text not null
    constraint push_subscriptions_p256dh_check
    check (pg_catalog.char_length(p256dh) between 40 and 200 and p256dh ~ '^[A-Za-z0-9_-]+={0,2}$'),
  auth text not null
    constraint push_subscriptions_auth_check
    check (pg_catalog.char_length(auth) between 8 and 100 and auth ~ '^[A-Za-z0-9_-]+={0,2}$'),
  expiration_time bigint
    constraint push_subscriptions_expiration_check
    check (expiration_time is null or expiration_time > 0),
  user_agent text
    constraint push_subscriptions_user_agent_check
    check (
      user_agent is null
      or (user_agent = pg_catalog.btrim(user_agent) and pg_catalog.char_length(user_agent) between 1 and 500)
    ),
  failure_count smallint not null default 0
    constraint push_subscriptions_failure_count_check
    check (failure_count between 0 and 50),
  last_success_at timestamptz,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint push_subscriptions_endpoint_hash_key unique (endpoint_hash)
);

create index push_subscriptions_user_updated_at_idx
  on public.push_subscriptions (user_id, updated_at desc);

create trigger trg_push_subscriptions_set_updated_at
before update on public.push_subscriptions
for each row execute function private.set_updated_at();

alter table public.push_subscriptions enable row level security;

create policy push_subscriptions_select_own
on public.push_subscriptions for select to authenticated
using (user_id = (select auth.uid()));

create policy push_subscriptions_delete_own
on public.push_subscriptions for delete to authenticated
using (user_id = (select auth.uid()));

revoke all on table public.push_subscriptions from public, anon, authenticated, service_role;
grant select, delete on table public.push_subscriptions to authenticated;
grant all on table public.push_subscriptions to service_role;

alter table public.notifications
add constraint notifications_id_user_key unique (id, user_id);

create table private.push_outbox (
  id uuid primary key default extensions.gen_random_uuid(),
  notification_id uuid not null references public.notifications (id) on delete cascade,
  team_id uuid not null,
  match_id uuid not null,
  user_id uuid not null,
  event_kind text not null
    constraint push_outbox_event_kind_check
    check (event_kind in ('invitation', 'manual_reminder', 'configured_reminder', 'two_hour_reminder')),
  event_key text not null
    constraint push_outbox_event_key_check
    check (event_key = pg_catalog.btrim(event_key) and pg_catalog.char_length(event_key) between 1 and 100),
  title text not null
    constraint push_outbox_title_check
    check (title = pg_catalog.btrim(title) and pg_catalog.char_length(title) between 1 and 160),
  body text not null
    constraint push_outbox_body_check
    check (body = pg_catalog.btrim(body) and pg_catalog.char_length(body) between 1 and 500),
  target_path text not null
    constraint push_outbox_target_path_check
    check (
      target_path = pg_catalog.btrim(target_path)
      and pg_catalog.char_length(target_path) between 1 and 220
      and target_path ~ '^/teams/[a-z0-9]+(-[a-z0-9]+)*/matches/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/rsvp$'
    ),
  status text not null default 'pending'
    constraint push_outbox_status_check
    check (status in ('pending', 'processing', 'completed', 'no_subscription', 'failed')),
  available_at timestamptz not null default pg_catalog.clock_timestamp(),
  locked_at timestamptz,
  attempts smallint not null default 0
    constraint push_outbox_attempts_check
    check (attempts between 0 and 20),
  completed_at timestamptz,
  last_error_code text
    constraint push_outbox_error_check
    check (last_error_code is null or (last_error_code = pg_catalog.btrim(last_error_code) and pg_catalog.char_length(last_error_code) between 1 and 64)),
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint push_outbox_notification_user_fkey
    foreign key (notification_id, user_id)
    references public.notifications (id, user_id)
    on delete cascade,
  constraint push_outbox_match_team_fkey
    foreign key (match_id, team_id)
    references public.matches (id, team_id)
    on delete cascade,
  constraint push_outbox_membership_fkey
    foreign key (team_id, user_id)
    references public.memberships (team_id, user_id)
    on delete cascade,
  constraint push_outbox_identity_key unique (match_id, user_id, event_key)
);

create index push_outbox_due_idx
  on private.push_outbox (available_at, created_at)
  where status in ('pending', 'processing');
create index push_outbox_user_created_at_idx
  on private.push_outbox (user_id, created_at desc);

create table private.push_deliveries (
  id uuid primary key default extensions.gen_random_uuid(),
  outbox_id uuid not null references private.push_outbox (id) on delete cascade,
  subscription_id uuid not null references public.push_subscriptions (id) on delete cascade,
  status text not null default 'pending'
    constraint push_deliveries_status_check
    check (status in ('pending', 'processing', 'sent', 'failed')),
  attempts smallint not null default 0
    constraint push_deliveries_attempts_check
    check (attempts between 0 and 20),
  next_attempt_at timestamptz not null default pg_catalog.clock_timestamp(),
  locked_at timestamptz,
  sent_at timestamptz,
  last_error_code text
    constraint push_deliveries_error_check
    check (last_error_code is null or (last_error_code = pg_catalog.btrim(last_error_code) and pg_catalog.char_length(last_error_code) between 1 and 64)),
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint push_deliveries_outbox_subscription_key unique (outbox_id, subscription_id)
);

create index push_deliveries_due_idx
  on private.push_deliveries (next_attempt_at, created_at)
  where status in ('pending', 'processing');

revoke all on table private.push_outbox, private.push_deliveries from public, anon, authenticated, service_role;

alter table public.notifications
drop constraint notifications_target_path_check;

alter table public.notifications
add constraint notifications_target_path_check
check (
  target_path = pg_catalog.btrim(target_path)
  and pg_catalog.char_length(target_path) between 1 and 220
  and target_path ~ '^/teams/[a-z0-9]+(-[a-z0-9]+)*/matches/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(/rsvp)?$'
);

update public.notifications as notification
set target_path = notification.target_path || '/rsvp'
where notification.source_entity = 'match'
  and notification.type in ('match_invitation', 'match_reminder')
  and notification.target_path !~ '/rsvp$';

create or replace function private.sync_notification_team_slug()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.slug is distinct from old.slug then
    update public.notifications
    set target_path = '/teams/' || new.slug || '/matches/' || source_id::text || '/rsvp'
    where team_id = new.id;

    update private.push_outbox
    set target_path = '/teams/' || new.slug || '/matches/' || match_id::text || '/rsvp'
    where team_id = new.id
      and status in ('pending', 'processing');
  end if;
  return new;
end;
$function$;

alter function private.sync_notification_team_slug() owner to postgres;
revoke execute on function private.sync_notification_team_slug()
from public, anon, authenticated, service_role;

create or replace function public.upsert_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_expiration_time bigint,
  p_user_agent text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_user_id uuid := (select auth.uid());
  v_subscription_id uuid;
begin
  if v_actor_user_id is null then
    raise exception using errcode = '28000', message = 'Authentication required';
  end if;
  if p_endpoint is null
    or p_endpoint <> pg_catalog.btrim(p_endpoint)
    or pg_catalog.char_length(p_endpoint) not between 10 and 2048
    or p_endpoint !~ '^https://[^[:space:]]+$'
    or p_p256dh is null
    or pg_catalog.char_length(p_p256dh) not between 40 and 200
    or p_p256dh !~ '^[A-Za-z0-9_-]+={0,2}$'
    or p_auth is null
    or pg_catalog.char_length(p_auth) not between 8 and 100
    or p_auth !~ '^[A-Za-z0-9_-]+={0,2}$'
    or (p_expiration_time is not null and p_expiration_time <= 0)
    or (
      p_user_agent is not null
      and (
        p_user_agent <> pg_catalog.btrim(p_user_agent)
        or pg_catalog.char_length(p_user_agent) not between 1 and 500
      )
    ) then
    raise exception using errcode = '22023', message = 'Invalid push subscription';
  end if;

  insert into public.push_subscriptions (
    user_id, endpoint, p256dh, auth, expiration_time, user_agent
  ) values (
    v_actor_user_id, p_endpoint, p_p256dh, p_auth, p_expiration_time, p_user_agent
  )
  on conflict (endpoint_hash) do update
  set user_id = excluded.user_id,
      endpoint = excluded.endpoint,
      p256dh = excluded.p256dh,
      auth = excluded.auth,
      expiration_time = excluded.expiration_time,
      user_agent = excluded.user_agent,
      failure_count = 0,
      last_success_at = null
  returning id into v_subscription_id;

  return v_subscription_id;
end;
$function$;

alter function public.upsert_push_subscription(text, text, text, bigint, text) owner to postgres;
revoke execute on function public.upsert_push_subscription(text, text, text, bigint, text)
from public, anon, authenticated, service_role;
grant execute on function public.upsert_push_subscription(text, text, text, bigint, text) to authenticated;

create or replace function public.delete_push_subscription(p_endpoint text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_user_id uuid := (select auth.uid());
  v_deleted_count integer;
begin
  if v_actor_user_id is null then
    raise exception using errcode = '28000', message = 'Authentication required';
  end if;
  if p_endpoint is null
    or p_endpoint <> pg_catalog.btrim(p_endpoint)
    or pg_catalog.char_length(p_endpoint) not between 10 and 2048
    or p_endpoint !~ '^https://[^[:space:]]+$' then
    raise exception using errcode = '22023', message = 'Invalid push endpoint';
  end if;

  delete from public.push_subscriptions
  where user_id = v_actor_user_id
    and endpoint_hash = extensions.digest(p_endpoint, 'sha256'::text);
  get diagnostics v_deleted_count = row_count;
  return v_deleted_count = 1;
end;
$function$;

alter function public.delete_push_subscription(text) owner to postgres;
revoke execute on function public.delete_push_subscription(text)
from public, anon, authenticated, service_role;
grant execute on function public.delete_push_subscription(text) to authenticated;

create or replace function private.team_push_setting(
  p_team_id uuid,
  p_key text,
  p_default boolean
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select case
    when pg_catalog.jsonb_typeof(settings_row.settings #> array['notifications', p_key]) = 'boolean'
      then (settings_row.settings #>> array['notifications', p_key])::boolean
    else p_default
  end
  from public.team_settings as settings_row
  where settings_row.team_id = p_team_id
$function$;

alter function private.team_push_setting(uuid, text, boolean) owner to postgres;
revoke execute on function private.team_push_setting(uuid, text, boolean)
from public, anon, authenticated, service_role;

create or replace function private.enqueue_match_push(
  p_notification_id uuid,
  p_team_id uuid,
  p_match_id uuid,
  p_user_id uuid,
  p_event_kind text,
  p_event_key text,
  p_title text,
  p_body text,
  p_target_path text,
  p_available_at timestamptz default pg_catalog.clock_timestamp()
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_outbox_id uuid;
begin
  insert into private.push_outbox (
    notification_id, team_id, match_id, user_id, event_kind, event_key,
    title, body, target_path, available_at
  ) values (
    p_notification_id, p_team_id, p_match_id, p_user_id, p_event_kind, p_event_key,
    p_title, p_body, p_target_path, coalesce(p_available_at, pg_catalog.clock_timestamp())
  )
  on conflict (match_id, user_id, event_key) do nothing
  returning id into v_outbox_id;

  return v_outbox_id;
end;
$function$;

alter function private.enqueue_match_push(uuid, uuid, uuid, uuid, text, text, text, text, text, timestamptz) owner to postgres;
revoke execute on function private.enqueue_match_push(uuid, uuid, uuid, uuid, text, text, text, text, text, timestamptz)
from public, anon, authenticated, service_role;

create or replace function private.request_push_worker()
returns bigint
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_url text;
  v_secret text;
  v_request_id bigint;
begin
  if pg_catalog.to_regclass('vault.decrypted_secrets') is null
    or pg_catalog.to_regproc('net.http_post') is null then
    return null;
  end if;

  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1 limit 1'
  into v_url using 'pro7_push_worker_url';
  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1 limit 1'
  into v_secret using 'pro7_push_internal_secret';

  if v_url is null
    or v_secret is null
    or v_url !~ '^https://[^[:space:]]+$'
    or pg_catalog.char_length(v_url) > 2048
    or pg_catalog.char_length(v_secret) not between 32 and 256 then
    return null;
  end if;

  execute $request$
    select net.http_post(
      url := $1,
      headers := pg_catalog.jsonb_build_object(
        'content-type', 'application/json',
        'x-pro7-push-secret', $2
      ),
      body := '{"source":"database"}'::jsonb,
      timeout_milliseconds := 5000
    )
  $request$
  into v_request_id
  using v_url, v_secret;

  return v_request_id;
exception when others then
  return null;
end;
$function$;

alter function private.request_push_worker() owner to postgres;
revoke execute on function private.request_push_worker()
from public, anon, authenticated, service_role;

create or replace function public.invite_match_attendance(
  p_team_id uuid,
  p_match_id uuid,
  p_user_ids uuid[]
)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_user_id uuid := (select auth.uid());
  v_match public.matches%rowtype;
  v_requested_count integer;
  v_valid_count integer;
  v_inserted_count integer;
  v_inserted_user_ids uuid[];
  v_team_slug text;
  v_push_enabled boolean;
  v_notification record;
  v_outbox_id uuid;
  v_queued_count integer := 0;
begin
  if v_actor_user_id is null then
    raise exception using errcode = '28000', message = 'Authentication required';
  end if;
  if not private.has_team_permission(p_team_id, 'matches.manage') then
    raise exception using errcode = '42501', message = 'Match management permission required';
  end if;
  if p_user_ids is null or cardinality(p_user_ids) = 0 or array_position(p_user_ids, null) is not null then
    raise exception using errcode = '22023', message = 'At least one invitee is required';
  end if;

  select m.* into v_match
  from public.matches as m
  where m.id = p_match_id and m.team_id = p_team_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Match not found';
  end if;
  if v_match.status <> 'scheduled' then
    raise exception using errcode = '55000', message = 'Only scheduled matches can be invited';
  end if;

  select team.slug into strict v_team_slug
  from public.teams as team
  where team.id = p_team_id;
  v_push_enabled := coalesce(private.team_push_setting(p_team_id, 'matchInvitations', true), true);

  select count(distinct requested.user_id) into v_requested_count
  from unnest(p_user_ids) as requested(user_id);

  select count(*) into v_valid_count
  from (
    select distinct requested.user_id
    from unnest(p_user_ids) as requested(user_id)
    join public.memberships as membership
      on membership.team_id = p_team_id
     and membership.user_id = requested.user_id
     and membership.status = 'active'
  ) as valid;
  if v_requested_count <> v_valid_count then
    raise exception using errcode = '23503', message = 'Invitee is not an active team member';
  end if;

  with inserted as (
    insert into public.match_attendance (
      match_id, team_id, user_id, status, invited_at, invited_by_user_id
    )
    select p_match_id, p_team_id, requested.user_id, 'pending', pg_catalog.now(), v_actor_user_id
    from (select distinct unnest(p_user_ids) as user_id) as requested
    on conflict (match_id, user_id) do nothing
    returning user_id
  )
  select
    coalesce(pg_catalog.array_agg(inserted.user_id order by inserted.user_id), array[]::uuid[]),
    count(*)::integer
  into v_inserted_user_ids, v_inserted_count
  from inserted;

  if v_inserted_count > 0 then
    for v_notification in
      insert into public.notifications (
        team_id, user_id, type, source_entity, source_id, title, body, target_path
      )
      select
        p_team_id,
        inserted_user.user_id,
        'match_invitation',
        'match',
        p_match_id,
        'Lời mời tham gia trận đấu',
        'Bạn được mời xác nhận tham gia trận gặp ' || v_match.opponent || '.',
        '/teams/' || v_team_slug || '/matches/' || p_match_id::text || '/rsvp'
      from unnest(v_inserted_user_ids) as inserted_user(user_id)
      on conflict (user_id, type, source_entity, source_id) do update
      set title = excluded.title,
          body = excluded.body,
          target_path = excluded.target_path
      returning id, user_id, title, body, target_path
    loop
      if v_push_enabled then
        v_outbox_id := private.enqueue_match_push(
          v_notification.id, p_team_id, p_match_id, v_notification.user_id,
          'invitation', 'invitation', v_notification.title, v_notification.body,
          v_notification.target_path, pg_catalog.clock_timestamp()
        );
        if v_outbox_id is not null then v_queued_count := v_queued_count + 1; end if;
      end if;
    end loop;

    insert into private.audit_events (
      actor_user_id, team_id, table_name, action, row_key, old_data, new_data, request_id
    ) values (
      v_actor_user_id, p_team_id, 'match_attendance', 'INSERT',
      pg_catalog.jsonb_build_object('match_id', p_match_id), null,
      pg_catalog.jsonb_build_object('invitee_count', v_inserted_count, 'push_queued_count', v_queued_count), null
    );
  end if;

  if v_queued_count > 0 then perform private.request_push_worker(); end if;
  return v_requested_count;
end;
$function$;

alter function public.invite_match_attendance(uuid, uuid, uuid[]) owner to postgres;
revoke execute on function public.invite_match_attendance(uuid, uuid, uuid[])
from public, anon, authenticated, service_role;
grant execute on function public.invite_match_attendance(uuid, uuid, uuid[]) to authenticated;

create or replace function public.remind_match_attendance(
  p_team_id uuid,
  p_match_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_user_id uuid := (select auth.uid());
  v_match public.matches%rowtype;
  v_written_count integer := 0;
  v_team_slug text;
  v_push_enabled boolean;
  v_notification record;
  v_outbox_id uuid;
  v_queued_count integer := 0;
  v_event_key text;
begin
  if v_actor_user_id is null then
    raise exception using errcode = '28000', message = 'Authentication required';
  end if;
  if not private.has_team_permission(p_team_id, 'matches.manage') then
    raise exception using errcode = '42501', message = 'Match management permission required';
  end if;

  select m.* into v_match
  from public.matches as m
  where m.id = p_match_id and m.team_id = p_team_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Match not found';
  end if;
  if v_match.status <> 'scheduled' then
    raise exception using errcode = '55000', message = 'Only scheduled matches can send reminders';
  end if;

  select team.slug into strict v_team_slug
  from public.teams as team
  where team.id = p_team_id;
  v_push_enabled := coalesce(private.team_push_setting(p_team_id, 'matchReminders', true), true);
  v_event_key := 'manual:' || pg_catalog.to_char(
    pg_catalog.date_trunc('minute', pg_catalog.clock_timestamp()) at time zone 'UTC',
    'YYYYMMDDHH24MI'
  );

  for v_notification in
    insert into public.notifications (
      team_id, user_id, type, source_entity, source_id, title, body, target_path
    )
    select
      p_team_id,
      attendance.user_id,
      'match_reminder',
      'match',
      p_match_id,
      'Nhắc xác nhận tham gia trận đấu',
      'Vui lòng xác nhận tham gia trận gặp ' || v_match.opponent || '.',
      '/teams/' || v_team_slug || '/matches/' || p_match_id::text || '/rsvp'
    from public.match_attendance as attendance
    join public.memberships as membership
      on membership.team_id = attendance.team_id
     and membership.user_id = attendance.user_id
     and membership.status = 'active'
    where attendance.match_id = p_match_id
      and attendance.team_id = p_team_id
      and attendance.status = 'pending'
    order by attendance.user_id
    on conflict (user_id, type, source_entity, source_id) do update
    set title = excluded.title,
        body = excluded.body,
        target_path = excluded.target_path,
        read_at = null,
        created_at = greatest(
          pg_catalog.clock_timestamp(),
          public.notifications.created_at + interval '1 microsecond'
        )
    returning id, user_id, title, body, target_path
  loop
    v_written_count := v_written_count + 1;
    if v_push_enabled then
      v_outbox_id := private.enqueue_match_push(
        v_notification.id, p_team_id, p_match_id, v_notification.user_id,
        'manual_reminder', v_event_key, v_notification.title, v_notification.body,
        v_notification.target_path, pg_catalog.clock_timestamp()
      );
      if v_outbox_id is not null then v_queued_count := v_queued_count + 1; end if;
    end if;
  end loop;

  if v_written_count > 0 then
    insert into private.audit_events (
      actor_user_id, team_id, table_name, action, row_key, old_data, new_data, request_id
    ) values (
      v_actor_user_id,
      p_team_id,
      'notifications',
      'UPDATE',
      pg_catalog.jsonb_build_object('match_id', p_match_id),
      null,
      pg_catalog.jsonb_build_object(
        'operation', 'remind',
        'recipient_count', v_written_count,
        'push_queued_count', v_queued_count
      ),
      null
    );
  end if;

  if v_queued_count > 0 then perform private.request_push_worker(); end if;
  return v_written_count;
end;
$function$;

alter function public.remind_match_attendance(uuid, uuid) owner to postgres;
revoke execute on function public.remind_match_attendance(uuid, uuid)
from public, anon, authenticated, service_role;
grant execute on function public.remind_match_attendance(uuid, uuid) to authenticated;

create or replace function private.schedule_match_push_events()
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_candidate record;
  v_notification_id uuid;
  v_outbox_id uuid;
  v_queued_count integer := 0;
begin
  for v_candidate in
    with scheduled as (
      select
        match_row.id as match_id,
        match_row.team_id,
        match_row.opponent,
        match_row.starts_at,
        match_row.rsvp_deadline,
        team.slug,
        case
          when pg_catalog.jsonb_typeof(settings_row.settings #> '{notifications,matchReminders}') = 'boolean'
            then (settings_row.settings #>> '{notifications,matchReminders}')::boolean
          else true
        end as reminders_enabled,
        case
          when (settings_row.settings #>> '{notifications,reminderHoursBefore}') ~ '^[0-9]{1,3}$'
            and (settings_row.settings #>> '{notifications,reminderHoursBefore}')::integer between 1 and 168
            then (settings_row.settings #>> '{notifications,reminderHoursBefore}')::integer
          else 24
        end as reminder_hours
      from public.matches as match_row
      join public.teams as team on team.id = match_row.team_id
      join public.team_settings as settings_row on settings_row.team_id = match_row.team_id
      where match_row.status = 'scheduled'
        and match_row.starts_at > pg_catalog.clock_timestamp()
        and match_row.rsvp_deadline >= pg_catalog.clock_timestamp()
    ), candidates as (
      select
        scheduled.*,
        attendance.user_id,
        'configured_reminder'::text as event_kind,
        'configured:' || scheduled.reminder_hours::text as event_key,
        scheduled.reminder_hours as hours_before
      from scheduled
      join public.match_attendance as attendance
        on attendance.match_id = scheduled.match_id
       and attendance.team_id = scheduled.team_id
       and attendance.status = 'pending'
      join public.memberships as membership
        on membership.team_id = attendance.team_id
       and membership.user_id = attendance.user_id
       and membership.status = 'active'
      where scheduled.reminders_enabled
        and scheduled.reminder_hours <> 2
        and scheduled.starts_at <= pg_catalog.clock_timestamp() + pg_catalog.make_interval(hours => scheduled.reminder_hours)
      union all
      select
        scheduled.*,
        attendance.user_id,
        'two_hour_reminder'::text,
        'fixed:2h'::text,
        2
      from scheduled
      join public.match_attendance as attendance
        on attendance.match_id = scheduled.match_id
       and attendance.team_id = scheduled.team_id
       and attendance.status = 'pending'
      join public.memberships as membership
        on membership.team_id = attendance.team_id
       and membership.user_id = attendance.user_id
       and membership.status = 'active'
      where scheduled.reminders_enabled
        and scheduled.starts_at <= pg_catalog.clock_timestamp() + interval '2 hours'
    )
    select candidates.*
    from candidates
    where not exists (
      select 1
      from private.push_outbox as queued
      where queued.match_id = candidates.match_id
        and queued.user_id = candidates.user_id
        and queued.event_key = candidates.event_key
    )
    order by candidates.starts_at, candidates.match_id, candidates.user_id, candidates.event_key
  loop
    insert into public.notifications (
      team_id, user_id, type, source_entity, source_id, title, body, target_path
    ) values (
      v_candidate.team_id,
      v_candidate.user_id,
      'match_reminder',
      'match',
      v_candidate.match_id,
      case
        when v_candidate.event_kind = 'two_hour_reminder' then 'Trận đấu bắt đầu sau 2 giờ'
        else 'Sắp đến trận đấu'
      end,
      'Bạn chưa xác nhận tham gia trận gặp ' || v_candidate.opponent || '.',
      '/teams/' || v_candidate.slug || '/matches/' || v_candidate.match_id::text || '/rsvp'
    )
    on conflict (user_id, type, source_entity, source_id) do update
    set title = excluded.title,
        body = excluded.body,
        target_path = excluded.target_path,
        read_at = null,
        created_at = greatest(
          pg_catalog.clock_timestamp(),
          public.notifications.created_at + interval '1 microsecond'
        )
    returning id into v_notification_id;

    v_outbox_id := private.enqueue_match_push(
      v_notification_id,
      v_candidate.team_id,
      v_candidate.match_id,
      v_candidate.user_id,
      v_candidate.event_kind,
      v_candidate.event_key,
      case
        when v_candidate.event_kind = 'two_hour_reminder' then 'Trận đấu bắt đầu sau 2 giờ'
        else 'Sắp đến trận đấu'
      end,
      'Bạn chưa xác nhận tham gia trận gặp ' || v_candidate.opponent || '.',
      '/teams/' || v_candidate.slug || '/matches/' || v_candidate.match_id::text || '/rsvp',
      pg_catalog.clock_timestamp()
    );
    if v_outbox_id is not null then v_queued_count := v_queued_count + 1; end if;
  end loop;

  return v_queued_count;
end;
$function$;

alter function private.schedule_match_push_events() owner to postgres;
revoke execute on function private.schedule_match_push_events()
from public, anon, authenticated, service_role;

create or replace function public.claim_push_deliveries(p_limit integer)
returns table (
  delivery_id uuid,
  outbox_id uuid,
  endpoint text,
  p256dh text,
  auth text,
  title text,
  body text,
  target_path text,
  event_kind text,
  attempt integer
)
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if p_limit is null or p_limit not between 1 and 100 then
    raise exception using errcode = '22023', message = 'Invalid push claim limit';
  end if;

  update private.push_deliveries as delivery
  set status = 'pending',
      locked_at = null,
      next_attempt_at = least(delivery.next_attempt_at, pg_catalog.clock_timestamp())
  where delivery.status = 'processing'
    and delivery.locked_at < pg_catalog.clock_timestamp() - interval '5 minutes';

  update private.push_outbox as queued
  set status = 'pending', locked_at = null
  where queued.status = 'processing'
    and queued.locked_at < pg_catalog.clock_timestamp() - interval '5 minutes';

  with due_outbox as (
    select queued.id, queued.user_id
    from private.push_outbox as queued
    where queued.status in ('pending', 'processing')
      and queued.available_at <= pg_catalog.clock_timestamp()
      and queued.attempts < 20
    order by queued.available_at, queued.created_at, queued.id
    limit p_limit
  )
  insert into private.push_deliveries (outbox_id, subscription_id)
  select due_outbox.id, subscription.id
  from due_outbox
  join public.push_subscriptions as subscription on subscription.user_id = due_outbox.user_id
  on conflict on constraint push_deliveries_outbox_subscription_key do nothing;

  update private.push_outbox as queued
  set status = 'no_subscription',
      completed_at = pg_catalog.clock_timestamp(),
      last_error_code = 'no_subscription'
  where queued.status in ('pending', 'processing')
    and queued.available_at <= pg_catalog.clock_timestamp()
    and not exists (
      select 1 from private.push_deliveries as delivery where delivery.outbox_id = queued.id
    )
    and not exists (
      select 1 from public.push_subscriptions as subscription where subscription.user_id = queued.user_id
    );

  return query
  with candidates as (
    select delivery.id
    from private.push_deliveries as delivery
    join private.push_outbox as queued on queued.id = delivery.outbox_id
    where delivery.status = 'pending'
      and delivery.next_attempt_at <= pg_catalog.clock_timestamp()
      and delivery.attempts < 20
      and queued.status in ('pending', 'processing')
      and queued.available_at <= pg_catalog.clock_timestamp()
    order by delivery.next_attempt_at, delivery.created_at, delivery.id
    for update skip locked
    limit p_limit
  ), claimed as (
    update private.push_deliveries as delivery
    set status = 'processing',
        attempts = delivery.attempts + 1,
        locked_at = pg_catalog.clock_timestamp()
    from candidates
    where delivery.id = candidates.id
    returning delivery.id, delivery.outbox_id, delivery.subscription_id, delivery.attempts
  ), touched as (
    update private.push_outbox as queued
    set status = 'processing',
        attempts = least(20, queued.attempts + 1),
        locked_at = pg_catalog.clock_timestamp()
    where queued.id in (select claimed.outbox_id from claimed)
    returning queued.id
  )
  select
    claimed.id,
    claimed.outbox_id,
    subscription.endpoint,
    subscription.p256dh,
    subscription.auth,
    queued.title,
    queued.body,
    queued.target_path,
    queued.event_kind,
    claimed.attempts::integer
  from claimed
  join private.push_outbox as queued on queued.id = claimed.outbox_id
  join public.push_subscriptions as subscription on subscription.id = claimed.subscription_id
  cross join (select count(*) from touched) as touched_count;
end;
$function$;

alter function public.claim_push_deliveries(integer) owner to postgres;
revoke execute on function public.claim_push_deliveries(integer)
from public, anon, authenticated, service_role;
grant execute on function public.claim_push_deliveries(integer) to service_role;

create or replace function public.settle_push_delivery(
  p_delivery_id uuid,
  p_outcome text,
  p_error_code text
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_delivery private.push_deliveries%rowtype;
  v_outbox_id uuid;
begin
  if p_delivery_id is null
    or p_outcome not in ('sent', 'retry', 'expired', 'permanent')
    or (
      p_error_code is not null
      and (
        p_error_code <> pg_catalog.btrim(p_error_code)
        or pg_catalog.char_length(p_error_code) not between 1 and 64
        or p_error_code !~ '^[a-z0-9_:-]+$'
      )
    ) then
    raise exception using errcode = '22023', message = 'Invalid push settlement';
  end if;

  select delivery.* into v_delivery
  from private.push_deliveries as delivery
  where delivery.id = p_delivery_id
  for update;
  if not found or v_delivery.status <> 'processing' then
    raise exception using errcode = 'P0002', message = 'Push delivery not claimable';
  end if;
  v_outbox_id := v_delivery.outbox_id;

  if p_outcome = 'sent' then
    update private.push_deliveries
    set status = 'sent', sent_at = pg_catalog.clock_timestamp(), locked_at = null, last_error_code = null
    where id = p_delivery_id;
    update public.push_subscriptions
    set failure_count = 0, last_success_at = pg_catalog.clock_timestamp()
    where id = v_delivery.subscription_id;
  elsif p_outcome = 'retry' then
    update private.push_deliveries
    set status = case when v_delivery.attempts >= 20 then 'failed' else 'pending' end,
        next_attempt_at = pg_catalog.clock_timestamp()
          + pg_catalog.make_interval(secs => least(3600, (30 * pg_catalog.power(2::numeric, least(v_delivery.attempts, 7)))::integer)),
        locked_at = null,
        last_error_code = coalesce(p_error_code, 'retry')
    where id = p_delivery_id;
    update public.push_subscriptions
    set failure_count = least(50, failure_count + 1)
    where id = v_delivery.subscription_id;
  elsif p_outcome = 'expired' then
    update private.push_deliveries
    set status = 'failed', locked_at = null, last_error_code = coalesce(p_error_code, 'expired')
    where id = p_delivery_id;
    delete from public.push_subscriptions where id = v_delivery.subscription_id;
  else
    update private.push_deliveries
    set status = 'failed', locked_at = null, last_error_code = coalesce(p_error_code, 'permanent')
    where id = p_delivery_id;
    update public.push_subscriptions
    set failure_count = least(50, failure_count + 1)
    where id = v_delivery.subscription_id;
  end if;

  update private.push_outbox as queued
  set status = case
        when exists (
          select 1 from private.push_deliveries as delivery
          where delivery.outbox_id = v_outbox_id and delivery.status in ('pending', 'processing')
        ) then 'pending'
        else 'completed'
      end,
      locked_at = null,
      completed_at = case
        when exists (
          select 1 from private.push_deliveries as delivery
          where delivery.outbox_id = v_outbox_id and delivery.status in ('pending', 'processing')
        ) then null
        else pg_catalog.clock_timestamp()
      end,
      last_error_code = case
        when p_outcome = 'sent' then queued.last_error_code
        else coalesce(p_error_code, p_outcome)
      end
  where queued.id = v_outbox_id;
end;
$function$;

alter function public.settle_push_delivery(uuid, text, text) owner to postgres;
revoke execute on function public.settle_push_delivery(uuid, text, text)
from public, anon, authenticated, service_role;
grant execute on function public.settle_push_delivery(uuid, text, text) to service_role;

create or replace function private.run_push_minute()
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_queued integer;
begin
  v_queued := private.schedule_match_push_events();
  perform private.request_push_worker();
  return v_queued;
end;
$function$;

alter function private.run_push_minute() owner to postgres;
revoke execute on function private.run_push_minute()
from public, anon, authenticated, service_role;

do $extensions$
begin
  if exists (
    select 1 from pg_catalog.pg_available_extensions where name = 'pg_net'
  ) and not exists (
    select 1 from pg_catalog.pg_extension where extname = 'pg_net'
  ) then
    begin
      execute 'create extension pg_net with schema extensions';
    exception when others then
      null;
    end;
  end if;

  if exists (
    select 1 from pg_catalog.pg_available_extensions where name = 'pg_cron'
  ) and not exists (
    select 1 from pg_catalog.pg_extension where extname = 'pg_cron'
  ) then
    begin
      execute 'create extension pg_cron with schema pg_catalog';
    exception when others then
      null;
    end;
  end if;

  if pg_catalog.to_regproc('cron.schedule') is not null then
    execute $cron$
      select cron.schedule(
        'pro7-web-push-minute',
        '* * * * *',
        'select private.run_push_minute();'
      )
    $cron$;
  end if;
end;
$extensions$;
