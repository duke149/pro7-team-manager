\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email) values
  ('96000000-0000-4000-8000-000000000001', 'push-owner@example.com'),
  ('96000000-0000-4000-8000-000000000002', 'push-member-a@example.com'),
  ('96000000-0000-4000-8000-000000000003', 'push-member-b@example.com'),
  ('96000000-0000-4000-8000-000000000004', 'push-member-no-device@example.com'),
  ('96000000-0000-4000-8000-000000000005', 'push-outsider@example.com');

insert into public.teams (id, name, slug, owner_user_id) values
  ('96000000-0000-4000-8000-000000000010', 'Push FC', 'push-fc', '96000000-0000-4000-8000-000000000001');

insert into public.memberships (team_id, user_id, role_id)
select '96000000-0000-4000-8000-000000000010', member.user_id, role.id
from (values
  ('96000000-0000-4000-8000-000000000002'::uuid),
  ('96000000-0000-4000-8000-000000000003'::uuid),
  ('96000000-0000-4000-8000-000000000004'::uuid)
) as member(user_id)
join public.roles as role
  on role.team_id = '96000000-0000-4000-8000-000000000010'
 and role.slug = 'member';

insert into public.matches (
  id, team_id, opponent, starts_at, venue, is_home, rsvp_deadline, status, created_by_user_id
) values
  ('96000000-0000-4000-8000-000000000101', '96000000-0000-4000-8000-000000000010', 'FC Invitation', pg_catalog.clock_timestamp() + interval '30 hours', 'Pitch 1', true, pg_catalog.clock_timestamp() + interval '29 hours', 'scheduled', '96000000-0000-4000-8000-000000000001'),
  ('96000000-0000-4000-8000-000000000102', '96000000-0000-4000-8000-000000000010', 'FC Configured', pg_catalog.clock_timestamp() + interval '23 hours', 'Pitch 2', true, pg_catalog.clock_timestamp() + interval '22 hours', 'scheduled', '96000000-0000-4000-8000-000000000001'),
  ('96000000-0000-4000-8000-000000000103', '96000000-0000-4000-8000-000000000010', 'FC Two Hour', pg_catalog.clock_timestamp() + interval '90 minutes', 'Pitch 3', false, pg_catalog.clock_timestamp() + interval '80 minutes', 'scheduled', '96000000-0000-4000-8000-000000000001'),
  ('96000000-0000-4000-8000-000000000104', '96000000-0000-4000-8000-000000000010', 'FC Disabled', pg_catalog.clock_timestamp() + interval '20 hours', 'Pitch 4', true, pg_catalog.clock_timestamp() + interval '19 hours', 'scheduled', '96000000-0000-4000-8000-000000000001');

select pg_catalog.set_config('request.jwt.claim.sub', '96000000-0000-4000-8000-000000000002', true);
set local role authenticated;
select public.upsert_push_subscription(
  'https://push.example/device-a',
  'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  'BBBBBBBBBBBBBBBBBBBBBB',
  null,
  'PRO7 test browser A'
);
select public.upsert_push_subscription(
  'https://push.example/device-b',
  'CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC',
  'DDDDDDDDDDDDDDDDDDDDDD',
  null,
  'PRO7 test browser B'
);

do $assert$
begin
  if (select count(*) from public.push_subscriptions) <> 2
    or exists (select 1 from public.push_subscriptions where user_id <> auth.uid()) then
    raise exception 'own-user subscription SELECT RLS failed';
  end if;
  begin
    insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
    values (
      auth.uid(), 'https://push.example/direct-write',
      'EEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE',
      'FFFFFFFFFFFFFFFFFFFFFF'
    );
    raise exception 'direct subscription INSERT unexpectedly succeeded';
  exception when insufficient_privilege then
    null;
  end;
end;
$assert$;
reset role;

select pg_catalog.set_config('request.jwt.claim.sub', '96000000-0000-4000-8000-000000000003', true);
set local role authenticated;
select public.upsert_push_subscription(
  'https://push.example/device-c',
  'GGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG',
  'HHHHHHHHHHHHHHHHHHHHHH',
  null,
  'PRO7 test browser C'
);
reset role;

select pg_catalog.set_config('request.jwt.claim.sub', '96000000-0000-4000-8000-000000000001', true);
set local role authenticated;

