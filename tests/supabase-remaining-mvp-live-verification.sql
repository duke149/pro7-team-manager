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
  v_owner_role uuid;
  v_admin_role uuid;
  v_member_role uuid;
  v_match_id uuid;
  v_cancelled_match_id uuid;
  v_zero_pending_match_id uuid;
  v_tactic_id uuid;
  v_second_tactic_id uuid;
  v_entry_id uuid;
  v_other_entry_id uuid;
  v_due_id uuid;
  v_updated_at timestamptz;
  v_original_analysis_updated_at timestamptz;
  v_analysis_updated_at timestamptz;
  v_invited_at timestamptz;
  v_invite_updated_at timestamptz;
  v_notification_created_at timestamptz;
  v_reminder_created_at timestamptz;
  v_count integer;
  v_audit_count integer;
  v_failed boolean;
  v_state text;
  v_slots jsonb;
  v_actual text[];
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

  select id into strict v_owner_role from public.roles where team_id = v_team and slug = 'owner';
  select id into strict v_admin_role from public.roles where team_id = v_team and slug = 'admin';
  select id into strict v_member_role from public.roles where team_id = v_team and slug = 'member';

  select pg_catalog.array_agg(permission_code order by permission_code)
  into v_actual from public.role_permissions where role_id = v_owner_role;
  if v_actual is distinct from array[
    'finance.manage', 'finance.read', 'matches.manage', 'matches.read', 'matches.respond',
    'members.invite', 'members.manage', 'members.read', 'news.manage', 'news.read',
    'players.manage', 'players.read', 'roles.manage', 'roles.read', 'settings.read',
    'settings.update', 'tactics.manage', 'tactics.read', 'team.delete', 'team.read', 'team.update'
  ]::text[] then
    raise exception 'remaining MVP live: prerequisite Owner permission mapping differs: %', v_actual;
  end if;

  select pg_catalog.array_agg(permission_code order by permission_code)
  into v_actual from public.role_permissions where role_id = v_admin_role;
  if v_actual is distinct from array[
    'finance.manage', 'finance.read', 'matches.manage', 'matches.read', 'matches.respond',
    'members.invite', 'members.manage', 'members.read', 'news.manage', 'news.read',
    'players.manage', 'players.read', 'roles.manage', 'roles.read', 'settings.read',
    'settings.update', 'tactics.manage', 'tactics.read', 'team.read', 'team.update'
  ]::text[] then
    raise exception 'remaining MVP live: prerequisite Admin permission mapping differs: %', v_actual;
  end if;

  select pg_catalog.array_agg(permission_code order by permission_code)
  into v_actual from public.role_permissions where role_id = v_member_role;
  if v_actual is distinct from array[
    'matches.read', 'matches.respond', 'members.read', 'news.read',
    'players.read', 'roles.read', 'tactics.read', 'team.read'
  ]::text[] then
    raise exception 'remaining MVP live: prerequisite Member permission mapping differs: %', v_actual;
  end if;

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
  select public.manage_match(
    'create', v_team, null, 'FC Zero Pending', pg_catalog.now() + interval '12 days',
    null, false, pg_catalog.now() + interval '7 days', null, null, null
  ) into v_zero_pending_match_id;

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

  execute 'reset role';
  select count(*) into v_audit_count
  from private.audit_events
  where team_id = v_team and table_name = 'notifications'
    and action = 'UPDATE';
  execute 'set local role authenticated';
  select public.remind_match_attendance(v_team, v_zero_pending_match_id) into v_count;
  execute 'reset role';
  if v_count <> 0 or (
    select count(*) from private.audit_events
    where team_id = v_team and table_name = 'notifications' and action = 'UPDATE'
  ) <> v_audit_count then
    raise exception 'remaining MVP live: zero-pending scheduled reminder was not a no-op (%)', v_count;
  end if;

  execute 'set local role authenticated';
  v_failed := false;
  begin
    perform public.remind_match_attendance(v_team, v_cancelled_match_id);
  exception when others then
    v_failed := true;
    v_state := sqlstate;
  end;
  if not v_failed or v_state <> '55000' then
    raise exception 'remaining MVP live: cancelled match accepted reminders (state=%)', v_state;
  end if;

  v_failed := false;
  begin
    perform public.remind_match_attendance(
      v_team,
      '00000000-0000-4000-8000-000000008299'::uuid
    );
  exception when others then
    v_failed := true;
    v_state := sqlstate;
  end;
  if not v_failed or v_state <> 'P0002' then
    raise exception 'remaining MVP live: nonexistent match accepted reminders (state=%)', v_state;
  end if;

  v_failed := false;
  begin
    perform public.remind_match_attendance(v_other_team, v_match_id);
  exception when others then
    v_failed := true;
    v_state := sqlstate;
  end;
  if not v_failed or v_state <> '42501' then
    raise exception 'remaining MVP live: cross-team Admin sent reminders (state=%)', v_state;
  end if;

  perform public.invite_match_attendance(
    v_team,
    v_match_id,
    array[v_owner, v_admin, v_member, v_player4, v_player5, v_player6]
  );
  execute 'reset role';
  select invited_at, updated_at
  into strict v_invited_at, v_invite_updated_at
  from public.match_attendance
  where match_id = v_match_id and user_id = v_member;
  select created_at into strict v_notification_created_at
  from public.notifications
  where user_id = v_member
    and type = 'match_invitation'
    and source_entity = 'match'
    and source_id = v_match_id;
  if (select count(*) from public.notifications where source_id = v_match_id) <> 6
    or exists (
      select 1 from public.notifications
      where source_id = v_match_id
        and target_path <> '/teams/remaining-mvp-team-20260826/matches/' || v_match_id::text
    ) then
    raise exception 'remaining MVP live: invitations did not create one local notification per new attendance';
  end if;
  select count(*) into v_audit_count
  from private.audit_events
  where team_id = v_team
    and table_name = 'match_attendance'
    and action = 'INSERT'
    and row_key = pg_catalog.jsonb_build_object('match_id', v_match_id);

  execute 'set local role authenticated';
  perform public.invite_match_attendance(
    v_team,
    v_match_id,
    array[v_owner, v_admin, v_member, v_player4, v_player5, v_player6]
  );
  execute 'reset role';

  select count(*) into v_count from public.match_attendance where match_id = v_match_id;
  if v_count <> 6 then
    raise exception 'remaining MVP live: invitation retry was not idempotent (%)', v_count;
  end if;
  if exists (
    select 1 from public.match_attendance
    where match_id = v_match_id and user_id = v_member
      and (invited_at is distinct from v_invited_at or updated_at is distinct from v_invite_updated_at)
  ) or (
    select count(*) from private.audit_events
    where team_id = v_team
      and table_name = 'match_attendance'
      and action = 'INSERT'
      and row_key = pg_catalog.jsonb_build_object('match_id', v_match_id)
  ) <> v_audit_count or (
    select created_at from public.notifications
    where user_id = v_member and type = 'match_invitation'
      and source_entity = 'match' and source_id = v_match_id
  ) is distinct from v_notification_created_at
    or (select count(*) from public.notifications where source_id = v_match_id) <> 6 then
    raise exception 'remaining MVP live: exact invitation retry changed token, timestamps, or audit';
  end if;
  if exists (select 1 from public.match_attendance where match_id = v_match_id and status <> 'pending') then
    raise exception 'remaining MVP live: new invitation status differs';
  end if;

  execute 'set local role authenticated';
  perform public.invite_match_attendance(v_team, v_match_id, array[v_player7]);
  execute 'reset role';
  if not exists (
    select 1 from public.match_attendance
    where team_id = v_team and match_id = v_match_id and user_id = v_player7 and status = 'pending'
  ) or not exists (
    select 1 from public.notifications
    where team_id = v_team and source_id = v_match_id and user_id = v_player7
      and type = 'match_invitation'
  ) then
    raise exception 'remaining MVP live: newly pending attendance setup failed';
  end if;

  select updated_at into strict v_updated_at
  from public.match_attendance where match_id = v_match_id and user_id = v_member;
  select count(*) into v_audit_count
  from private.audit_events
  where team_id = v_team and table_name = 'notifications'
    and action = 'UPDATE'
    and row_key = pg_catalog.jsonb_build_object('match_id', v_match_id);

  execute 'set local role authenticated';
  select public.remind_match_attendance(v_team, v_match_id) into v_count;
  if v_count <> 7 then
    raise exception 'remaining MVP live: full pending set, including the newest invite, was not reminded (%)', v_count;
  end if;
  execute 'reset role';
  select created_at into strict v_reminder_created_at
  from public.notifications
  where user_id = v_member and type = 'match_reminder'
    and source_entity = 'match' and source_id = v_match_id;
  if (select updated_at from public.match_attendance where match_id = v_match_id and user_id = v_member)
      is distinct from v_updated_at
    or (select count(*) from public.notifications where user_id = v_member and source_id = v_match_id) <> 2 then
    raise exception 'remaining MVP live: reminder changed RSVP token or notification cardinality';
  end if;

  execute 'set local role authenticated';
  perform public.remind_match_attendance(v_team, v_match_id);
  execute 'reset role';
  if (select count(*) from public.notifications where user_id = v_member and type = 'match_reminder' and source_id = v_match_id) <> 1
    or (select created_at from public.notifications where user_id = v_member and type = 'match_reminder' and source_id = v_match_id) <= v_reminder_created_at
    or (select updated_at from public.match_attendance where match_id = v_match_id and user_id = v_member)
      is distinct from v_updated_at
    or (
      select count(*) from private.audit_events
      where team_id = v_team and table_name = 'notifications'
        and action = 'UPDATE'
        and row_key = pg_catalog.jsonb_build_object('match_id', v_match_id)
    ) <> v_audit_count + 2 then
    raise exception 'remaining MVP live: full-set reminder retry was not idempotent, token-safe, and once-audited per write';
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
  v_failed := false;
  begin
    perform public.remind_match_attendance(v_team, v_match_id);
  exception when others then
    v_failed := true;
    v_state := sqlstate;
  end;
  if not v_failed or v_state <> '42501' then
    raise exception 'remaining MVP live: Member sent reminders (state=%)', v_state;
  end if;

  if (select count(*) from public.notifications) <> 2
    or exists (select 1 from public.notifications where user_id <> v_member) then
    raise exception 'remaining MVP live: own-notification SELECT policy leaked another user';
  end if;
  update public.notifications
  set read_at = pg_catalog.clock_timestamp()
  where user_id = v_member and type = 'match_invitation' and source_id = v_match_id;
  if not exists (
    select 1 from public.notifications
    where user_id = v_member and type = 'match_invitation'
      and source_id = v_match_id and read_at is not null
  ) then
    raise exception 'remaining MVP live: own notification read update did not persist';
  end if;
  v_failed := false;
  begin
    update public.notifications
    set title = 'Tampered'
    where user_id = v_member and source_id = v_match_id;
  exception when others then
    v_failed := true;
    v_state := sqlstate;
  end;
  if not v_failed or v_state <> '42501' then
    raise exception 'remaining MVP live: notification content was client-writable (state=%)', v_state;
  end if;
  v_failed := false;
  begin
    insert into public.notifications (
      team_id, user_id, type, source_entity, source_id, title, body, target_path
    ) values (
      v_team, v_member, 'match_reminder', 'match', v_match_id,
      'Tampered', 'Tampered', '/teams/remaining-mvp-team-20260826/matches/' || v_match_id::text
    );
  exception when others then
    v_failed := true;
    v_state := sqlstate;
  end;
  if not v_failed or v_state <> '42501' then
    raise exception 'remaining MVP live: notification insert was client-writable (state=%)', v_state;
  end if;
  v_failed := false;
  begin
    delete from public.notifications where user_id = v_member and source_id = v_match_id;
  exception when others then
    v_failed := true;
    v_state := sqlstate;
  end;
  if not v_failed or v_state <> '42501' then
    raise exception 'remaining MVP live: notification delete was client-writable (state=%)', v_state;
  end if;

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

  perform pg_catalog.set_config('request.jwt.claim.sub', v_admin::text, true);
  perform pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.jsonb_build_object('sub', v_admin, 'role', 'authenticated')::text,
    true
  );
  execute 'reset role';
  select updated_at into strict v_updated_at
  from public.match_attendance where match_id = v_match_id and user_id = v_member;
  select created_at into strict v_reminder_created_at
  from public.notifications
  where user_id = v_member and type = 'match_reminder' and source_id = v_match_id;
  execute 'set local role authenticated';
  select public.remind_match_attendance(v_team, v_match_id) into v_count;
  execute 'reset role';
  if v_count <> 6
    or (select updated_at from public.match_attendance where match_id = v_match_id and user_id = v_member)
      is distinct from v_updated_at
    or (select created_at from public.notifications where user_id = v_member and type = 'match_reminder' and source_id = v_match_id)
      is distinct from v_reminder_created_at then
    raise exception 'remaining MVP live: full-set reminder did not exclude a non-pending RSVP (%)', v_count;
  end if;

  execute 'set local role authenticated';
  perform pg_catalog.set_config('request.jwt.claim.sub', v_member::text, true);
  perform pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.jsonb_build_object('sub', v_member, 'role', 'authenticated')::text,
    true
  );

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
  v_failed := false;
  begin
    perform public.save_match_tactic(
      v_team, v_match_id, v_tactic_id, 'balanced', '2-3-1', 'Must not clear', 1::smallint,
      'medium', 'medium', null, v_updated_at
    );
  exception when others then
    v_failed := true;
    v_state := sqlstate;
  end;
  if not v_failed or v_state <> '22023'
    or (select count(*) from public.lineup_slots where tactic_id = v_tactic_id) <> 7 then
    raise exception 'remaining MVP live: NULL lineup was not rejected atomically (state=%)', v_state;
  end if;

  select public.save_match_tactic(
    v_team, v_match_id, v_tactic_id, 'balanced', '2-3-1', 'Keep shape updated', 1::smallint,
    'high', 'medium', v_slots, v_updated_at
  ) into v_tactic_id;
  select updated_at into strict v_updated_at from public.match_tactics where id = v_tactic_id;
  perform public.apply_match_tactic(v_team, v_tactic_id, v_updated_at);

  select public.save_match_tactic(
    v_team, v_match_id, null, 'balanced', '2-3-1', 'Second option', 3::smallint,
    'medium', 'high', v_slots, null
  ) into v_second_tactic_id;
  select updated_at into strict v_updated_at
  from public.match_tactics where id = v_second_tactic_id;
  perform public.apply_match_tactic(v_team, v_second_tactic_id, v_updated_at);

  execute 'reset role';
  if (select count(*) from private.audit_events where team_id = v_team and table_name = 'match_tactics') <> 6 then
    raise exception 'remaining MVP live: tactic create/update/apply/demotion audit count differs';
  end if;
  if exists (
    select 1 from private.audit_events
    where team_id = v_team and table_name = 'match_tactics'
      and (
        coalesce(old_data, '{}'::jsonb) ?| array['instructions', 'slots', 'slot_key', 'user_id', 'x', 'y']
        or coalesce(new_data, '{}'::jsonb) ?| array['instructions', 'slots', 'slot_key', 'user_id', 'x', 'y']
      )
  ) then
    raise exception 'remaining MVP live: tactic audit payload contains lineup or instruction data';
  end if;

  perform pg_catalog.set_config('request.jwt.claim.sub', v_member::text, true);
  perform pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.jsonb_build_object('sub', v_member, 'role', 'authenticated')::text,
    true
  );
  execute 'set local role authenticated';
  select count(*) into v_count from public.match_tactics where id = v_second_tactic_id and status = 'applied';
  if v_count <> 1
    or exists (select 1 from public.match_tactics where id = v_tactic_id)
    or (select count(*) from public.lineup_slots where tactic_id = v_second_tactic_id) <> 7 then
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

  select finance_entry_id, updated_at
  into strict v_entry_id, v_updated_at
  from public.member_dues
  where id = v_due_id;
  v_failed := false;
  begin
    perform public.manage_finance_entry(
      'void', v_team, v_entry_id, null, null, null, null, null,
      'Must use due correction',
      (select updated_at from public.finance_entries where id = v_entry_id)
    );
  exception when others then
    v_failed := true;
    v_state := sqlstate;
  end;
  if not v_failed or v_state <> '55000' then
    raise exception 'remaining MVP live: due income allowed unsafe direct void (state=%)', v_state;
  end if;

  perform public.manage_member_due(
    'void_payment', v_team, v_due_id, null, null, null, null,
    'Payment recorded in error', v_updated_at
  );
  execute 'reset role';
  if not exists (
    select 1 from public.member_dues
    where id = v_due_id and status = 'pending' and paid_at is null and finance_entry_id is null
  ) or not exists (
    select 1 from public.finance_entries
    where id = v_entry_id and voided_at is not null and void_reason = 'Payment recorded in error'
  ) or not exists (
    select 1 from private.audit_events
    where team_id = v_team and table_name = 'finance_entries'
      and row_key = pg_catalog.jsonb_build_object('id', v_entry_id)
      and new_data ->> 'source' = 'member_due'
  ) or not exists (
    select 1 from private.audit_events
    where team_id = v_team and table_name = 'member_dues'
      and row_key = pg_catalog.jsonb_build_object('id', v_due_id)
      and new_data ->> 'operation' = 'void_payment'
  ) then
    raise exception 'remaining MVP live: due payment correction is not consistent and audited';
  end if;

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
  v_failed := false;
  begin
    perform public.remind_match_attendance(v_team, v_match_id);
  exception when others then
    v_failed := true;
    v_state := sqlstate;
  end;
  if not v_failed or v_state <> '55000' then
    raise exception 'remaining MVP live: completed match accepted reminders (state=%)', v_state;
  end if;
  execute 'reset role';
  select updated_at into strict v_original_analysis_updated_at from public.matches where id = v_match_id;
  execute 'set local role authenticated';
  select public.manage_match_analysis(
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
    v_original_analysis_updated_at
  ) into v_analysis_updated_at;

  if v_analysis_updated_at is null or v_analysis_updated_at <= v_original_analysis_updated_at
    or (select updated_at from public.matches where id = v_match_id) is distinct from v_analysis_updated_at then
    raise exception 'remaining MVP live: analysis did not return and advance authoritative token';
  end if;

  v_failed := false;
  begin
    perform public.manage_match_analysis(
      v_team, v_match_id,
      '[{"minute":20,"sequence_no":1,"event_type":"goal","team_side":"opponent"}]'::jsonb,
      '[]'::jsonb,
      '{}'::jsonb,
      v_original_analysis_updated_at
    );
  exception when others then
    v_failed := true;
    v_state := sqlstate;
  end;
  if not v_failed or v_state <> '40001'
    or (select count(*) from public.match_events where match_id = v_match_id) <> 1
    or (select count(*) from public.match_player_stats where match_id = v_match_id) <> 1 then
    raise exception 'remaining MVP live: stale analysis token overwrote data (state=%)', v_state;
  end if;

  v_failed := false;
  begin
    perform public.manage_match_analysis(
      v_team, v_match_id, null,
      '[]'::jsonb, '{}'::jsonb, v_analysis_updated_at
    );
  exception when others then
    v_failed := true;
    v_state := sqlstate;
  end;
  if not v_failed or v_state <> '22023'
    or (select count(*) from public.match_events where match_id = v_match_id) <> 1 then
    raise exception 'remaining MVP live: NULL events were not rejected atomically (state=%)', v_state;
  end if;

  v_failed := false;
  begin
    perform public.manage_match_analysis(
      v_team, v_match_id, '[]'::jsonb,
      null, '{}'::jsonb, v_analysis_updated_at
    );
  exception when others then
    v_failed := true;
    v_state := sqlstate;
  end;
  if not v_failed or v_state <> '22023'
    or (select count(*) from public.match_player_stats where match_id = v_match_id) <> 1 then
    raise exception 'remaining MVP live: NULL player stats were not rejected atomically (state=%)', v_state;
  end if;

  select updated_at into strict v_updated_at
  from public.match_attendance where match_id = v_match_id and user_id = v_member;
  v_failed := false;
  begin
    perform public.respond_match_attendance(
      v_team, v_match_id, v_member, 'available', 'Too late', v_updated_at
    );
  exception when others then
    v_failed := true;
    v_state := sqlstate;
  end;
  if not v_failed or v_state <> '55000' then
    raise exception 'remaining MVP live: RSVP escaped completed lifecycle (state=%)', v_state;
  end if;

  v_failed := false;
  begin
    perform public.save_match_tactic(
      v_team, v_match_id, null, 'attacking', '2-3-1', null, 1::smallint,
      'high', 'high', v_slots, null
    );
  exception when others then
    v_failed := true;
    v_state := sqlstate;
  end;
  if not v_failed or v_state <> '55000' then
    raise exception 'remaining MVP live: tactic save escaped completed lifecycle (state=%)', v_state;
  end if;

  select updated_at into strict v_updated_at from public.match_tactics where id = v_tactic_id;
  v_failed := false;
  begin
    perform public.apply_match_tactic(v_team, v_tactic_id, v_updated_at);
  exception when others then
    v_failed := true;
    v_state := sqlstate;
  end;
  if not v_failed or v_state <> '55000' then
    raise exception 'remaining MVP live: tactic apply escaped completed lifecycle (state=%)', v_state;
  end if;
  execute 'reset role';

  if (select count(*) from public.match_events where match_id = v_match_id) <> 1
    or (select count(*) from public.match_player_stats where match_id = v_match_id) <> 1
    or (select count(*) from public.match_team_stats where match_id = v_match_id) <> 1 then
    raise exception 'remaining MVP live: completed-match analysis did not persist relationally';
  end if;

  v_failed := false;
  begin
    insert into public.match_attendance (
      match_id, team_id, user_id, status, invited_by_user_id
    ) values (
      v_match_id, v_other_team, v_unrelated, 'pending', v_owner
    );
  exception when others then
    v_failed := true;
    v_state := sqlstate;
  end;
  if not v_failed or v_state <> '23503' then
    raise exception 'remaining MVP live: privileged attendance composite-FK mismatch state=%', v_state;
  end if;

  insert into public.finance_entries (
    team_id, direction, amount_vnd, category, occurred_on, description, created_by_user_id
  ) values (
    v_other_team, 'income', 1, 'fk_probe', current_date, 'Composite FK probe', v_unrelated
  ) returning id into v_other_entry_id;
  v_failed := false;
  begin
    insert into public.member_dues (
      team_id, user_id, period_start, amount_vnd, due_date, finance_entry_id,
      status, paid_at, created_by_user_id
    ) values (
      v_team, v_owner,
      (date_trunc('month', current_date) + interval '1 month')::date,
      1,
      (date_trunc('month', current_date) + interval '1 month')::date,
      v_other_entry_id,
      'paid', pg_catalog.now(), v_owner
    );
  exception when others then
    v_failed := true;
    v_state := sqlstate;
  end;
  if not v_failed or v_state <> '23503' then
    raise exception 'remaining MVP live: privileged due/entry composite-FK mismatch state=%', v_state;
  end if;

  v_failed := false;
  begin
    update public.lineup_slots
    set team_id = v_other_team
    where id = (
      select id from public.lineup_slots where tactic_id = v_second_tactic_id order by id limit 1
    );
  exception when others then
    v_failed := true;
    v_state := sqlstate;
  end;
  if not v_failed or v_state <> '23503' then
    raise exception 'remaining MVP live: privileged lineup composite-FK mismatch state=%', v_state;
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
    or exists (select 1 from public.finance_entries where team_id = v_team)
    or exists (select 1 from public.notifications where team_id = v_team) then
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
