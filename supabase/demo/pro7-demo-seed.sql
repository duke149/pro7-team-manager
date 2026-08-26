begin;

do $pro7_demo_seed$
declare
  v_marker constant text := 'PRO7-DEMO';
  v_team_id uuid;
  v_actor_user_id uuid;
  v_team_count integer;
  v_demo_user_ids uuid[];
  v_player_count integer;
  v_period_start date := pg_catalog.date_trunc('month', current_date)::date;
  v_scheduled_at timestamptz := pg_catalog.date_trunc('day', pg_catalog.clock_timestamp()) + interval '10 days 19 hours';
  v_completed_at timestamptz := pg_catalog.date_trunc('day', pg_catalog.clock_timestamp()) - interval '7 days' + interval '19 hours';
  v_cancelled_at timestamptz := pg_catalog.date_trunc('day', pg_catalog.clock_timestamp()) + interval '20 days 19 hours';
begin
  select count(*)
  into v_team_count
  from public.teams as team
  where team.slug = 'pro7-fc';

  if v_team_count <> 1 then
    raise exception using
      errcode = 'P0002',
      message = 'PRO7-DEMO requires exactly one public.teams row with slug pro7-fc';
  end if;

  select team.id, team.owner_user_id
  into strict v_team_id, v_actor_user_id
  from public.teams as team
  where team.slug = 'pro7-fc';

  if not exists (
    select 1
    from public.memberships as membership
    where membership.team_id = v_team_id
      and membership.user_id = v_actor_user_id
      and membership.status = 'active'
  ) then
    raise exception using
      errcode = '23503',
      message = 'PRO7-DEMO requires an active owner membership for pro7-fc';
  end if;

  select pg_catalog.array_agg(candidate.user_id order by candidate.user_id)
  into v_demo_user_ids
  from (
    select membership.user_id
    from public.memberships as membership
    join public.team_player_profiles as player
      on player.team_id = membership.team_id
     and player.user_id = membership.user_id
    where membership.team_id = v_team_id
      and membership.status = 'active'
    order by membership.user_id
    limit 7
  ) as candidate;

  v_player_count := coalesce(pg_catalog.cardinality(v_demo_user_ids), 0);

  if v_player_count < 1 then
    raise exception using
      errcode = '23514',
      message = 'PRO7-DEMO requires at least one active pro7-fc membership';
  end if;

  if exists (
    select 1 from public.matches as row
    where row.id = any (array[
      '70000000-0000-4000-8000-000000000001'::uuid,
      '70000000-0000-4000-8000-000000000002'::uuid,
      '70000000-0000-4000-8000-000000000003'::uuid
    ]) and (row.team_id <> v_team_id or row.venue not like v_marker || '%')
  ) or exists (
    select 1 from public.match_events as row
    where row.id::text like '70000000-0000-4000-8000-0000000001__'
      and (
        row.team_id <> v_team_id
        or row.match_id <> '70000000-0000-4000-8000-000000000002'
        or row.note not like v_marker || '%'
      )
  ) or exists (
    select 1 from public.team_news as row
    where row.id::text like '70000000-0000-4000-8000-0000000002__'
      and (row.team_id <> v_team_id or row.body not like v_marker || '%')
  ) or exists (
    select 1 from public.match_tactics as row
    where row.id::text like '70000000-0000-4000-8000-0000000003__'
      and (
        row.team_id <> v_team_id
        or row.match_id <> '70000000-0000-4000-8000-000000000001'
        or row.instructions not like v_marker || '%'
      )
  ) or exists (
    select 1 from public.lineup_slots as row
    where row.id::text like '70000000-0000-4000-8000-000000001___'
      and (
        row.team_id <> v_team_id
        or not exists (
          select 1 from public.match_tactics as marker
          where marker.id = row.tactic_id
            and marker.team_id = row.team_id
            and marker.id = any (array[
              '70000000-0000-4000-8000-000000000301'::uuid,
              '70000000-0000-4000-8000-000000000302'::uuid
            ])
            and marker.instructions like v_marker || '%'
        )
      )
  ) or exists (
    select 1 from public.finance_entries as row
    where row.id::text like '70000000-0000-4000-8000-0000000004__'
      and (row.team_id <> v_team_id or row.description not like v_marker || '%')
  ) or exists (
    select 1 from public.member_dues as row
    where row.id::text like '70000000-0000-4000-8000-0000000005__'
      and (
        row.team_id <> v_team_id
        or not exists (
          select 1 from private.audit_events as marker
          where marker.request_id = v_marker || '-DUE-SNAPSHOT'
            and marker.table_name = 'member_dues'
            and marker.row_key = pg_catalog.jsonb_build_object('id', row.id)
            and marker.new_data = pg_catalog.to_jsonb(row)
        )
      )
  ) or exists (
    select 1 from public.notifications as row
    where row.id::text like '70000000-0000-4000-8000-0000000006__'
      and (
        row.team_id <> v_team_id
        or row.source_entity <> 'match'
        or row.source_id <> '70000000-0000-4000-8000-000000000001'
        or row.body not like v_marker || '%'
      )
  ) then
    raise exception using
      errcode = '23505',
      message = 'PRO7-DEMO deterministic identifier collides with an unmarked row';
  end if;

  if exists (
    select 1
    from public.member_dues as due
    where due.team_id = v_team_id
      and due.user_id = v_demo_user_ids[1]
      and due.period_start = any (array[
        v_period_start,
        (v_period_start - interval '1 month')::date,
        (v_period_start - interval '2 months')::date
      ])
      and due.id <> all (array['70000000-0000-4000-8000-000000000501'::uuid, '70000000-0000-4000-8000-000000000502'::uuid, '70000000-0000-4000-8000-000000000503'::uuid])
  ) then
    raise exception using
      errcode = '23505',
      message = 'PRO7-DEMO would collide with an existing member due period';
  end if;

  insert into public.matches (
    id, team_id, opponent, starts_at, venue, is_home, rsvp_deadline, status,
    team_score, opponent_score, cancelled_at, cancelled_by_user_id, created_by_user_id
  ) values
    ('70000000-0000-4000-8000-000000000001', v_team_id, 'Saigon Comets', v_scheduled_at, v_marker || ' • Riverside Pitch', true, v_scheduled_at - interval '1 day', 'scheduled', null, null, null, null, v_actor_user_id),
    ('70000000-0000-4000-8000-000000000002', v_team_id, 'Mekong United', v_completed_at, v_marker || ' • District Arena', false, v_completed_at - interval '2 days', 'completed', 3, 1, null, null, v_actor_user_id),
    ('70000000-0000-4000-8000-000000000003', v_team_id, 'Lotus Athletic', v_cancelled_at, v_marker || ' • North Field', true, v_cancelled_at - interval '2 days', 'cancelled', null, null, v_cancelled_at - interval '5 days', v_actor_user_id, v_actor_user_id)
  on conflict (id) do update set
    opponent = excluded.opponent,
    starts_at = excluded.starts_at,
    venue = excluded.venue,
    is_home = excluded.is_home,
    rsvp_deadline = excluded.rsvp_deadline,
    status = excluded.status,
    team_score = excluded.team_score,
    opponent_score = excluded.opponent_score,
    cancelled_at = excluded.cancelled_at,
    cancelled_by_user_id = excluded.cancelled_by_user_id;

  insert into public.match_attendance (
    match_id, team_id, user_id, status, note, responded_at, invited_by_user_id
  ) values
    ('70000000-0000-4000-8000-000000000001', v_team_id, v_demo_user_ids[1], 'pending', v_marker || ' pending response', null, v_actor_user_id),
    ('70000000-0000-4000-8000-000000000002', v_team_id, v_demo_user_ids[1], 'available', v_marker || ' available response', pg_catalog.now(), v_actor_user_id),
    ('70000000-0000-4000-8000-000000000003', v_team_id, v_demo_user_ids[1], 'unavailable', v_marker || ' unavailable response', pg_catalog.now(), v_actor_user_id)
  on conflict (match_id, user_id) do update set
    status = excluded.status,
    note = excluded.note,
    responded_at = excluded.responded_at,
    invited_by_user_id = excluded.invited_by_user_id;

  insert into public.match_events (
    id, match_id, team_id, minute, sequence_no, event_type, team_side,
    player_user_id, secondary_user_id, note, created_by_user_id
  ) values
    ('70000000-0000-4000-8000-000000000101', '70000000-0000-4000-8000-000000000002', v_team_id, 12, 1, 'goal', 'team', v_demo_user_ids[1], null, v_marker || ' opening goal', v_actor_user_id),
    ('70000000-0000-4000-8000-000000000102', '70000000-0000-4000-8000-000000000002', v_team_id, 31, 1, 'goal', 'opponent', null, null, v_marker || ' opponent equalizer', v_actor_user_id),
    ('70000000-0000-4000-8000-000000000103', '70000000-0000-4000-8000-000000000002', v_team_id, 54, 1, 'goal', 'team', v_demo_user_ids[1], null, v_marker || ' second goal', v_actor_user_id),
    ('70000000-0000-4000-8000-000000000104', '70000000-0000-4000-8000-000000000002', v_team_id, 70, 1, 'substitution', 'team', v_demo_user_ids[1], v_demo_user_ids[1], v_marker || ' planned substitution', v_actor_user_id),
    ('70000000-0000-4000-8000-000000000105', '70000000-0000-4000-8000-000000000002', v_team_id, 82, 1, 'goal', 'team', v_demo_user_ids[1], null, v_marker || ' winning goal', v_actor_user_id)
  on conflict (id) do update set
    minute = excluded.minute,
    sequence_no = excluded.sequence_no,
    event_type = excluded.event_type,
    team_side = excluded.team_side,
    player_user_id = excluded.player_user_id,
    secondary_user_id = excluded.secondary_user_id,
    note = excluded.note;

  insert into public.match_player_stats (
    match_id, team_id, user_id, minutes_played, goals, assists, rating, is_mvp
  )
  select
    '70000000-0000-4000-8000-000000000002',
    v_team_id,
    selected.user_id,
    case selected.ordinality when 3 then 70 else 90 end,
    case selected.ordinality when 1 then 2 when 2 then 1 else 0 end,
    case selected.ordinality when 1 then 0 else 1 end,
    case selected.ordinality when 1 then 9.1 when 2 then 8.3 else 7.6 end,
    selected.ordinality = 1
  from pg_catalog.unnest(v_demo_user_ids) with ordinality as selected(user_id, ordinality)
  where selected.ordinality <= 3
  on conflict (match_id, user_id) do update set
    minutes_played = excluded.minutes_played,
    goals = excluded.goals,
    assists = excluded.assists,
    rating = excluded.rating,
    is_mvp = excluded.is_mvp;

  insert into public.match_team_stats (match_id, team_id, schema_version, metrics)
  values (
    '70000000-0000-4000-8000-000000000002',
    v_team_id,
    1,
    '{"possession":{"team":57,"opponent":43},"shots":{"team":14,"opponent":8},"shots_on_target":{"team":7,"opponent":3},"corners":{"team":6,"opponent":2}}'
  )
  on conflict (match_id) do update set
    schema_version = excluded.schema_version,
    metrics = excluded.metrics;

  insert into public.team_news (
    id, team_id, title, body, status, published_at, author_user_id
  ) values
    ('70000000-0000-4000-8000-000000000201', v_team_id, 'Demo season kickoff', v_marker || ' published fictional club update.', 'published', pg_catalog.now() - interval '2 days', v_actor_user_id),
    ('70000000-0000-4000-8000-000000000202', v_team_id, 'Demo training notes', v_marker || ' draft fictional club update.', 'draft', null, v_actor_user_id)
  on conflict (id) do update set
    title = excluded.title,
    body = excluded.body,
    status = excluded.status,
    published_at = excluded.published_at;

  insert into public.match_tactics (
    id, team_id, match_id, mode, formation, instructions, pressing,
    defensive_line, version, status, created_by_user_id, applied_by_user_id, applied_at
  ) values
    ('70000000-0000-4000-8000-000000000301', v_team_id, '70000000-0000-4000-8000-000000000001', 'balanced', '2-3-1', v_marker || ' balanced plan.', 'high', 'medium', 1, case when v_player_count = 7 then 'applied' else 'draft' end, v_actor_user_id, case when v_player_count = 7 then v_actor_user_id else null end, case when v_player_count = 7 then pg_catalog.now() else null end),
    ('70000000-0000-4000-8000-000000000302', v_team_id, '70000000-0000-4000-8000-000000000001', 'attacking', '3-2-1', v_marker || ' draft attacking plan.', 'medium', 'high', 1, 'draft', v_actor_user_id, null, null)
  on conflict (id) do update set
    mode = excluded.mode,
    formation = excluded.formation,
    instructions = excluded.instructions,
    pressing = excluded.pressing,
    defensive_line = excluded.defensive_line,
    version = excluded.version,
    status = excluded.status,
    applied_by_user_id = excluded.applied_by_user_id,
    applied_at = excluded.applied_at;

  delete from public.lineup_slots as row
  using public.match_tactics as tactic
  where row.tactic_id = tactic.id
    and row.team_id = tactic.team_id
    and row.id::text like '70000000-0000-4000-8000-000000001___'
    and tactic.id = any (array[
      '70000000-0000-4000-8000-000000000301'::uuid,
      '70000000-0000-4000-8000-000000000302'::uuid
    ])
    and tactic.instructions like v_marker || '%';

  insert into public.lineup_slots (
    id, tactic_id, team_id, user_id, slot_kind, slot_key, role_label, shirt_number, x, y
  )
  select
    ('70000000-0000-4000-8000-' || pg_catalog.lpad((tactic.id_offset + selected.ordinality)::text, 12, '0'))::uuid,
    tactic.id,
    v_team_id,
    selected.user_id,
    case when tactic.id = '70000000-0000-4000-8000-000000000302' and selected.ordinality = v_player_count then 'bench' else 'starter' end,
    case when tactic.id = '70000000-0000-4000-8000-000000000302' and selected.ordinality = v_player_count then 'bench-' || selected.ordinality::text when selected.ordinality = 1 then 'gk' else 'player-' || selected.ordinality::text end,
    case when selected.ordinality = 1 then 'GK' when selected.ordinality <= 3 then 'DEF' when selected.ordinality <= 5 then 'MID' else 'ATT' end,
    coalesce(player.shirt_number, selected.ordinality::smallint),
    case selected.ordinality when 1 then 50 when 2 then 25 when 3 then 75 when 4 then 25 when 5 then 75 when 6 then 35 else 65 end,
    case selected.ordinality when 1 then 90 when 2 then 68 when 3 then 68 when 4 then 45 when 5 then 45 else 20 end
  from pg_catalog.unnest(v_demo_user_ids) with ordinality as selected(user_id, ordinality)
  join public.team_player_profiles as player
    on player.team_id = v_team_id
   and player.user_id = selected.user_id
  cross join (values
    ('70000000-0000-4000-8000-000000000301'::uuid, 1000::bigint),
    ('70000000-0000-4000-8000-000000000302'::uuid, 1010::bigint)
  ) as tactic(id, id_offset)
  on conflict (id) do update set
    user_id = excluded.user_id,
    slot_kind = excluded.slot_kind,
    slot_key = excluded.slot_key,
    role_label = excluded.role_label,
    shirt_number = excluded.shirt_number,
    x = excluded.x,
    y = excluded.y;

  insert into public.finance_entries (
    id, team_id, direction, amount_vnd, category, occurred_on, description,
    created_by_user_id, voided_at, voided_by_user_id, void_reason
  ) values
    ('70000000-0000-4000-8000-000000000401', v_team_id, 'income', 500000, v_marker || '-DUES', v_period_start + 2, v_marker || ' paid member dues.', v_actor_user_id, null, null, null),
    ('70000000-0000-4000-8000-000000000402', v_team_id, 'expense', 1200000, v_marker || '-PITCH', v_period_start + 4, v_marker || ' fictional pitch rental.', v_actor_user_id, null, null, null),
    ('70000000-0000-4000-8000-000000000403', v_team_id, 'expense', 250000, v_marker || '-EQUIPMENT', v_period_start + 5, v_marker || ' fictional duplicate equipment charge.', v_actor_user_id, pg_catalog.now(), v_actor_user_id, v_marker || ' voided duplicate')
  on conflict (id) do update set
    direction = excluded.direction,
    amount_vnd = excluded.amount_vnd,
    category = excluded.category,
    occurred_on = excluded.occurred_on,
    description = excluded.description,
    voided_at = excluded.voided_at,
    voided_by_user_id = excluded.voided_by_user_id,
    void_reason = excluded.void_reason;

  insert into public.member_dues (
    id, team_id, user_id, period_start, amount_vnd, due_date, status,
    paid_at, finance_entry_id, created_by_user_id
  ) values
    ('70000000-0000-4000-8000-000000000501', v_team_id, v_demo_user_ids[1], v_period_start, 500000, v_period_start + 10, 'paid', pg_catalog.now(), '70000000-0000-4000-8000-000000000401', v_actor_user_id),
    ('70000000-0000-4000-8000-000000000502', v_team_id, v_demo_user_ids[1], (v_period_start - interval '1 month')::date, 500000, (v_period_start - interval '1 month')::date + 10, 'pending', null, null, v_actor_user_id),
    ('70000000-0000-4000-8000-000000000503', v_team_id, v_demo_user_ids[1], (v_period_start - interval '2 months')::date, 500000, (v_period_start - interval '2 months')::date + 10, 'waived', null, null, v_actor_user_id)
  on conflict (id) do update set
    user_id = excluded.user_id,
    period_start = excluded.period_start,
    amount_vnd = excluded.amount_vnd,
    due_date = excluded.due_date,
    status = excluded.status,
    paid_at = excluded.paid_at,
    finance_entry_id = excluded.finance_entry_id;

  delete from private.audit_events as marker
  where marker.request_id = v_marker || '-DUE-SNAPSHOT'
    and marker.table_name = 'member_dues'
    and marker.row_key ->> 'id' = any (array[
      '70000000-0000-4000-8000-000000000501',
      '70000000-0000-4000-8000-000000000502',
      '70000000-0000-4000-8000-000000000503'
    ]);

  insert into private.audit_events (
    actor_user_id, team_id, table_name, action, row_key, old_data, new_data, request_id
  )
  select
    v_actor_user_id,
    due.team_id,
    'member_dues',
    'INSERT',
    pg_catalog.jsonb_build_object('id', due.id),
    null,
    pg_catalog.to_jsonb(due),
    v_marker || '-DUE-SNAPSHOT'
  from public.member_dues as due
  where due.id = any (array[
    '70000000-0000-4000-8000-000000000501'::uuid,
    '70000000-0000-4000-8000-000000000502'::uuid,
    '70000000-0000-4000-8000-000000000503'::uuid
  ]);

  insert into public.notifications (
    id, team_id, user_id, type, source_entity, source_id, title, body, target_path
  ) values
    ('70000000-0000-4000-8000-000000000601', v_team_id, v_demo_user_ids[1], 'match_invitation', 'match', '70000000-0000-4000-8000-000000000001', 'Demo match invitation', v_marker || ' fictional invitation.', '/teams/pro7-fc/matches/70000000-0000-4000-8000-000000000001'),
    ('70000000-0000-4000-8000-000000000602', v_team_id, v_demo_user_ids[1], 'match_reminder', 'match', '70000000-0000-4000-8000-000000000001', 'Demo match reminder', v_marker || ' fictional reminder.', '/teams/pro7-fc/matches/70000000-0000-4000-8000-000000000001')
  on conflict (id) do update set
    user_id = excluded.user_id,
    type = excluded.type,
    source_id = excluded.source_id,
    title = excluded.title,
    body = excluded.body,
    target_path = excluded.target_path,
    read_at = null;
end;
$pro7_demo_seed$;

with active_players as (
  select membership.user_id, player.player_status
  from public.memberships as membership
  join public.teams as team on team.id = membership.team_id
  join public.team_player_profiles as player
    on player.team_id = membership.team_id
   and player.user_id = membership.user_id
  where team.slug = 'pro7-fc'
    and membership.status = 'active'
), coverage as (
  select
    (select pg_catalog.count(*) from (select user_id from active_players order by user_id limit 7) as selected) as player_count,
    (select pg_catalog.count(*) from active_players where player_status = 'injured') as injured_player_count
)
select pg_catalog.jsonb_build_object(
  'marker', 'PRO7-DEMO',
  'player_count', coverage.player_count,
  'injured_player_count', coverage.injured_player_count,
  'injured_coverage', case when coverage.injured_player_count > 0 then 'available' else 'deferred' end
)
from coverage;

commit;