do $assert$
declare
  v_before integer;
begin
  select count(*) into v_before from public.match_attendance;
  begin
    perform public.invite_match_attendance(
      '96000000-0000-4000-8000-000000000010',
      '96000000-0000-4000-8000-000000000101',
      array[
        '96000000-0000-4000-8000-000000000002'::uuid,
        '96000000-0000-4000-8000-000000000005'::uuid
      ]
    );
    raise exception 'invalid invitation unexpectedly succeeded';
  exception when foreign_key_violation then
    null;
  end;
  if (select count(*) from public.match_attendance) <> v_before then
    raise exception 'invalid invitation was not atomic';
  end if;
end;
$assert$;

select public.invite_match_attendance(
  '96000000-0000-4000-8000-000000000010',
  '96000000-0000-4000-8000-000000000101',
  array[
    '96000000-0000-4000-8000-000000000002'::uuid,
    '96000000-0000-4000-8000-000000000003'::uuid,
    '96000000-0000-4000-8000-000000000004'::uuid
  ]
);
select public.invite_match_attendance(
  '96000000-0000-4000-8000-000000000010',
  '96000000-0000-4000-8000-000000000101',
  array[
    '96000000-0000-4000-8000-000000000002'::uuid,
    '96000000-0000-4000-8000-000000000003'::uuid,
    '96000000-0000-4000-8000-000000000004'::uuid
  ]
);
select public.remind_match_attendance(
  '96000000-0000-4000-8000-000000000010',
  '96000000-0000-4000-8000-000000000101'
);
select public.remind_match_attendance(
  '96000000-0000-4000-8000-000000000010',
  '96000000-0000-4000-8000-000000000101'
);

select public.invite_match_attendance(
  '96000000-0000-4000-8000-000000000010',
  '96000000-0000-4000-8000-000000000102',
  array[
    '96000000-0000-4000-8000-000000000002'::uuid,
    '96000000-0000-4000-8000-000000000003'::uuid
  ]
);
select public.respond_match_attendance(
  '96000000-0000-4000-8000-000000000010',
  '96000000-0000-4000-8000-000000000102',
  '96000000-0000-4000-8000-000000000003',
  'available',
  null,
  (select updated_at from public.match_attendance where match_id = '96000000-0000-4000-8000-000000000102' and user_id = '96000000-0000-4000-8000-000000000003')
);
reset role;

do $assert$
begin
  if (select count(*) from public.match_attendance where match_id = '96000000-0000-4000-8000-000000000101') <> 3 then
    raise exception 'invitation retry duplicated attendance';
  end if;
  if (select count(*) from private.push_outbox where match_id = '96000000-0000-4000-8000-000000000101' and event_kind = 'invitation') <> 3 then
    raise exception 'invitation outbox is not idempotent';
  end if;
  if (select count(*) from private.push_outbox where match_id = '96000000-0000-4000-8000-000000000101' and event_kind = 'manual_reminder') <> 3 then
    raise exception 'manual reminder minute bucket is not idempotent';
  end if;
  if exists (
    select 1 from public.notifications
    where source_id = '96000000-0000-4000-8000-000000000101'
      and target_path !~ '/rsvp$'
  ) then
    raise exception 'notification does not target dedicated RSVP';
  end if;
end;
$assert$;

select private.schedule_match_push_events();

do $assert$
begin
  if (select count(*) from private.push_outbox where match_id = '96000000-0000-4000-8000-000000000102' and event_key = 'configured:24') <> 1
    or exists (
      select 1 from private.push_outbox
      where match_id = '96000000-0000-4000-8000-000000000102'
        and user_id = '96000000-0000-4000-8000-000000000003'
        and event_kind in ('configured_reminder', 'two_hour_reminder')
    ) then
    raise exception 'configured scheduler did not target pending active members exactly once';
  end if;
end;
$assert$;

update public.team_settings
set settings = settings || '{"notifications":{"matchInvitations":true,"matchReminders":true,"reminderHoursBefore":2}}'::jsonb
where team_id = '96000000-0000-4000-8000-000000000010';

