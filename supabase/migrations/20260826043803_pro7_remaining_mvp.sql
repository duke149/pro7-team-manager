begin;

create table public.matches (
  id uuid primary key default extensions.gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  opponent text not null
    constraint matches_opponent_check
    check (opponent = btrim(opponent) and char_length(opponent) between 1 and 120),
  starts_at timestamptz not null,
  venue text
    constraint matches_venue_check
    check (venue is null or (venue = btrim(venue) and char_length(venue) between 1 and 200)),
  is_home boolean not null default true,
  rsvp_deadline timestamptz not null,
  status text not null default 'scheduled'
    constraint matches_status_check
    check (status in ('scheduled', 'completed', 'cancelled')),
  team_score smallint,
  opponent_score smallint,
  cancelled_at timestamptz,
  cancelled_by_user_id uuid references auth.users (id) on delete restrict,
  created_by_user_id uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint matches_id_team_id_key unique (id, team_id),
  constraint matches_deadline_check check (rsvp_deadline <= starts_at),
  constraint matches_scores_check check (
    (team_score is null or team_score >= 0)
    and (opponent_score is null or opponent_score >= 0)
  ),
  constraint matches_result_check check (
    (status = 'completed' and team_score is not null and opponent_score is not null and cancelled_at is null)
    or (status = 'cancelled' and team_score is null and opponent_score is null and cancelled_at is not null)
    or (status = 'scheduled' and team_score is null and opponent_score is null and cancelled_at is null)
  )
);

create table public.match_attendance (
  match_id uuid not null,
  team_id uuid not null,
  user_id uuid not null,
  status text not null default 'pending'
    constraint match_attendance_status_check
    check (status in ('pending', 'available', 'unavailable')),
  note text
    constraint match_attendance_note_check
    check (note is null or (note = btrim(note) and char_length(note) between 1 and 300)),
  responded_at timestamptz,
  invited_at timestamptz not null default pg_catalog.now(),
  invited_by_user_id uuid not null references auth.users (id) on delete restrict,
  updated_at timestamptz not null default pg_catalog.now(),
  constraint match_attendance_pkey primary key (match_id, user_id),
  constraint match_attendance_match_team_fkey
    foreign key (match_id, team_id)
    references public.matches (id, team_id)
    on delete cascade,
  constraint match_attendance_membership_fkey
    foreign key (team_id, user_id)
    references public.memberships (team_id, user_id)
    on delete restrict,
  constraint match_attendance_response_check check (
    (status = 'pending' and responded_at is null)
    or (status in ('available', 'unavailable') and responded_at is not null)
  )
);

create table public.match_events (
  id uuid primary key default extensions.gen_random_uuid(),
  match_id uuid not null,
  team_id uuid not null,
  minute smallint not null,
  sequence_no smallint not null default 1,
  event_type text not null
    constraint match_events_type_check
    check (event_type in ('goal', 'yellow_card', 'red_card', 'substitution', 'note')),
  team_side text not null default 'team'
    constraint match_events_side_check
    check (team_side in ('team', 'opponent')),
  player_user_id uuid,
  secondary_user_id uuid,
  note text
    constraint match_events_note_check
    check (note is null or (note = btrim(note) and char_length(note) between 1 and 500)),
  created_by_user_id uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default pg_catalog.now(),
  constraint match_events_match_team_fkey
    foreign key (match_id, team_id)
    references public.matches (id, team_id)
    on delete cascade,
  constraint match_events_player_membership_fkey
    foreign key (team_id, player_user_id)
    references public.memberships (team_id, user_id)
    on delete restrict,
  constraint match_events_secondary_membership_fkey
    foreign key (team_id, secondary_user_id)
    references public.memberships (team_id, user_id)
    on delete restrict,
  constraint match_events_minute_check check (minute between 0 and 120 and sequence_no between 1 and 100),
  constraint match_events_match_sequence_key unique (match_id, minute, sequence_no)
);

create table public.match_player_stats (
  match_id uuid not null,
  team_id uuid not null,
  user_id uuid not null,
  minutes_played smallint not null default 0,
  goals smallint not null default 0,
  assists smallint not null default 0,
  rating numeric(3,1),
  is_mvp boolean not null default false,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint match_player_stats_pkey primary key (match_id, user_id),
  constraint match_player_stats_match_team_fkey
    foreign key (match_id, team_id)
    references public.matches (id, team_id)
    on delete cascade,
  constraint match_player_stats_membership_fkey
    foreign key (team_id, user_id)
    references public.memberships (team_id, user_id)
    on delete restrict,
  constraint match_player_stats_values_check check (
    minutes_played between 0 and 120 and goals >= 0 and assists >= 0 and (rating is null or rating between 0 and 10)
  )
);

create unique index match_player_stats_one_mvp_per_match
  on public.match_player_stats (match_id)
  where is_mvp;

create table public.match_team_stats (
  match_id uuid primary key,
  team_id uuid not null,
  schema_version smallint not null default 1,
  metrics jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint match_team_stats_match_team_fkey
    foreign key (match_id, team_id)
    references public.matches (id, team_id)
    on delete cascade,
  constraint match_team_stats_metrics_check check (
    schema_version = 1 and jsonb_typeof(metrics) = 'object' and pg_column_size(metrics) <= 4096
    and metrics - array['possession', 'shots', 'shots_on_target', 'corners'] = '{}'::jsonb
  )
);

create table public.team_news (
  id uuid primary key default extensions.gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  title text not null
    constraint team_news_title_check
    check (title = btrim(title) and char_length(title) between 1 and 160),
  body text not null
    constraint team_news_body_check
    check (body = btrim(body) and char_length(body) between 1 and 5000),
  status text not null default 'draft'
    constraint team_news_status_check
    check (status in ('draft', 'published')),
  published_at timestamptz,
  author_user_id uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint team_news_publish_check check (
    (status = 'draft' and published_at is null)
    or (status = 'published' and published_at is not null)
  )
);

