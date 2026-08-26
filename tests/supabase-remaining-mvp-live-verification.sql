-- Run only on a disposable PostgreSQL 17 database after all migrations.
\set ON_ERROR_STOP on

begin;

do $verification$
declare
  v_owner constant uuid := '00000000-0000-4000-8000-000000008101';
  v_admin constant uuid := '00000000-0000-4000-8000-000000008102';
  v_member constant uuid := '00000000-0000-4000-8000-000000008103';
  v_player4 constant uuid := '00000000-0000-4000-8000-000000008104';
  v_player5 constant uuid := '00000000-0000-4000-8000-000000008105';
  v_player6 constant uuid := '00000000-0000-4000-8000-000000008106';
  v_player7 constant uuid := '00000000-0000-4000-8000-000000008107';
  v_unrelated constant uuid := '00000000-0000-4000-8000-000000008108';
  v_team constant uuid := '00000000-0000-4000-8000-000000008201';
  v_other_team constant uuid := '00000000-0000-4000-8000-000000008202';
  v_admin_role uuid;
  v_member_role uuid;
  v_match_id uuid;
  v_cancelled_match_id uuid;
  v_tactic_id uuid;
  v_entry_id uuid;
  v_due_id uuid;
  v_updated_at timestamptz;
  v_count integer;
  v_failed boolean;
  v_state text;
  v_slots jsonb;