select pg_catalog.set_config('request.jwt.claim.sub', '96000000-0000-4000-8000-000000000001', true);
set local role authenticated;
select public.invite_match_attendance(
  '96000000-0000-4000-8000-000000000010',
  '96000000-0000-4000-8000-000000000103',
  array[
    '96000000-0000-4000-8000-000000000002'::uuid,
    '96000000-0000-4000-8000-000000000003'::uuid
  ]
);
select public.respond_match_attendance(
  '96000000-0000-4000-8000-000000000010',
  '96000000-0000-4000-8000-000000000103',
  '96000000-0000-4000-8000-000000000003',
  'available',
  null,
  (select updated_at from public.match_attendance where match_id = '96000000-0000-4000-8000-000000000103' and user_id = '96000000-0000-4000-8000-000000000003')
);
reset role;

select private.schedule_match_push_events();
select private.schedule_match_push_events();

do $assert$
begin
  if (select count(*) from private.push_outbox where match_id = '96000000-0000-4000-8000-000000000103' and event_key = 'fixed:2h') <> 1
    or exists (select 1 from private.push_outbox where match_id = '96000000-0000-4000-8000-000000000103' and event_key = 'configured:2')
    or exists (
      select 1 from private.push_outbox
      where match_id = '96000000-0000-4000-8000-000000000103'
        and user_id = '96000000-0000-4000-8000-000000000003'
        and event_kind in ('configured_reminder', 'two_hour_reminder')
    ) then
    raise exception 'two-hour scheduler duplicated or targeted a responded member';
  end if;
end;
$assert$;

update public.team_settings
set settings = settings || '{"notifications":{"matchInvitations":false,"matchReminders":false,"reminderHoursBefore":24}}'::jsonb
where team_id = '96000000-0000-4000-8000-000000000010';

select pg_catalog.set_config('request.jwt.claim.sub', '96000000-0000-4000-8000-000000000001', true);
set local role authenticated;
select public.invite_match_attendance(
  '96000000-0000-4000-8000-000000000010',
  '96000000-0000-4000-8000-000000000104',
  array['96000000-0000-4000-8000-000000000002'::uuid]
);
reset role;
select private.schedule_match_push_events();

do $assert$
begin
  if not exists (
    select 1 from public.notifications
    where source_id = '96000000-0000-4000-8000-000000000104' and type = 'match_invitation'
  ) or exists (
    select 1 from private.push_outbox where match_id = '96000000-0000-4000-8000-000000000104'
  ) then
    raise exception 'disabled push setting changed durable notification or queued push';
  end if;
end;
$assert$;

create temporary table claimed_push_deliveries as
select * from public.claim_push_deliveries(100) with no data;
grant select, insert on table claimed_push_deliveries to service_role;

do $assert$
begin
  if pg_catalog.has_function_privilege('authenticated', 'public.claim_push_deliveries(integer)', 'EXECUTE')
    or not pg_catalog.has_function_privilege('service_role', 'public.claim_push_deliveries(integer)', 'EXECUTE')
    or pg_catalog.has_function_privilege('authenticated', 'public.settle_push_delivery(uuid,text,text)', 'EXECUTE')
    or not pg_catalog.has_function_privilege('service_role', 'public.settle_push_delivery(uuid,text,text)', 'EXECUTE') then
    raise exception 'delivery RPC ACL is not service-only';
  end if;
end;
$assert$;

set local role service_role;
insert into claimed_push_deliveries select * from public.claim_push_deliveries(100);
reset role;

do $assert$
declare
  v_outbox uuid;
begin
  if not exists (
    select 1 from private.push_outbox
    where user_id = '96000000-0000-4000-8000-000000000004' and status = 'no_subscription'
  ) then
    raise exception 'events without a device were not completed honestly';
  end if;
  select outbox_id into v_outbox
  from claimed_push_deliveries
  where endpoint = 'https://push.example/device-a'
  order by event_kind, delivery_id
  limit 1;
  if v_outbox is null
    or (select count(*) from claimed_push_deliveries where outbox_id = v_outbox) <> 2 then
    raise exception 'one user event did not expand to both device deliveries';
  end if;
end;
$assert$;