create table public.match_tactics (
  id uuid primary key default extensions.gen_random_uuid(),
  team_id uuid not null,
  match_id uuid not null,
  mode text not null
    constraint match_tactics_mode_check
    check (mode in ('balanced', 'attacking', 'defensive')),
  formation text not null
    constraint match_tactics_formation_check
    check (formation in ('2-3-1', '3-2-1', '2-2-2')),
  instructions text
    constraint match_tactics_instructions_check
    check (instructions is null or (instructions = btrim(instructions) and char_length(instructions) between 1 and 2000)),
  pressing text not null
    constraint match_tactics_pressing_check
    check (pressing in ('low', 'medium', 'high')),
  defensive_line text not null
    constraint match_tactics_defensive_line_check
    check (defensive_line in ('low', 'medium', 'high')),
  version smallint not null default 1 constraint match_tactics_version_check check (version > 0),
  status text not null default 'draft'
    constraint match_tactics_status_check
    check (status in ('draft', 'applied')),
  created_by_user_id uuid not null references auth.users (id) on delete restrict,
  applied_by_user_id uuid references auth.users (id) on delete restrict,
  applied_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint match_tactics_id_team_id_key unique (id, team_id),
  constraint match_tactics_match_team_fkey
    foreign key (match_id, team_id)
    references public.matches (id, team_id)
    on delete cascade,
  constraint match_tactics_match_mode_version_key unique (match_id, mode, version),
  constraint match_tactics_applied_check check (
    (status = 'draft' and applied_at is null and applied_by_user_id is null)
    or (status = 'applied' and applied_at is not null and applied_by_user_id is not null)
  )
);

create unique index match_tactics_one_applied_per_match_mode
  on public.match_tactics (match_id, mode)
  where status = 'applied';

create table public.lineup_slots (
  id uuid primary key default extensions.gen_random_uuid(),
  tactic_id uuid not null,
  team_id uuid not null,
  user_id uuid not null,
  slot_kind text not null
    constraint lineup_slots_kind_check
    check (slot_kind in ('starter', 'bench')),
  slot_key text not null
    constraint lineup_slots_slot_key_check
    check (slot_key = btrim(slot_key) and char_length(slot_key) between 1 and 40),
  role_label text not null
    constraint lineup_slots_role_check
    check (role_label in ('GK', 'DEF', 'MID', 'ATT')),
  shirt_number smallint
    constraint lineup_slots_shirt_number_check
    check (shirt_number is null or shirt_number between 1 and 99),
  x numeric(5,2) not null,
  y numeric(5,2) not null,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint lineup_slots_tactic_team_fkey
    foreign key (tactic_id, team_id)
    references public.match_tactics (id, team_id)
    on delete cascade,
  constraint lineup_slots_membership_fkey
    foreign key (team_id, user_id)
    references public.memberships (team_id, user_id)
    on delete restrict,
  constraint lineup_slots_coordinates_check check (x between 0 and 100 and y between 0 and 100),
  constraint lineup_slots_tactic_user_key unique (tactic_id, user_id),
  constraint lineup_slots_tactic_slot_key unique (tactic_id, slot_key)
);

create table public.finance_entries (
  id uuid primary key default extensions.gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  direction text not null
    constraint finance_entries_direction_check
    check (direction in ('income', 'expense')),
  amount_vnd bigint not null
    constraint finance_entries_amount_check
    check (amount_vnd > 0),
  category text not null
    constraint finance_entries_category_check
    check (category = btrim(category) and char_length(category) between 1 and 80),
  occurred_on date not null,
  description text not null
    constraint finance_entries_description_check
    check (description = btrim(description) and char_length(description) between 1 and 500),
  created_by_user_id uuid not null references auth.users (id) on delete restrict,
  voided_at timestamptz,
  voided_by_user_id uuid references auth.users (id) on delete restrict,
  void_reason text
    constraint finance_entries_void_reason_check
    check (void_reason is null or (void_reason = btrim(void_reason) and char_length(void_reason) between 1 and 300)),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint finance_entries_id_team_id_key unique (id, team_id),
  constraint finance_entries_void_check check (
    (voided_at is null and voided_by_user_id is null and void_reason is null)
    or (voided_at is not null and voided_by_user_id is not null and void_reason is not null)
  )
);

create table public.member_dues (
  id uuid primary key default extensions.gen_random_uuid(),
  team_id uuid not null,
  user_id uuid not null,
  period_start date not null,
  amount_vnd bigint not null constraint member_dues_amount_check check (amount_vnd > 0),
  due_date date not null,
  status text not null default 'pending'
    constraint member_dues_status_check
    check (status in ('pending', 'paid', 'waived')),
  paid_at timestamptz,
  finance_entry_id uuid,
  created_by_user_id uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint member_dues_team_user_period_key unique (team_id, user_id, period_start),
  constraint member_dues_membership_fkey
    foreign key (team_id, user_id)
    references public.memberships (team_id, user_id)
    on delete restrict,
  constraint member_dues_finance_entry_team_fkey
    foreign key (finance_entry_id, team_id)
    references public.finance_entries (id, team_id)
    on delete restrict,
  constraint member_dues_period_check check (period_start = date_trunc('month', period_start)::date and due_date >= period_start),
  constraint member_dues_payment_check check (
    (status = 'paid' and paid_at is not null and finance_entry_id is not null)
    or (status in ('pending', 'waived') and paid_at is null and finance_entry_id is null)
  )
);

