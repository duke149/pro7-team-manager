begin;

create or replace function public.manage_match(
  p_action text,
  p_team_id uuid,
  p_match_id uuid,
  p_opponent text,
  p_starts_at timestamptz,
  p_venue text,
  p_is_home boolean,
  p_rsvp_deadline timestamptz,
  p_team_score smallint,
  p_opponent_score smallint,
  p_expected_updated_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_user_id uuid := (select auth.uid());
  v_match public.matches%rowtype;
  v_match_id uuid;
  v_old_data jsonb;
begin
  if v_actor_user_id is null then
    raise exception using errcode = '28000', message = 'Authentication required';
  end if;
  if not private.has_team_permission(p_team_id, 'matches.manage') then
    raise exception using errcode = '42501', message = 'Match management permission required';
  end if;
  if p_action not in ('create', 'update', 'complete', 'cancel', 'revise') then
    raise exception using errcode = '22023', message = 'Invalid match action';
  end if;

  if p_action = 'create' then
    if p_match_id is not null
      or p_opponent is null
      or p_starts_at is null
      or p_is_home is null
      or p_rsvp_deadline is null
      or p_team_score is not null
      or p_opponent_score is not null
      or p_expected_updated_at is not null then
      raise exception using errcode = '22023', message = 'Invalid match fields';
    end if;

    insert into public.matches (
      team_id, opponent, starts_at, venue, is_home, rsvp_deadline, created_by_user_id
    ) values (
      p_team_id, p_opponent, p_starts_at, p_venue, p_is_home, p_rsvp_deadline, v_actor_user_id
    )
    returning id into v_match_id;

    insert into private.audit_events (
      actor_user_id, team_id, table_name, action, row_key, old_data, new_data, request_id
    ) values (
      v_actor_user_id, p_team_id, 'matches', 'INSERT',
      pg_catalog.jsonb_build_object('id', v_match_id), null,
      pg_catalog.jsonb_build_object('status', 'scheduled'), null
    );
    return v_match_id;
  end if;

  select m.* into v_match
  from public.matches as m
  where m.id = p_match_id and m.team_id = p_team_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Match not found';
  end if;
  if p_expected_updated_at is distinct from v_match.updated_at then
    raise exception using errcode = '40001', message = 'Match changed; refresh and retry';
  end if;
  if p_action = 'revise' and v_match.status <> 'completed' then
    raise exception using errcode = '55000', message = 'Only completed matches can be revised';
  end if;
  if p_action <> 'revise' and v_match.status <> 'scheduled' then
    raise exception using errcode = '55000', message = 'Only scheduled matches can change lifecycle';
  end if;

  v_old_data := pg_catalog.jsonb_build_object(
    'status', v_match.status,
    'opponent', v_match.opponent,
    'starts_at', v_match.starts_at,
    'venue', v_match.venue,
    'is_home', v_match.is_home,
    'rsvp_deadline', v_match.rsvp_deadline,
    'team_score', v_match.team_score,
    'opponent_score', v_match.opponent_score
  );

  if p_action = 'update' then
    if p_opponent is null or p_starts_at is null or p_is_home is null or p_rsvp_deadline is null
      or p_team_score is not null or p_opponent_score is not null then
      raise exception using errcode = '22023', message = 'Invalid match fields';
    end if;
    update public.matches
    set opponent = p_opponent,
        starts_at = p_starts_at,
        venue = p_venue,
        is_home = p_is_home,
        rsvp_deadline = p_rsvp_deadline
    where id = p_match_id and team_id = p_team_id;
  elsif p_action = 'complete' then
    if p_opponent is not null or p_starts_at is not null or p_venue is not null
      or p_is_home is not null or p_rsvp_deadline is not null
      or p_team_score is null or p_opponent_score is null
      or p_team_score < 0 or p_opponent_score < 0 then
      raise exception using errcode = '22023', message = 'Completed match requires valid scores';
    end if;
    update public.matches
    set status = 'completed', team_score = p_team_score, opponent_score = p_opponent_score
    where id = p_match_id and team_id = p_team_id;
  elsif p_action = 'revise' then
    if p_opponent is null or p_starts_at is null or p_is_home is null or p_rsvp_deadline is null
      or p_team_score is null or p_opponent_score is null
      or p_team_score < 0 or p_opponent_score < 0 then
      raise exception using errcode = '22023', message = 'Completed match revision requires metadata and scores';
    end if;
    update public.matches
    set opponent = p_opponent,
        starts_at = p_starts_at,
        venue = p_venue,
        is_home = p_is_home,
        rsvp_deadline = p_rsvp_deadline,
        team_score = p_team_score,
        opponent_score = p_opponent_score
    where id = p_match_id and team_id = p_team_id;
  else
    if p_opponent is not null or p_starts_at is not null or p_venue is not null
      or p_is_home is not null or p_rsvp_deadline is not null
      or p_team_score is not null or p_opponent_score is not null then
      raise exception using errcode = '22023', message = 'Cancelled match cannot include mutable fields';
    end if;
    update public.matches
    set status = 'cancelled', cancelled_at = pg_catalog.now(), cancelled_by_user_id = v_actor_user_id
    where id = p_match_id and team_id = p_team_id;
  end if;

  insert into private.audit_events (
    actor_user_id, team_id, table_name, action, row_key, old_data, new_data, request_id
  )
  select
    v_actor_user_id, p_team_id, 'matches', 'UPDATE',
    pg_catalog.jsonb_build_object('id', m.id), v_old_data,
    pg_catalog.jsonb_build_object(
      'status', m.status,
      'opponent', m.opponent,
      'starts_at', m.starts_at,
      'venue', m.venue,
      'is_home', m.is_home,
      'rsvp_deadline', m.rsvp_deadline,
      'team_score', m.team_score,
      'opponent_score', m.opponent_score
    ), null
  from public.matches as m
  where m.id = p_match_id and m.team_id = p_team_id;

  return p_match_id;
end;
$function$;

alter function public.manage_match(
  text, uuid, uuid, text, timestamptz, text, boolean, timestamptz, smallint, smallint, timestamptz
) owner to postgres;
revoke execute on function public.manage_match(
  text, uuid, uuid, text, timestamptz, text, boolean, timestamptz, smallint, smallint, timestamptz
) from public, anon, authenticated, service_role;
grant execute on function public.manage_match(
  text, uuid, uuid, text, timestamptz, text, boolean, timestamptz, smallint, smallint, timestamptz
) to authenticated;

commit;