select pg_catalog.set_config(
  'pro7.max_retry_delivery',
  (select delivery_id::text from claimed_push_deliveries where endpoint = 'https://push.example/device-c' order by event_kind, delivery_id limit 1),
  true
);
update private.push_deliveries
set attempts = 20
where id = pg_catalog.current_setting('pro7.max_retry_delivery')::uuid;
set local role service_role;
select public.settle_push_delivery(pg_catalog.current_setting('pro7.max_retry_delivery')::uuid, 'retry', 'provider_503');
reset role;

do $assert$
begin
  if not exists (
    select 1 from private.push_deliveries
    where id = pg_catalog.current_setting('pro7.max_retry_delivery')::uuid and status = 'failed'
  ) or not exists (
    select 1
    from private.push_outbox as queued
    join private.push_deliveries as delivery on delivery.outbox_id = queued.id
    where delivery.id = pg_catalog.current_setting('pro7.max_retry_delivery')::uuid
      and queued.status = 'completed'
  ) then
    raise exception 'maximum retry remained pending forever';
  end if;
end;
$assert$;

select pg_catalog.set_config(
  'pro7.sent_delivery',
  (select delivery_id::text from claimed_push_deliveries where endpoint = 'https://push.example/device-a' order by event_kind, delivery_id limit 1),
  true
);
select pg_catalog.set_config(
  'pro7.retry_delivery',
  (select retry.delivery_id::text
   from claimed_push_deliveries as retry
   join claimed_push_deliveries as sent on sent.outbox_id = retry.outbox_id
   where sent.delivery_id::text = pg_catalog.current_setting('pro7.sent_delivery')
     and retry.endpoint = 'https://push.example/device-b'
   limit 1),
  true
);

set local role service_role;
select public.settle_push_delivery(pg_catalog.current_setting('pro7.sent_delivery')::uuid, 'sent', null);
select public.settle_push_delivery(pg_catalog.current_setting('pro7.retry_delivery')::uuid, 'retry', 'provider_503');
reset role;

update private.push_deliveries
set next_attempt_at = pg_catalog.clock_timestamp()
where id = pg_catalog.current_setting('pro7.retry_delivery')::uuid;
truncate claimed_push_deliveries;
set local role service_role;
insert into claimed_push_deliveries select * from public.claim_push_deliveries(100);
reset role;

do $assert$
begin
  if exists (
    select 1 from claimed_push_deliveries
    where delivery_id::text = pg_catalog.current_setting('pro7.sent_delivery')
  ) or not exists (
    select 1 from claimed_push_deliveries
    where delivery_id::text = pg_catalog.current_setting('pro7.retry_delivery')
      and attempt = 2
  ) then
    raise exception 'per-device retry resent a successful device or lost retry state';
  end if;
end;
$assert$;

set local role service_role;
select public.settle_push_delivery(pg_catalog.current_setting('pro7.retry_delivery')::uuid, 'expired', 'provider_410');
reset role;

do $assert$
begin
  if exists (select 1 from public.push_subscriptions where endpoint = 'https://push.example/device-b') then
    raise exception 'expired endpoint was not deleted';
  end if;
end;
$assert$;

update public.teams set slug = 'push-fc-renamed'
where id = '96000000-0000-4000-8000-000000000010';

do $assert$
begin
  if exists (
    select 1 from public.notifications
    where team_id = '96000000-0000-4000-8000-000000000010'
      and target_path !~ '^/teams/push-fc-renamed/.+/rsvp$'
  ) or exists (
    select 1 from private.push_outbox
    where team_id = '96000000-0000-4000-8000-000000000010'
      and status in ('pending', 'processing')
      and target_path !~ '^/teams/push-fc-renamed/.+/rsvp$'
  ) then
    raise exception 'team slug change left a stale unfinished RSVP target';
  end if;
end;
$assert$;

rollback;

do $assert$
begin
  if exists (select 1 from public.teams where id = '96000000-0000-4000-8000-000000000010')
    or exists (select 1 from public.push_subscriptions where user_id::text like '96000000-%')
    or exists (select 1 from private.push_outbox where team_id = '96000000-0000-4000-8000-000000000010')
    or exists (select 1 from private.push_deliveries where outbox_id in (select id from private.push_outbox where team_id = '96000000-0000-4000-8000-000000000010')) then
    raise exception 'web push verifier left fixture residue';
  end if;
end;
$assert$;

select 'web_push_live_verification_ok_rollback_zero_fixtures' as result;