create table public.notifications (
  id uuid primary key default extensions.gen_random_uuid(),
  team_id uuid not null,
  user_id uuid not null,
  type text not null
    constraint notifications_type_check
    check (type in ('match_invitation', 'match_reminder')),
  source_entity text not null default 'match'
    constraint notifications_source_check
    check (source_entity = 'match'),
  source_id uuid not null,
  title text not null
    constraint notifications_title_check
    check (title = btrim(title) and char_length(title) between 1 and 160),
  body text not null
    constraint notifications_body_check
    check (body = btrim(body) and char_length(body) between 1 and 500),
  target_path text not null
    constraint notifications_target_path_check
    check (
      target_path = btrim(target_path)
      and char_length(target_path) between 1 and 200
      and target_path ~ '^/teams/[a-z0-9]+(-[a-z0-9]+)*/matches/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    ),
  read_at timestamptz,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint notifications_membership_fkey
    foreign key (team_id, user_id)
    references public.memberships (team_id, user_id)
    on delete cascade,
  constraint notifications_match_team_fkey
    foreign key (source_id, team_id)
    references public.matches (id, team_id)
    on delete cascade,
  constraint notifications_user_type_source_key
    unique (user_id, type, source_entity, source_id)
);

create index matches_team_status_starts_at_idx
  on public.matches (team_id, status, starts_at);
create index matches_created_by_user_id_idx
  on public.matches (created_by_user_id);
create index matches_cancelled_by_user_id_idx
  on public.matches (cancelled_by_user_id) where cancelled_by_user_id is not null;
create index match_attendance_team_match_status_idx
  on public.match_attendance (team_id, match_id, status);
create index match_attendance_user_team_idx
  on public.match_attendance (user_id, team_id);
create index match_attendance_invited_by_user_id_idx
  on public.match_attendance (invited_by_user_id);
create index match_events_team_match_minute_idx
  on public.match_events (team_id, match_id, minute, sequence_no);
create index match_events_team_player_user_idx
  on public.match_events (team_id, player_user_id) where player_user_id is not null;
create index match_events_team_secondary_user_idx
  on public.match_events (team_id, secondary_user_id) where secondary_user_id is not null;
create index match_events_created_by_user_id_idx
  on public.match_events (created_by_user_id);
create index match_player_stats_team_user_idx
  on public.match_player_stats (team_id, user_id, match_id);
create index match_team_stats_team_match_idx
  on public.match_team_stats (team_id, match_id);
create index team_news_team_status_published_idx
  on public.team_news (team_id, status, published_at desc);
create index team_news_author_user_id_idx
  on public.team_news (author_user_id);
create index match_tactics_team_match_idx
  on public.match_tactics (team_id, match_id, status);
create index match_tactics_created_by_user_id_idx
  on public.match_tactics (created_by_user_id);
create index match_tactics_applied_by_user_id_idx
  on public.match_tactics (applied_by_user_id) where applied_by_user_id is not null;
create index lineup_slots_team_user_idx
  on public.lineup_slots (team_id, user_id);
create index lineup_slots_tactic_team_idx
  on public.lineup_slots (tactic_id, team_id);
create index finance_entries_team_occurred_idx
  on public.finance_entries (team_id, occurred_on desc) where voided_at is null;
create index finance_entries_created_by_user_id_idx
  on public.finance_entries (created_by_user_id);
create index finance_entries_voided_by_user_id_idx
  on public.finance_entries (voided_by_user_id) where voided_by_user_id is not null;
create index member_dues_team_status_due_idx
  on public.member_dues (team_id, status, due_date);
create index member_dues_user_team_idx
  on public.member_dues (user_id, team_id);
create index member_dues_finance_entry_team_idx
  on public.member_dues (finance_entry_id, team_id) where finance_entry_id is not null;
create index member_dues_created_by_user_id_idx
  on public.member_dues (created_by_user_id);
create index notifications_user_created_at_idx
  on public.notifications (user_id, created_at desc);
create index notifications_source_team_idx
  on public.notifications (source_id, team_id);

create or replace function private.set_monotonic_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  new.updated_at := greatest(
    pg_catalog.clock_timestamp(),
    old.updated_at + interval '1 microsecond'
  );
  return new;
end;
$function$;

alter function private.set_monotonic_updated_at() owner to postgres;
revoke execute on function private.set_monotonic_updated_at()
from public, anon, authenticated, service_role;

do $triggers$
declare
  v_table text;
begin
  foreach v_table in array array[
    'matches', 'match_attendance', 'match_player_stats', 'match_team_stats',
    'team_news', 'match_tactics', 'lineup_slots', 'finance_entries', 'member_dues'
  ] loop
    execute pg_catalog.format(
      'create trigger %I before update on public.%I for each row execute function private.set_monotonic_updated_at()',
      'trg_' || v_table || '_set_updated_at',
      v_table
    );
  end loop;
end;
$triggers$;

alter table public.matches enable row level security;
alter table public.match_attendance enable row level security;
alter table public.match_events enable row level security;
alter table public.match_player_stats enable row level security;
alter table public.match_team_stats enable row level security;
alter table public.team_news enable row level security;
alter table public.match_tactics enable row level security;
alter table public.lineup_slots enable row level security;
alter table public.finance_entries enable row level security;
alter table public.member_dues enable row level security;
alter table public.notifications enable row level security;

create policy matches_select_authorized
on public.matches for select to authenticated
using (private.has_team_permission(team_id, 'matches.read'));

create policy match_attendance_select_authorized
on public.match_attendance for select to authenticated
using (private.has_team_permission(team_id, 'matches.read'));

create policy match_attendance_update_own
on public.match_attendance for update to authenticated
using (user_id = (select auth.uid()) and private.has_team_permission(team_id, 'matches.respond'))
with check (user_id = (select auth.uid()) and private.has_team_permission(team_id, 'matches.respond'));

create policy match_events_select_authorized
on public.match_events for select to authenticated
using (private.has_team_permission(team_id, 'matches.read'));

create policy match_player_stats_select_authorized
on public.match_player_stats for select to authenticated
using (private.has_team_permission(team_id, 'matches.read'));

create policy match_team_stats_select_authorized
on public.match_team_stats for select to authenticated
using (private.has_team_permission(team_id, 'matches.read'));

create policy team_news_select_authorized
on public.team_news for select to authenticated
using (
  private.has_team_permission(team_id, 'news.manage')
  or (status = 'published' and private.has_team_permission(team_id, 'news.read'))
);

create policy match_tactics_select_authorized
on public.match_tactics for select to authenticated
using (
  private.has_team_permission(team_id, 'tactics.manage')
  or (status = 'applied' and private.has_team_permission(team_id, 'tactics.read'))
);

create policy lineup_slots_select_authorized
on public.lineup_slots for select to authenticated
using (
  exists (
    select 1
    from public.match_tactics as tactic
    where tactic.id = public.lineup_slots.tactic_id
      and tactic.team_id = public.lineup_slots.team_id
      and (
        private.has_team_permission(public.lineup_slots.team_id, 'tactics.manage')
        or (
          tactic.status = 'applied'
          and private.has_team_permission(public.lineup_slots.team_id, 'tactics.read')
        )
      )
  )
);

create policy finance_entries_select_authorized
on public.finance_entries for select to authenticated
using (private.has_team_permission(team_id, 'finance.read'));

create policy member_dues_select_authorized
on public.member_dues for select to authenticated
using (private.has_team_permission(team_id, 'finance.read'));

create policy notifications_select_own
on public.notifications for select to authenticated
using (user_id = (select auth.uid()));

create policy notifications_update_own
on public.notifications for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

revoke all privileges on table
  public.matches,
  public.match_attendance,
  public.match_events,
  public.match_player_stats,
  public.match_team_stats,
  public.team_news,
  public.match_tactics,
  public.lineup_slots,
  public.finance_entries,
  public.member_dues,
  public.notifications
from public, anon, authenticated, service_role;

grant select on table
  public.matches,
  public.match_attendance,
  public.match_events,
  public.match_player_stats,
  public.match_team_stats,
  public.team_news,
  public.match_tactics,
  public.lineup_slots,
  public.finance_entries,
  public.member_dues,
  public.notifications
to authenticated;

grant update (read_at) on table public.notifications to authenticated;

grant select, insert, update, delete on table
  public.matches,
  public.match_attendance,
  public.match_events,
  public.match_player_stats,
  public.match_team_stats,
  public.team_news,
  public.match_tactics,
  public.lineup_slots,
  public.finance_entries,
  public.member_dues,
  public.notifications
to service_role;

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
  if p_action not in ('create', 'update', 'complete', 'cancel') then
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
  if v_match.status <> 'scheduled' then
    raise exception using errcode = '55000', message = 'Only scheduled matches can change';
  end if;

  v_old_data := pg_catalog.jsonb_build_object(
    'status', v_match.status,
    'starts_at', v_match.starts_at,
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
    if p_team_score is null or p_opponent_score is null or p_team_score < 0 or p_opponent_score < 0 then
      raise exception using errcode = '22023', message = 'Completed match requires valid scores';
    end if;
    update public.matches
    set status = 'completed', team_score = p_team_score, opponent_score = p_opponent_score
    where id = p_match_id and team_id = p_team_id;
  else
    if p_team_score is not null or p_opponent_score is not null then
      raise exception using errcode = '22023', message = 'Cancelled match cannot have scores';
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
      'starts_at', m.starts_at,
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

  select count(distinct requested.user_id)
  into v_requested_count
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
      '/teams/' || v_team_slug || '/matches/' || p_match_id::text
    from unnest(v_inserted_user_ids) as inserted_user(user_id)
    on conflict (user_id, type, source_entity, source_id) do nothing;

    insert into private.audit_events (
      actor_user_id, team_id, table_name, action, row_key, old_data, new_data, request_id
    ) values (
      v_actor_user_id, p_team_id, 'match_attendance', 'INSERT',
      pg_catalog.jsonb_build_object('match_id', p_match_id), null,
      pg_catalog.jsonb_build_object('invitee_count', v_inserted_count), null
    );
  end if;

  return v_requested_count;
end;
$function$;

alter function public.invite_match_attendance( uuid, uuid, uuid[] ) owner to postgres;
revoke execute on function public.invite_match_attendance( uuid, uuid, uuid[] )
from public, anon, authenticated, service_role;
grant execute on function public.invite_match_attendance( uuid, uuid, uuid[] ) to authenticated;

create or replace function public.remind_match_attendance(
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
  v_pending_count integer;
  v_written_count integer;
  v_team_slug text;
begin
  if v_actor_user_id is null then
    raise exception using errcode = '28000', message = 'Authentication required';
  end if;
  if not private.has_team_permission(p_team_id, 'matches.manage') then
    raise exception using errcode = '42501', message = 'Match management permission required';
  end if;
  if p_user_ids is null or cardinality(p_user_ids) = 0 or array_position(p_user_ids, null) is not null then
    raise exception using errcode = '22023', message = 'At least one reminder recipient is required';
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

  select count(distinct requested.user_id)
  into v_requested_count
  from unnest(p_user_ids) as requested(user_id);

  select count(*) into v_valid_count
  from (
    select distinct requested.user_id
    from unnest(p_user_ids) as requested(user_id)
  ) as requested
  join public.memberships as membership
    on membership.team_id = p_team_id
   and membership.user_id = requested.user_id
   and membership.status = 'active';
  if v_valid_count <> v_requested_count then
    raise exception using errcode = '23503', message = 'Reminder recipient is not an active team member';
  end if;

  select count(*) into v_pending_count
  from (
    select distinct requested.user_id
    from unnest(p_user_ids) as requested(user_id)
  ) as requested
  join public.match_attendance as attendance
    on attendance.match_id = p_match_id
   and attendance.team_id = p_team_id
   and attendance.user_id = requested.user_id
   and attendance.status = 'pending';
  if v_pending_count <> v_requested_count then
    raise exception using errcode = '55000', message = 'Only pending attendance can be reminded';
  end if;

  with written as (
    insert into public.notifications (
      team_id, user_id, type, source_entity, source_id, title, body, target_path
    )
    select
      p_team_id,
      requested.user_id,
      'match_reminder',
      'match',
      p_match_id,
      'Nhắc xác nhận tham gia trận đấu',
      'Vui lòng xác nhận tham gia trận gặp ' || v_match.opponent || '.',
      '/teams/' || v_team_slug || '/matches/' || p_match_id::text
    from (
      select distinct requested_user.user_id
      from unnest(p_user_ids) as requested_user(user_id)
    ) as requested
    on conflict (user_id, type, source_entity, source_id) do update
    set title = excluded.title,
        body = excluded.body,
        target_path = excluded.target_path,
        read_at = null,
        created_at = greatest(
          pg_catalog.clock_timestamp(),
          public.notifications.created_at + interval '1 microsecond'
        )
    returning id
  )
  select count(*)::integer into v_written_count from written;

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
      pg_catalog.jsonb_build_object('operation', 'remind', 'recipient_count', v_written_count),
      null
    );
  end if;

  return v_written_count;
end;
$function$;

alter function public.remind_match_attendance( uuid, uuid, uuid[] ) owner to postgres;
revoke execute on function public.remind_match_attendance( uuid, uuid, uuid[] )
from public, anon, authenticated, service_role;
grant execute on function public.remind_match_attendance( uuid, uuid, uuid[] ) to authenticated;

create or replace function public.respond_match_attendance(
  p_team_id uuid,
  p_match_id uuid,
  p_user_id uuid,
  p_status text,
  p_note text,
  p_expected_updated_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_user_id uuid := (select auth.uid());
  v_match public.matches%rowtype;
  v_attendance public.match_attendance%rowtype;
begin
  if v_actor_user_id is null then
    raise exception using errcode = '28000', message = 'Authentication required';
  end if;
  if v_actor_user_id = p_user_id then
    if not private.has_team_permission(p_team_id, 'matches.respond') then
      raise exception using errcode = '42501', message = 'Attendance response permission required';
    end if;
  elsif not private.has_team_permission(p_team_id, 'matches.manage') then
    raise exception using errcode = '42501', message = 'Only own attendance or an Admin override can be changed';
  end if;
  if p_status not in ('available', 'unavailable')
    or (p_note is not null and (p_note <> pg_catalog.btrim(p_note) or pg_catalog.char_length(p_note) not between 1 and 300)) then
    raise exception using errcode = '22023', message = 'Invalid attendance response';
  end if;

  select m.* into v_match
  from public.matches as m
  where m.id = p_match_id and m.team_id = p_team_id
  for update;
  if not found or v_match.status <> 'scheduled' or pg_catalog.now() > v_match.rsvp_deadline then
    raise exception using errcode = '55000', message = 'RSVP window is closed';
  end if;

  select attendance.* into v_attendance
  from public.match_attendance as attendance
  where attendance.match_id = p_match_id
    and attendance.team_id = p_team_id
    and attendance.user_id = p_user_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Attendance invitation not found';
  end if;
  if p_expected_updated_at is distinct from v_attendance.updated_at then
    raise exception using errcode = '40001', message = 'Attendance changed; refresh and retry';
  end if;

  update public.match_attendance
  set status = p_status, note = p_note, responded_at = pg_catalog.now()
  where match_id = p_match_id and team_id = p_team_id and user_id = p_user_id;

  if v_actor_user_id <> p_user_id then
    insert into private.audit_events (
      actor_user_id, team_id, table_name, action, row_key, old_data, new_data, request_id
    ) values (
      v_actor_user_id, p_team_id, 'match_attendance', 'UPDATE',
      pg_catalog.jsonb_build_object('match_id', p_match_id, 'user_id', p_user_id),
      pg_catalog.jsonb_build_object('status', v_attendance.status),
      pg_catalog.jsonb_build_object('status', p_status, 'admin_override', true), null
    );
  end if;
end;
$function$;

alter function public.respond_match_attendance( uuid, uuid, uuid, text, text, timestamptz ) owner to postgres;
revoke execute on function public.respond_match_attendance( uuid, uuid, uuid, text, text, timestamptz )
from public, anon, authenticated, service_role;
grant execute on function public.respond_match_attendance( uuid, uuid, uuid, text, text, timestamptz )
to authenticated;

create or replace function public.manage_match_analysis(
  p_team_id uuid,
  p_match_id uuid,
  p_events jsonb,
  p_player_stats jsonb,
  p_team_metrics jsonb,
  p_expected_updated_at timestamptz
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_user_id uuid := (select auth.uid());
  v_match public.matches%rowtype;
  v_updated_at timestamptz;
begin
  if v_actor_user_id is null then
    raise exception using errcode = '28000', message = 'Authentication required';
  end if;
  if not private.has_team_permission(p_team_id, 'matches.manage') then
    raise exception using errcode = '42501', message = 'Match management permission required';
  end if;
  if p_events is null or jsonb_typeof(p_events) <> 'array' or jsonb_array_length(p_events) > 200
    or p_player_stats is null or jsonb_typeof(p_player_stats) <> 'array' or jsonb_array_length(p_player_stats) > 100
    or p_team_metrics is null or jsonb_typeof(p_team_metrics) <> 'object' or pg_column_size(p_team_metrics) > 4096
    or p_team_metrics - array['possession', 'shots', 'shots_on_target', 'corners'] <> '{}'::jsonb then
    raise exception using errcode = '22023', message = 'Invalid match analysis';
  end if;

  select m.* into v_match
  from public.matches as m
  where m.id = p_match_id and m.team_id = p_team_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Match not found';
  end if;
  if v_match.status <> 'completed' then
    raise exception using errcode = '55000', message = 'Only completed matches can be analysed';
  end if;
  if p_expected_updated_at is distinct from v_match.updated_at then
    raise exception using errcode = '40001', message = 'Match changed; refresh and retry';
  end if;

  delete from public.match_events where match_id = p_match_id and team_id = p_team_id;
  insert into public.match_events (
    match_id, team_id, minute, sequence_no, event_type, team_side,
    player_user_id, secondary_user_id, note, created_by_user_id
  )
  select
    p_match_id,
    p_team_id,
    (event ->> 'minute')::smallint,
    coalesce((event ->> 'sequence_no')::smallint, 1),
    event ->> 'event_type',
    coalesce(event ->> 'team_side', 'team'),
    (event ->> 'player_user_id')::uuid,
    (event ->> 'secondary_user_id')::uuid,
    event ->> 'note',
    v_actor_user_id
  from jsonb_array_elements(p_events) as event;

  delete from public.match_player_stats where match_id = p_match_id and team_id = p_team_id;
  insert into public.match_player_stats (
    match_id, team_id, user_id, minutes_played, goals, assists, rating, is_mvp
  )
  select
    p_match_id,
    p_team_id,
    (stat ->> 'user_id')::uuid,
    coalesce((stat ->> 'minutes_played')::smallint, 0),
    coalesce((stat ->> 'goals')::smallint, 0),
    coalesce((stat ->> 'assists')::smallint, 0),
    (stat ->> 'rating')::numeric(3,1),
    coalesce((stat ->> 'is_mvp')::boolean, false)
  from jsonb_array_elements(p_player_stats) as stat;

  insert into public.match_team_stats (match_id, team_id, schema_version, metrics)
  values (p_match_id, p_team_id, 1, p_team_metrics)
  on conflict (match_id) do update
  set schema_version = excluded.schema_version, metrics = excluded.metrics;

  insert into private.audit_events (
    actor_user_id, team_id, table_name, action, row_key, old_data, new_data, request_id
  ) values (
    v_actor_user_id, p_team_id, 'match_analysis', 'UPDATE',
    pg_catalog.jsonb_build_object('match_id', p_match_id), null,
    pg_catalog.jsonb_build_object(
      'event_count', jsonb_array_length(p_events),
      'player_stat_count', jsonb_array_length(p_player_stats),
      'schema_version', 1
    ), null
  );

  update public.matches
  set updated_at = updated_at
  where id = p_match_id and team_id = p_team_id
  returning updated_at into v_updated_at;

  return v_updated_at;
end;
$function$;

alter function public.manage_match_analysis( uuid, uuid, jsonb, jsonb, jsonb, timestamptz ) owner to postgres;
revoke execute on function public.manage_match_analysis( uuid, uuid, jsonb, jsonb, jsonb, timestamptz )
from public, anon, authenticated, service_role;
grant execute on function public.manage_match_analysis( uuid, uuid, jsonb, jsonb, jsonb, timestamptz )
to authenticated;

create or replace function public.save_match_tactic(
  p_team_id uuid,
  p_match_id uuid,
  p_tactic_id uuid,
  p_mode text,
  p_formation text,
  p_instructions text,
  p_version smallint,
  p_pressing text,
  p_defensive_line text,
  p_slots jsonb,
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
  v_tactic public.match_tactics%rowtype;
  v_tactic_id uuid;
  v_slot_count integer;
  v_unique_user_count integer;
  v_unique_key_count integer;
  v_active_member_count integer;
begin
  if v_actor_user_id is null then
    raise exception using errcode = '28000', message = 'Authentication required';
  end if;
  if not private.has_team_permission(p_team_id, 'tactics.manage') then
    raise exception using errcode = '42501', message = 'Tactics management permission required';
  end if;
  if p_mode not in ('balanced', 'attacking', 'defensive')
    or p_formation not in ('2-3-1', '3-2-1', '2-2-2')
    or p_pressing not in ('low', 'medium', 'high')
    or p_defensive_line not in ('low', 'medium', 'high')
    or p_version is null or p_version <= 0
    or p_slots is null or jsonb_typeof(p_slots) <> 'array' or jsonb_array_length(p_slots) > 30
    or (p_instructions is not null and (
      p_instructions <> pg_catalog.btrim(p_instructions)
      or pg_catalog.char_length(p_instructions) not between 1 and 2000
    )) then
    raise exception using errcode = '22023', message = 'Invalid tactic fields';
  end if;

  select m.* into v_match
  from public.matches as m
  where m.id = p_match_id and m.team_id = p_team_id
  for update;
  if not found or v_match.status <> 'scheduled' then
    raise exception using errcode = '55000', message = 'Tactics require a scheduled match';
  end if;

  select
    count(*),
    count(distinct slot ->> 'user_id'),
    count(distinct slot ->> 'slot_key')
  into v_slot_count, v_unique_user_count, v_unique_key_count
  from jsonb_array_elements(p_slots) as slot;

  if v_slot_count <> v_unique_user_count or v_slot_count <> v_unique_key_count
    or exists (
      select 1
      from jsonb_array_elements(p_slots) as slot
      where slot ->> 'slot_kind' not in ('starter', 'bench')
        or slot ->> 'role_label' not in ('GK', 'DEF', 'MID', 'ATT')
        or (slot ->> 'x')::numeric not between 0 and 100
        or (slot ->> 'y')::numeric not between 0 and 100
        or pg_catalog.char_length(slot ->> 'slot_key') not between 1 and 40
        or (
          slot ? 'shirt_number'
          and (slot ->> 'shirt_number')::smallint not between 1 and 99
        )
    ) then
    raise exception using errcode = '22023', message = 'Invalid or duplicate lineup slot';
  end if;

  select count(*) into v_active_member_count
  from (
    select distinct (slot ->> 'user_id')::uuid as user_id
    from jsonb_array_elements(p_slots) as slot
  ) as requested
  join public.memberships as membership
    on membership.team_id = p_team_id
   and membership.user_id = requested.user_id
   and membership.status = 'active';

  if v_active_member_count <> v_slot_count then
    raise exception using errcode = '23503', message = 'Lineup contains an inactive or unrelated player';
  end if;

  if p_tactic_id is null then
    insert into public.match_tactics (
      team_id, match_id, mode, formation, instructions, pressing, defensive_line,
      version, status, created_by_user_id
    ) values (
      p_team_id, p_match_id, p_mode, p_formation, p_instructions, p_pressing,
      p_defensive_line, p_version, 'draft', v_actor_user_id
    ) returning id into v_tactic_id;
  else
    select tactic.* into v_tactic
    from public.match_tactics as tactic
    where tactic.id = p_tactic_id
      and tactic.team_id = p_team_id
      and tactic.match_id = p_match_id
    for update;
    if not found then
      raise exception using errcode = 'P0002', message = 'Tactic not found';
    end if;
    if v_tactic.status <> 'draft' then
      raise exception using errcode = '55000', message = 'Applied tactic is immutable';
    end if;
    if p_expected_updated_at is distinct from v_tactic.updated_at then
      raise exception using errcode = '40001', message = 'Tactic changed; refresh and retry';
    end if;
    if p_version <> v_tactic.version then
      raise exception using errcode = '40001', message = 'Tactic version changed; refresh and retry';
    end if;

    update public.match_tactics
    set mode = p_mode,
        formation = p_formation,
        instructions = p_instructions,
        pressing = p_pressing,
        defensive_line = p_defensive_line,
        version = p_version + 1
    where id = p_tactic_id and team_id = p_team_id;
    v_tactic_id := p_tactic_id;
    delete from public.lineup_slots where tactic_id = v_tactic_id and team_id = p_team_id;
  end if;

  insert into public.lineup_slots (
    tactic_id, team_id, user_id, slot_kind, slot_key, role_label, shirt_number, x, y
  )
  select
    v_tactic_id,
    p_team_id,
    (slot ->> 'user_id')::uuid,
    slot ->> 'slot_kind',
    slot ->> 'slot_key',
    slot ->> 'role_label',
    (slot ->> 'shirt_number')::smallint,
    (slot ->> 'x')::numeric(5,2),
    (slot ->> 'y')::numeric(5,2)
  from jsonb_array_elements(p_slots) as slot;

  insert into private.audit_events (
    actor_user_id, team_id, table_name, action, row_key, old_data, new_data, request_id
  ) values (
    v_actor_user_id,
    p_team_id,
    'match_tactics',
    case when p_tactic_id is null then 'INSERT' else 'UPDATE' end,
    pg_catalog.jsonb_build_object('id', v_tactic_id),
    case when p_tactic_id is null then null else pg_catalog.jsonb_build_object(
      'status', v_tactic.status,
      'mode', v_tactic.mode,
      'formation', v_tactic.formation,
      'version', v_tactic.version
    ) end,
    pg_catalog.jsonb_build_object(
      'status', 'draft',
      'mode', p_mode,
      'formation', p_formation,
      'version', case when p_tactic_id is null then p_version else p_version + 1 end
    ),
    null
  );

  return v_tactic_id;
end;
$function$;

alter function public.save_match_tactic(
  uuid, uuid, uuid, text, text, text, smallint, text, text, jsonb, timestamptz
) owner to postgres;
revoke execute on function public.save_match_tactic(
  uuid, uuid, uuid, text, text, text, smallint, text, text, jsonb, timestamptz
) from public, anon, authenticated, service_role;
grant execute on function public.save_match_tactic(
  uuid, uuid, uuid, text, text, text, smallint, text, text, jsonb, timestamptz
) to authenticated;

create or replace function public.apply_match_tactic(
  p_team_id uuid,
  p_tactic_id uuid,
  p_expected_updated_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_user_id uuid := (select auth.uid());
  v_tactic public.match_tactics%rowtype;
  v_match_id uuid;
  v_match_status text;
  v_starter_count integer;
  v_goalkeeper_count integer;
begin
  if v_actor_user_id is null then
    raise exception using errcode = '28000', message = 'Authentication required';
  end if;
  if not private.has_team_permission(p_team_id, 'tactics.manage') then
    raise exception using errcode = '42501', message = 'Tactics management permission required';
  end if;

  select tactic.match_id into v_match_id
  from public.match_tactics as tactic
  where tactic.id = p_tactic_id and tactic.team_id = p_team_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'Draft tactic not found';
  end if;

  select m.status into v_match_status
  from public.matches as m
  where m.id = v_match_id and m.team_id = p_team_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Match not found';
  end if;
  if v_match_status <> 'scheduled' then
    raise exception using errcode = '55000', message = 'Tactics require a scheduled match';
  end if;

  select tactic.* into v_tactic
  from public.match_tactics as tactic
  where tactic.id = p_tactic_id
    and tactic.team_id = p_team_id
    and tactic.match_id = v_match_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Draft tactic not found';
  end if;
  if v_tactic.status <> 'draft' then
    raise exception using errcode = '55000', message = 'Tactic is already applied';
  end if;
  if p_expected_updated_at is distinct from v_tactic.updated_at then
    raise exception using errcode = '40001', message = 'Tactic changed; refresh and retry';
  end if;

  select
    count(*) filter (where slot_kind = 'starter'),
    count(*) filter (where slot_kind = 'starter' and role_label = 'GK')
  into v_starter_count, v_goalkeeper_count
  from public.lineup_slots
  where tactic_id = p_tactic_id and team_id = p_team_id;

  if v_starter_count <> 7
    or v_goalkeeper_count <> 1
    or exists (
      select 1
      from public.lineup_slots as slot
      left join public.memberships as membership
        on membership.team_id = slot.team_id
       and membership.user_id = slot.user_id
       and membership.status = 'active'
      where slot.tactic_id = p_tactic_id
        and slot.team_id = p_team_id
        and membership.user_id is null
    ) then
    raise exception using errcode = '23514', message = 'Applied tactic requires seven active unique starters and one goalkeeper';
  end if;

  with demoted as (
    update public.match_tactics
    set status = 'draft', applied_at = null, applied_by_user_id = null
    where match_id = v_tactic.match_id
      and mode = v_tactic.mode
      and status = 'applied'
      and id <> p_tactic_id
    returning id, version
  )
  insert into private.audit_events (
    actor_user_id, team_id, table_name, action, row_key, old_data, new_data, request_id
  )
  select
    v_actor_user_id,
    p_team_id,
    'match_tactics',
    'UPDATE',
    pg_catalog.jsonb_build_object('id', demoted.id),
    pg_catalog.jsonb_build_object('status', 'applied', 'version', demoted.version),
    pg_catalog.jsonb_build_object('status', 'draft', 'version', demoted.version),
    null
  from demoted;

  update public.match_tactics
  set status = 'applied', applied_at = pg_catalog.now(), applied_by_user_id = v_actor_user_id
  where id = p_tactic_id and team_id = p_team_id;

  insert into private.audit_events (
    actor_user_id, team_id, table_name, action, row_key, old_data, new_data, request_id
  ) values (
    v_actor_user_id, p_team_id, 'match_tactics', 'UPDATE',
    pg_catalog.jsonb_build_object('id', p_tactic_id),
    pg_catalog.jsonb_build_object('status', 'draft'),
    pg_catalog.jsonb_build_object('status', 'applied', 'version', v_tactic.version), null
  );
end;
$function$;

alter function public.apply_match_tactic( uuid, uuid, timestamptz ) owner to postgres;
revoke execute on function public.apply_match_tactic( uuid, uuid, timestamptz )
from public, anon, authenticated, service_role;
grant execute on function public.apply_match_tactic( uuid, uuid, timestamptz ) to authenticated;

create or replace function public.manage_finance_entry(
  p_action text,
  p_team_id uuid,
  p_entry_id uuid,
  p_direction text,
  p_amount_vnd bigint,
  p_category text,
  p_occurred_on date,
  p_description text,
  p_void_reason text,
  p_expected_updated_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_user_id uuid := (select auth.uid());
  v_entry public.finance_entries%rowtype;
  v_entry_id uuid;
begin
  if v_actor_user_id is null then
    raise exception using errcode = '28000', message = 'Authentication required';
  end if;
  if not private.has_team_permission(p_team_id, 'finance.manage') then
    raise exception using errcode = '42501', message = 'Finance management permission required';
  end if;
  if p_action not in ('create', 'void') then
    raise exception using errcode = '22023', message = 'Invalid finance action';
  end if;

  if p_action = 'create' then
    if p_entry_id is not null or p_direction not in ('income', 'expense')
      or p_amount_vnd is null or p_amount_vnd <= 0
      or p_category is null or p_occurred_on is null or p_description is null
      or p_void_reason is not null or p_expected_updated_at is not null then
      raise exception using errcode = '22023', message = 'Invalid finance entry';
    end if;

    insert into public.finance_entries (
      team_id, direction, amount_vnd, category, occurred_on, description, created_by_user_id
    ) values (
      p_team_id, p_direction, p_amount_vnd, p_category, p_occurred_on, p_description, v_actor_user_id
    ) returning id into v_entry_id;

    insert into private.audit_events (
      actor_user_id, team_id, table_name, action, row_key, old_data, new_data, request_id
    ) values (
      v_actor_user_id, p_team_id, 'finance_entries', 'INSERT',
      pg_catalog.jsonb_build_object('id', v_entry_id), null,
      pg_catalog.jsonb_build_object('direction', p_direction, 'amount_vnd', p_amount_vnd), null
    );
    return v_entry_id;
  end if;

  select entry.* into v_entry
  from public.finance_entries as entry
  where entry.id = p_entry_id and entry.team_id = p_team_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Finance entry not found';
  end if;
  if v_entry.voided_at is not null then
    raise exception using errcode = '55000', message = 'Finance entry is already void';
  end if;
  if p_expected_updated_at is distinct from v_entry.updated_at then
    raise exception using errcode = '40001', message = 'Finance entry changed; refresh and retry';
  end if;
  if p_void_reason is null or p_void_reason <> pg_catalog.btrim(p_void_reason)
    or pg_catalog.char_length(p_void_reason) not between 1 and 300 then
    raise exception using errcode = '22023', message = 'Void reason is required';
  end if;
  if exists (
    select 1 from public.member_dues as due
    where due.finance_entry_id = p_entry_id and due.team_id = p_team_id and due.status = 'paid'
  ) then
    raise exception using errcode = '55000', message = 'Paid due entry cannot be voided directly';
  end if;

  update public.finance_entries
  set voided_at = pg_catalog.now(), voided_by_user_id = v_actor_user_id, void_reason = p_void_reason
  where id = p_entry_id and team_id = p_team_id;

  insert into private.audit_events (
    actor_user_id, team_id, table_name, action, row_key, old_data, new_data, request_id
  ) values (
    v_actor_user_id, p_team_id, 'finance_entries', 'UPDATE',
    pg_catalog.jsonb_build_object('id', p_entry_id),
    pg_catalog.jsonb_build_object('voided', false),
    pg_catalog.jsonb_build_object('voided', true, 'void_reason', p_void_reason), null
  );
  return p_entry_id;
end;
$function$;

alter function public.manage_finance_entry(
  text, uuid, uuid, text, bigint, text, date, text, text, timestamptz
) owner to postgres;
revoke execute on function public.manage_finance_entry(
  text, uuid, uuid, text, bigint, text, date, text, text, timestamptz
) from public, anon, authenticated, service_role;
grant execute on function public.manage_finance_entry(
  text, uuid, uuid, text, bigint, text, date, text, text, timestamptz
) to authenticated;

create or replace function public.manage_member_due(
  p_action text,
  p_team_id uuid,
  p_due_id uuid,
  p_user_id uuid,
  p_period_start date,
  p_amount_vnd bigint,
  p_due_date date,
  p_note text,
  p_expected_updated_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_user_id uuid := (select auth.uid());
  v_due public.member_dues%rowtype;
  v_entry public.finance_entries%rowtype;
  v_due_id uuid;
  v_entry_id uuid;
begin
  if v_actor_user_id is null then
    raise exception using errcode = '28000', message = 'Authentication required';
  end if;
  if not private.has_team_permission(p_team_id, 'finance.manage') then
    raise exception using errcode = '42501', message = 'Finance management permission required';
  end if;
  if p_action not in ('create', 'pay', 'waive', 'void_payment') then
    raise exception using errcode = '22023', message = 'Invalid member due action';
  end if;

  if p_action = 'create' then
    if p_due_id is not null or p_user_id is null or p_period_start is null
      or p_period_start <> date_trunc('month', p_period_start)::date
      or p_amount_vnd is null or p_amount_vnd <= 0
      or p_due_date is null or p_due_date < p_period_start
      or p_expected_updated_at is not null then
      raise exception using errcode = '22023', message = 'Invalid member due';
    end if;
    if not exists (
      select 1 from public.memberships as membership
      where membership.team_id = p_team_id
        and membership.user_id = p_user_id
        and membership.status = 'active'
    ) then
      raise exception using errcode = '23503', message = 'Due member is not active';
    end if;

    insert into public.member_dues (
      team_id, user_id, period_start, amount_vnd, due_date, created_by_user_id
    ) values (
      p_team_id, p_user_id, p_period_start, p_amount_vnd, p_due_date, v_actor_user_id
    ) returning id into v_due_id;
  else
    select due.* into v_due
    from public.member_dues as due
    where due.id = p_due_id and due.team_id = p_team_id
    for update;
    if not found then
      raise exception using errcode = 'P0002', message = 'Member due not found';
    end if;
    if p_expected_updated_at is distinct from v_due.updated_at then
      raise exception using errcode = '40001', message = 'Member due changed; refresh and retry';
    end if;

    if p_action in ('pay', 'waive') and v_due.status <> 'pending' then
      raise exception using errcode = '55000', message = 'Only pending dues can be paid or waived';
    end if;
    if p_action = 'void_payment' and (
      v_due.status <> 'paid' or v_due.finance_entry_id is null
    ) then
      raise exception using errcode = '55000', message = 'Only paid dues can have their payment voided';
    end if;

    if p_action = 'pay' then
      insert into public.finance_entries (
        team_id, direction, amount_vnd, category, occurred_on, description, created_by_user_id
      ) values (
        p_team_id,
        'income',
        v_due.amount_vnd,
        'member_due',
        current_date,
        coalesce(nullif(pg_catalog.btrim(p_note), ''), 'Member due payment'),
        v_actor_user_id
      ) returning id into v_entry_id;

      update public.member_dues
      set status = 'paid', paid_at = pg_catalog.now(), finance_entry_id = v_entry_id
      where id = p_due_id and team_id = p_team_id;
    elsif p_action = 'waive' then
      update public.member_dues
      set status = 'waived'
      where id = p_due_id and team_id = p_team_id;
    else
      if p_note is null or p_note <> pg_catalog.btrim(p_note)
        or pg_catalog.char_length(p_note) not between 1 and 300 then
        raise exception using errcode = '22023', message = 'Payment void reason is required';
      end if;

      select entry.* into v_entry
      from public.finance_entries as entry
      where entry.id = v_due.finance_entry_id and entry.team_id = p_team_id
      for update;
      if not found or v_entry.voided_at is not null then
        raise exception using errcode = '55000', message = 'Due payment entry cannot be voided';
      end if;

      v_entry_id := v_due.finance_entry_id;
      update public.finance_entries
      set voided_at = pg_catalog.now(), voided_by_user_id = v_actor_user_id, void_reason = p_note
      where id = v_entry_id and team_id = p_team_id;

      update public.member_dues
      set status = 'pending', paid_at = null, finance_entry_id = null
      where id = p_due_id and team_id = p_team_id;

      insert into private.audit_events (
        actor_user_id, team_id, table_name, action, row_key, old_data, new_data, request_id
      ) values (
        v_actor_user_id, p_team_id, 'finance_entries', 'UPDATE',
        pg_catalog.jsonb_build_object('id', v_entry_id),
        pg_catalog.jsonb_build_object('voided', false, 'source', 'member_due'),
        pg_catalog.jsonb_build_object('voided', true, 'source', 'member_due', 'void_reason', p_note),
        null
      );
    end if;
    v_due_id := p_due_id;
  end if;

  insert into private.audit_events (
    actor_user_id, team_id, table_name, action, row_key, old_data, new_data, request_id
  ) values (
    v_actor_user_id, p_team_id, 'member_dues',
    case when p_action = 'create' then 'INSERT' else 'UPDATE' end,
    pg_catalog.jsonb_build_object('id', v_due_id), null,
    pg_catalog.jsonb_build_object('operation', p_action, 'finance_entry_id', v_entry_id), null
  );
  return v_due_id;
end;
$function$;

alter function public.manage_member_due(
  text, uuid, uuid, uuid, date, bigint, date, text, timestamptz
) owner to postgres;
revoke execute on function public.manage_member_due(
  text, uuid, uuid, uuid, date, bigint, date, text, timestamptz
) from public, anon, authenticated, service_role;
grant execute on function public.manage_member_due(
  text, uuid, uuid, uuid, date, bigint, date, text, timestamptz
) to authenticated;

commit;