begin
  insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
  select user_id, email, pg_catalog.now(), '{}'::jsonb
  from (values
    (v_owner, 'remaining-owner@example.test'),
    (v_admin, 'remaining-admin@example.test'),
    (v_member, 'remaining-member@example.test'),
    (v_player4, 'remaining-player4@example.test'),
    (v_player5, 'remaining-player5@example.test'),
    (v_player6, 'remaining-player6@example.test'),
    (v_player7, 'remaining-player7@example.test'),
    (v_unrelated, 'remaining-unrelated@example.test')
  ) as users(user_id, email);

  insert into public.teams (id, name, slug, owner_user_id) values
    (v_team, 'Remaining MVP Team', 'remaining-mvp-team-20260826', v_owner),
    (v_other_team, 'Remaining Other Team', 'remaining-other-team-20260826', v_unrelated);

  select id into strict v_admin_role from public.roles where team_id = v_team and slug = 'admin';
  select id into strict v_member_role from public.roles where team_id = v_team and slug = 'member';

  insert into public.memberships (team_id, user_id, role_id, status) values
    (v_team, v_admin, v_admin_role, 'active'),
    (v_team, v_member, v_member_role, 'active'),
    (v_team, v_player4, v_member_role, 'active'),
    (v_team, v_player5, v_member_role, 'active'),
    (v_team, v_player6, v_member_role, 'active'),
    (v_team, v_player7, v_member_role, 'active');

  perform pg_catalog.set_config('request.jwt.claim.sub', v_owner::text, true);
  perform pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.jsonb_build_object('sub', v_owner, 'role', 'authenticated')::text,
    true
  );
  execute 'set local role authenticated';

  select public.manage_match(
    'create', v_team, null, 'FC PostgreSQL', pg_catalog.now() + interval '10 days',
    'Pitch 7', true, pg_catalog.now() + interval '5 days', null, null, null
  ) into v_match_id;
  select public.manage_match(
    'create', v_team, null, 'FC Cancel', pg_catalog.now() + interval '11 days',
    null, false, pg_catalog.now() + interval '6 days', null, null, null
  ) into v_cancelled_match_id;

  execute 'reset role';
  select updated_at into strict v_updated_at from public.matches where id = v_cancelled_match_id;
  execute 'set local role authenticated';
  perform public.manage_match(
    'cancel', v_team, v_cancelled_match_id, null, null, null, null, null, null, null, v_updated_at
  );

  execute 'reset role';
  if (select status from public.matches where id = v_cancelled_match_id) <> 'cancelled'
    or exists (select 1 from public.matches where id = v_cancelled_match_id and cancelled_at is null) then
    raise exception 'remaining MVP live: cancellation semantics differ';
  end if;

  select updated_at into strict v_updated_at from public.matches where id = v_cancelled_match_id;
  execute 'set local role authenticated';
  v_failed := false;
  begin
    perform public.manage_match(
      'complete', v_team, v_cancelled_match_id, null, null, null, null, null,
      1::smallint, 0::smallint, v_updated_at
    );
  exception when others then
    v_failed := true;
    v_state := sqlstate;
  end;
  if not v_failed or v_state <> '55000' then
    raise exception 'remaining MVP live: cancelled match changed again (state=%)', v_state;
  end if;

  perform pg_catalog.set_config('request.jwt.claim.sub', v_admin::text, true);
  perform pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.jsonb_build_object('sub', v_admin, 'role', 'authenticated')::text,
    true
  );
  perform public.invite_match_attendance(
    v_team,
    v_match_id,
    array[v_owner, v_admin, v_member, v_player4, v_player5, v_player6, v_player7]
  );
  perform public.invite_match_attendance(
    v_team,
    v_match_id,
    array[v_owner, v_admin, v_member, v_player4, v_player5, v_player6, v_player7]
  );
  execute 'reset role';

  select count(*) into v_count from public.match_attendance where match_id = v_match_id;
  if v_count <> 7 then
    raise exception 'remaining MVP live: invitation retry was not idempotent (%)', v_count;
  end if;
  if exists (select 1 from public.match_attendance where match_id = v_match_id and status <> 'pending') then
    raise exception 'remaining MVP live: new invitation status differs';
  end if;

  execute 'set local role authenticated';
  v_failed := false;
  begin
    perform public.invite_match_attendance(v_team, v_match_id, array[v_unrelated]);
  exception when others then
    v_failed := true;
    v_state := sqlstate;
  end;
  if not v_failed or v_state <> '23503' then
    raise exception 'remaining MVP live: cross-team invitation was not denied (state=%)', v_state;
  end if;

  perform pg_catalog.set_config('request.jwt.claim.sub', v_member::text, true);
  perform pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.jsonb_build_object('sub', v_member, 'role', 'authenticated')::text,
    true
  );
  select updated_at into strict v_updated_at
  from public.match_attendance where match_id = v_match_id and user_id = v_member;
  perform public.respond_match_attendance(
    v_team, v_match_id, v_member, 'available', 'Ready', v_updated_at
  );
  select count(*) into v_count
  from public.match_attendance
  where match_id = v_match_id and user_id = v_member
    and status = 'available' and note = 'Ready' and responded_at is not null;
  if v_count <> 1 then
    raise exception 'remaining MVP live: own RSVP did not persist';
  end if;

  select updated_at into strict v_updated_at
  from public.match_attendance where match_id = v_match_id and user_id = v_owner;
  v_failed := false;
  begin
    perform public.respond_match_attendance(
      v_team, v_match_id, v_owner, 'unavailable', null, v_updated_at
    );
  exception when others then
    v_failed := true;
    v_state := sqlstate;
  end;
  if not v_failed or v_state <> '42501' then
    raise exception 'remaining MVP live: member changed another RSVP (state=%)', v_state;
  end if;

  perform pg_catalog.set_config('request.jwt.claim.sub', v_admin::text, true);
  perform pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.jsonb_build_object('sub', v_admin, 'role', 'authenticated')::text,
    true
  );
  select updated_at into strict v_updated_at
  from public.match_attendance where match_id = v_match_id and user_id = v_member;
  perform public.respond_match_attendance(
    v_team, v_match_id, v_member, 'unavailable', 'Admin override', v_updated_at
  );
  execute 'reset role';
  if not exists (
    select 1 from public.match_attendance
    where match_id = v_match_id and user_id = v_member and status = 'unavailable'
  ) or not exists (
    select 1 from private.audit_events
    where team_id = v_team and table_name = 'match_attendance'
      and row_key = pg_catalog.jsonb_build_object('match_id', v_match_id, 'user_id', v_member)
  ) then
    raise exception 'remaining MVP live: Admin RSVP override was not persisted and audited';
  end if;
  execute 'set local role authenticated';

  v_slots := pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object('user_id', v_owner, 'slot_kind', 'starter', 'slot_key', 'gk', 'role_label', 'GK', 'x', 50, 'y', 90),
    pg_catalog.jsonb_build_object('user_id', v_admin, 'slot_kind', 'starter', 'slot_key', 'def-1', 'role_label', 'DEF', 'x', 25, 'y', 68),
    pg_catalog.jsonb_build_object('user_id', v_member, 'slot_kind', 'starter', 'slot_key', 'def-2', 'role_label', 'DEF', 'x', 75, 'y', 68),
    pg_catalog.jsonb_build_object('user_id', v_player4, 'slot_kind', 'starter', 'slot_key', 'mid-1', 'role_label', 'MID', 'x', 20, 'y', 42),
    pg_catalog.jsonb_build_object('user_id', v_player5, 'slot_kind', 'starter', 'slot_key', 'mid-2', 'role_label', 'MID', 'x', 50, 'y', 40),
    pg_catalog.jsonb_build_object('user_id', v_player6, 'slot_kind', 'starter', 'slot_key', 'mid-3', 'role_label', 'MID', 'x', 80, 'y', 42),
    pg_catalog.jsonb_build_object('user_id', v_player7, 'slot_kind', 'starter', 'slot_key', 'att', 'role_label', 'ATT', 'x', 50, 'y', 15)
  );

  perform pg_catalog.set_config('request.jwt.claim.sub', v_admin::text, true);
  perform pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.jsonb_build_object('sub', v_admin, 'role', 'authenticated')::text,
    true
  );
  select public.save_match_tactic(
    v_team, v_match_id, null, 'balanced', '2-3-1', 'Keep shape', 1::smallint,
    'medium', 'medium', v_slots, null
  ) into v_tactic_id;

  perform pg_catalog.set_config('request.jwt.claim.sub', v_member::text, true);
  perform pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.jsonb_build_object('sub', v_member, 'role', 'authenticated')::text,
    true
  );
  select count(*) into v_count from public.match_tactics where id = v_tactic_id;
  if v_count <> 0 then
    raise exception 'remaining MVP live: draft tactic leaked to Member';
  end if;

  perform pg_catalog.set_config('request.jwt.claim.sub', v_admin::text, true);
  perform pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.jsonb_build_object('sub', v_admin, 'role', 'authenticated')::text,
    true
  );
  select updated_at into strict v_updated_at from public.match_tactics where id = v_tactic_id;
  perform public.apply_match_tactic(v_team, v_tactic_id, v_updated_at);

  perform pg_catalog.set_config('request.jwt.claim.sub', v_member::text, true);
  perform pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.jsonb_build_object('sub', v_member, 'role', 'authenticated')::text,
    true
  );
  select count(*) into v_count from public.match_tactics where id = v_tactic_id and status = 'applied';
  if v_count <> 1 or (select count(*) from public.lineup_slots where tactic_id = v_tactic_id) <> 7 then
    raise exception 'remaining MVP live: applied tactic/lineup not visible to Member';
  end if;

  v_failed := false;
  begin
    perform public.manage_finance_entry(
      'create', v_team, null, 'income', 100000, 'dues', current_date,
      'Must be denied', null, null
    );
  exception when others then
    v_failed := true;
    v_state := sqlstate;
  end;
  if not v_failed or v_state <> '42501' then
    raise exception 'remaining MVP live: Member finance mutation was not denied (state=%)', v_state;
  end if;
  if exists (select 1 from public.finance_entries where team_id = v_team)
    or exists (select 1 from public.member_dues where team_id = v_team) then
    raise exception 'remaining MVP live: Member read finance data';
  end if;

  perform pg_catalog.set_config('request.jwt.claim.sub', v_admin::text, true);
  perform pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.jsonb_build_object('sub', v_admin, 'role', 'authenticated')::text,
    true
  );
  select public.manage_finance_entry(
    'create', v_team, null, 'expense', 250000, 'pitch', current_date,
    'Pitch rental', null, null
  ) into v_entry_id;
  select updated_at into strict v_updated_at from public.finance_entries where id = v_entry_id;
  perform public.manage_finance_entry(
    'void', v_team, v_entry_id, null, null, null, null, null,
    'Duplicate receipt', v_updated_at
  );
  if not exists (
    select 1 from public.finance_entries
    where id = v_entry_id and voided_at is not null and void_reason = 'Duplicate receipt'
  ) then
    raise exception 'remaining MVP live: finance void semantics differ';
  end if;

  select public.manage_member_due(
    'create', v_team, null, v_member, date_trunc('month', current_date)::date,
    100000, current_date + 10, null, null
  ) into v_due_id;
  select updated_at into strict v_updated_at from public.member_dues where id = v_due_id;
  perform public.manage_member_due(
    'pay', v_team, v_due_id, null, null, null, null, 'August dues', v_updated_at
  );
  if not exists (
    select 1 from public.member_dues as due
    join public.finance_entries as entry
      on entry.id = due.finance_entry_id and entry.team_id = due.team_id
    where due.id = v_due_id and due.status = 'paid'
      and entry.direction = 'income' and entry.amount_vnd = 100000 and entry.voided_at is null
  ) then
    raise exception 'remaining MVP live: paid due did not create authoritative income';
  end if;

  execute 'reset role';
  select updated_at into strict v_updated_at from public.matches where id = v_match_id;
  perform pg_catalog.set_config('request.jwt.claim.sub', v_admin::text, true);
  perform pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.jsonb_build_object('sub', v_admin, 'role', 'authenticated')::text,
    true
  );
  execute 'set local role authenticated';
  perform public.manage_match(
    'complete', v_team, v_match_id, null, null, null, null, null,
    3::smallint, 2::smallint, v_updated_at
  );
  execute 'reset role';
  select updated_at into strict v_updated_at from public.matches where id = v_match_id;
  execute 'set local role authenticated';
  perform public.manage_match_analysis(
    v_team,
    v_match_id,
    '[{"minute":10,"sequence_no":1,"event_type":"goal","team_side":"team"}]'::jsonb,
    pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'user_id', v_member, 'minutes_played', 60, 'goals', 1,
        'assists', 0, 'rating', 8.5, 'is_mvp', true
      )
    ),
    '{"possession":{"team":55,"opponent":45},"shots":{"team":8,"opponent":6}}'::jsonb,
    v_updated_at
  );
  execute 'reset role';

  if (select count(*) from public.match_events where match_id = v_match_id) <> 1
    or (select count(*) from public.match_player_stats where match_id = v_match_id) <> 1
    or (select count(*) from public.match_team_stats where match_id = v_match_id) <> 1 then
    raise exception 'remaining MVP live: completed-match analysis did not persist relationally';
  end if;

  perform pg_catalog.set_config('request.jwt.claim.sub', v_unrelated::text, true);
  perform pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.jsonb_build_object('sub', v_unrelated, 'role', 'authenticated')::text,
    true
  );
  execute 'set local role authenticated';
  if exists (select 1 from public.matches where team_id = v_team)
    or exists (select 1 from public.match_attendance where team_id = v_team)
    or exists (select 1 from public.match_tactics where team_id = v_team)
    or exists (select 1 from public.finance_entries where team_id = v_team) then
    raise exception 'remaining MVP live: unrelated user read cross-team records';
  end if;
  v_failed := false;
  begin
    perform public.manage_match(
      'create', v_team, null, 'Denied', pg_catalog.now() + interval '1 day',
      null, true, pg_catalog.now(), null, null, null
    );
  exception when others then
    v_failed := true;
    v_state := sqlstate;
  end;
  if not v_failed or v_state <> '42501' then
    raise exception 'remaining MVP live: unrelated match mutation was not denied (state=%)', v_state;
  end if;
  execute 'reset role';

  if (select count(*) from private.audit_events where team_id = v_team) < 7 then
    raise exception 'remaining MVP live: expected audited match/tactic/finance mutations';
  end if;
end;
$verification$;

rollback;

select 'remaining_mvp_live_transaction_rollback_ok' as result;

do $zero$
begin
  if exists (
    select 1 from auth.users
    where id::text like '00000000-0000-4000-8000-0000000081%'
  ) or exists (
    select 1 from public.teams
    where id in (
      '00000000-0000-4000-8000-000000008201'::uuid,
      '00000000-0000-4000-8000-000000008202'::uuid
    )
  ) or exists (
    select 1 from private.audit_events
    where team_id in (
      '00000000-0000-4000-8000-000000008201'::uuid,
      '00000000-0000-4000-8000-000000008202'::uuid
    )
  ) then
    raise exception 'remaining MVP live: rollback left fixture residue';
  end if;
end;
$zero$;

select 'remaining_mvp_live_fixture_counts_zero' as result;
