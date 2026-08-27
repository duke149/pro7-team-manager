import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const migrationsDirectory = fileURLToPath(
  new URL("../supabase/migrations/", import.meta.url),
);

function normalizeSql(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//gu, " ")
    .replace(/--[^\n\r]*/gu, " ")
    .toLowerCase()
    .replace(/\s+/gu, " ")
    .trim();
}

async function readMigration() {
  const matchingFiles = (await readdir(migrationsDirectory)).filter((file) =>
    file.endsWith("_pro7_remaining_mvp.sql"),
  );

  assert.equal(
    matchingFiles.length,
    1,
    "expected exactly one CLI-generated remaining-MVP migration",
  );

  return readFile(path.join(migrationsDirectory, matchingFiles[0]), "utf8");
}

function extractFunction(sql, qualifiedName) {
  const escapedName = qualifiedName.replaceAll(".", "\\.");
  return sql.match(
    new RegExp(`create or replace function ${escapedName}\\([\\s\\S]*?\\$function\\$;`),
  )?.[0];
}

test("remaining MVP tables use tenant-safe relational contracts", async () => {
  const sql = normalizeSql(await readMigration());

  for (const table of [
    "matches",
    "match_attendance",
    "match_events",
    "match_player_stats",
    "match_team_stats",
    "team_news",
    "match_tactics",
    "lineup_slots",
    "finance_entries",
    "member_dues",
    "notifications",
  ]) {
    assert.match(sql, new RegExp(`create table public\\.${table} \\(`));
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security;`));
  }

  for (const clause of [
    /constraint matches_id_team_id_key unique \(id, team_id\)/,
    /constraint match_attendance_match_team_fkey foreign key \(match_id, team_id\) references public\.matches \(id, team_id\) on delete cascade/,
    /constraint match_attendance_membership_fkey foreign key \(team_id, user_id\) references public\.memberships \(team_id, user_id\) on delete restrict/,
    /constraint match_events_match_team_fkey foreign key \(match_id, team_id\) references public\.matches \(id, team_id\) on delete cascade/,
    /constraint match_player_stats_membership_fkey foreign key \(team_id, user_id\) references public\.memberships \(team_id, user_id\) on delete restrict/,
    /constraint match_team_stats_match_team_fkey foreign key \(match_id, team_id\) references public\.matches \(id, team_id\) on delete cascade/,
    /constraint match_tactics_match_team_fkey foreign key \(match_id, team_id\) references public\.matches \(id, team_id\) on delete cascade/,
    /constraint lineup_slots_tactic_team_fkey foreign key \(tactic_id, team_id\) references public\.match_tactics \(id, team_id\) on delete cascade/,
    /constraint lineup_slots_membership_fkey foreign key \(team_id, user_id\) references public\.memberships \(team_id, user_id\) on delete restrict/,
    /constraint member_dues_finance_entry_team_fkey foreign key \(finance_entry_id, team_id\) references public\.finance_entries \(id, team_id\) on delete restrict/,
    /constraint notifications_membership_fkey foreign key \(team_id, user_id\) references public\.memberships \(team_id, user_id\) on delete cascade/,
    /constraint notifications_match_team_fkey foreign key \(source_id, team_id\) references public\.matches \(id, team_id\) on delete cascade/,
  ]) {
    assert.match(sql, clause);
  }
});

test("notifications are bounded, tenant-safe, idempotent, and local-path only", async () => {
  const sql = normalizeSql(await readMigration());

  for (const clause of [
    /constraint notifications_type_check check \(type in \('match_invitation', 'match_reminder'\)\)/,
    /constraint notifications_source_check check \(source_entity = 'match'\)/,
    /constraint notifications_title_check check \(title = btrim\(title\) and char_length\(title\) between 1 and 160\)/,
    /constraint notifications_body_check check \(body = btrim\(body\) and char_length\(body\) between 1 and 500\)/,
    /constraint notifications_target_path_check check \( target_path = btrim\(target_path\) and char_length\(target_path\) between 1 and 200 and target_path ~ '\^\/teams\//,
    /constraint notifications_user_type_source_key unique \(user_id, type, source_entity, source_id\)/,
    /create index notifications_user_created_at_idx on public\.notifications \(user_id, created_at desc\)/,
    /create index notifications_source_team_idx on public\.notifications \(source_id, team_id\)/,
    /create index notifications_team_user_idx on public\.notifications \(team_id, user_id\)/,
  ]) {
    assert.match(sql, clause);
  }
});

test("matches attendance and analysis have bounded states and access indexes", async () => {
  const sql = normalizeSql(await readMigration());

  for (const clause of [
    /constraint matches_status_check check \(status in \('scheduled', 'completed', 'cancelled'\)\)/,
    /constraint matches_result_check check \( \(status = 'completed' and team_score is not null and opponent_score is not null and cancelled_at is null\) or \(status = 'cancelled' and team_score is null and opponent_score is null and cancelled_at is not null\) or \(status = 'scheduled' and team_score is null and opponent_score is null and cancelled_at is null\) \)/,
    /constraint match_attendance_status_check check \(status in \('pending', 'available', 'unavailable'\)\)/,
    /constraint match_attendance_response_check check \( \(status = 'pending' and responded_at is null\) or \(status in \('available', 'unavailable'\) and responded_at is not null\) \)/,
    /constraint match_events_type_check check \(event_type in \('goal', 'yellow_card', 'red_card', 'substitution', 'note'\)\)/,
    /constraint match_player_stats_values_check check \( minutes_played between 0 and 120 and goals >= 0 and assists >= 0 and \(rating is null or rating between 0 and 10\) \)/,
    /constraint match_team_stats_metrics_check check \( schema_version = 1 and jsonb_typeof\(metrics\) = 'object' and pg_column_size\(metrics\) <= 4096/,
    /create index matches_team_status_starts_at_idx on public\.matches \(team_id, status, starts_at\)/,
    /create index match_attendance_team_match_status_idx on public\.match_attendance \(team_id, match_id, status\)/,
    /create index match_events_team_match_minute_idx on public\.match_events \(team_id, match_id, minute, sequence_no\)/,
    /create index match_player_stats_team_user_idx on public\.match_player_stats \(team_id, user_id, match_id\)/,
  ]) {
    assert.match(sql, clause);
  }
});

test("news tactics and lineup constraints protect applied visibility and seven-a-side data", async () => {
  const sql = normalizeSql(await readMigration());

  for (const clause of [
    /constraint team_news_status_check check \(status in \('draft', 'published'\)\)/,
    /constraint match_tactics_status_check check \(status in \('draft', 'applied'\)\)/,
    /constraint match_tactics_mode_check check \(mode in \('balanced', 'attacking', 'defensive'\)\)/,
    /constraint lineup_slots_kind_check check \(slot_kind in \('starter', 'bench'\)\)/,
    /constraint lineup_slots_coordinates_check check \(x between 0 and 100 and y between 0 and 100\)/,
    /constraint lineup_slots_tactic_user_key unique \(tactic_id, user_id\)/,
    /constraint lineup_slots_tactic_slot_key unique \(tactic_id, slot_key\)/,
    /create unique index match_tactics_one_applied_per_match_mode on public\.match_tactics \(match_id, mode\) where status = 'applied'/,
    /create policy match_tactics_select_authorized on public\.match_tactics for select to authenticated using \( private\.has_team_permission\(team_id, 'tactics\.manage'\) or \(status = 'applied' and private\.has_team_permission\(team_id, 'tactics\.read'\)\) \)/,
    /create policy lineup_slots_select_authorized on public\.lineup_slots for select to authenticated using \( exists \( select 1 from public\.match_tactics as tactic where tactic\.id = public\.lineup_slots\.tactic_id and tactic\.team_id = public\.lineup_slots\.team_id and \( private\.has_team_permission\(public\.lineup_slots\.team_id, 'tactics\.manage'\) or \( tactic\.status = 'applied' and private\.has_team_permission\(public\.lineup_slots\.team_id, 'tactics\.read'\) \) \) \) \)/,
  ]) {
    assert.match(sql, clause);
  }
});

test("finance uses integer VND, admin-only policies, and void semantics", async () => {
  const sql = normalizeSql(await readMigration());

  for (const clause of [
    /amount_vnd bigint not null/,
    /constraint finance_entries_amount_check check \(amount_vnd > 0\)/,
    /constraint finance_entries_direction_check check \(direction in \('income', 'expense'\)\)/,
    /constraint finance_entries_void_check check \( \(voided_at is null and voided_by_user_id is null and void_reason is null\) or \(voided_at is not null and voided_by_user_id is not null and void_reason is not null\) \)/,
    /constraint member_dues_status_check check \(status in \('pending', 'paid', 'waived'\)\)/,
    /constraint member_dues_payment_check check \( \(status = 'paid' and paid_at is not null and finance_entry_id is not null\) or \(status in \('pending', 'waived'\) and paid_at is null and finance_entry_id is null\) \)/,
    /create policy finance_entries_select_authorized on public\.finance_entries for select to authenticated using \(private\.has_team_permission\(team_id, 'finance\.read'\)\)/,
    /create policy member_dues_select_authorized on public\.member_dues for select to authenticated using \(private\.has_team_permission\(team_id, 'finance\.read'\)\)/,
  ]) {
    assert.match(sql, clause);
  }
  assert.doesNotMatch(sql, /create policy finance_entries_(?:insert|update|delete)/);
  assert.doesNotMatch(sql, /create policy member_dues_(?:insert|update|delete)/);
});

test("table grants are explicit and direct writes stay closed", async () => {
  const sql = normalizeSql(await readMigration());
  const tables = [
    "matches",
    "match_attendance",
    "match_events",
    "match_player_stats",
    "match_team_stats",
    "team_news",
    "match_tactics",
    "lineup_slots",
    "finance_entries",
    "member_dues",
    "notifications",
  ].join(", public\\.");

  assert.match(
    sql,
    new RegExp(`revoke all privileges on table public\\.${tables} from public, anon, authenticated, service_role;`),
  );
  assert.match(
    sql,
    new RegExp(`grant select, insert, update, delete on table public\\.${tables} to service_role;`),
  );
  assert.match(sql, /grant select on table public\.matches, public\.match_attendance, public\.match_events, public\.match_player_stats, public\.match_team_stats, public\.team_news, public\.match_tactics, public\.lineup_slots, public\.finance_entries, public\.member_dues, public\.notifications to authenticated;/);
  assert.match(sql, /grant update \(read_at\) on table public\.notifications to authenticated/);
  assert.doesNotMatch(sql, /grant (?:insert|delete)[^;]*to authenticated/);
  assert.doesNotMatch(sql, /grant update on table[^;]*to authenticated/);
});

test("RLS allows team reads, published news, and own optimistic RSVP only", async () => {
  const sql = normalizeSql(await readMigration());

  for (const clause of [
    /create policy matches_select_authorized on public\.matches for select to authenticated using \(private\.has_team_permission\(team_id, 'matches\.read'\)\)/,
    /create policy match_attendance_select_authorized on public\.match_attendance for select to authenticated using \(private\.has_team_permission\(team_id, 'matches\.read'\)\)/,
    /create policy team_news_select_authorized on public\.team_news for select to authenticated using \( private\.has_team_permission\(team_id, 'news\.manage'\) or \(status = 'published' and private\.has_team_permission\(team_id, 'news\.read'\)\) \)/,
    /create policy notifications_select_own on public\.notifications for select to authenticated using \(user_id = \(select auth\.uid\(\)\)\)/,
    /create policy notifications_update_own on public\.notifications for update to authenticated using \(user_id = \(select auth\.uid\(\)\)\) with check \(user_id = \(select auth\.uid\(\)\)\)/,
  ]) {
    assert.match(sql, clause);
  }
  assert.doesNotMatch(sql, /create policy notifications_(?:insert|delete)/);
});

test("all narrow RPCs are hardened, owned, and explicitly ACLed", async () => {
  const sql = normalizeSql(await readMigration());
  const signatures = {
    manage_match: "text, uuid, uuid, text, timestamptz, text, boolean, timestamptz, smallint, smallint, timestamptz",
    invite_match_attendance: "uuid, uuid, uuid[]",
    respond_match_attendance: "uuid, uuid, uuid, text, text, timestamptz",
    manage_match_analysis: "uuid, uuid, jsonb, jsonb, jsonb, timestamptz",
    save_match_tactic: "uuid, uuid, uuid, text, text, text, smallint, text, text, jsonb, timestamptz",
    apply_match_tactic: "uuid, uuid, timestamptz",
    manage_finance_entry: "text, uuid, uuid, text, bigint, text, date, text, text, timestamptz",
    manage_member_due: "text, uuid, uuid, uuid, date, bigint, date, text, timestamptz",
    remind_match_attendance: "uuid, uuid",
  };

  for (const [name, signature] of Object.entries(signatures)) {
    const functionSql = extractFunction(sql, `public.${name}`);
    assert.ok(functionSql, `missing ${name}`);
    assert.match(functionSql, /language plpgsql security definer set search_path = ''/);
    assert.match(functionSql, /v_actor_user_id uuid := \(select auth\.uid\(\)\)/);
    assert.match(sql, new RegExp(`alter function public\\.${name}\\( ${signature.replaceAll("[]", "\\[\\]")} \\) owner to postgres;`));
    assert.match(sql, new RegExp(`revoke execute on function public\\.${name}\\( ${signature.replaceAll("[]", "\\[\\]")} \\) from public, anon, authenticated, service_role;`));
    assert.match(sql, new RegExp(`grant execute on function public\\.${name}\\( ${signature.replaceAll("[]", "\\[\\]")} \\) to authenticated;`));
  }
});

test("RPCs enforce permission, concurrency, lifecycle, lineup, void, and audit behavior", async () => {
  const sql = normalizeSql(await readMigration());

  const manageMatch = extractFunction(sql, "public.manage_match");
  assert.match(manageMatch, /private\.has_team_permission\(p_team_id, 'matches\.manage'\)/);
  assert.match(manageMatch, /p_expected_updated_at is distinct from v_match\.updated_at/);
  assert.match(manageMatch, /v_match\.status <> 'scheduled'/);
  assert.match(manageMatch, /status = 'cancelled'/);
  assert.match(manageMatch, /status = 'completed'/);
  assert.match(manageMatch, /insert into private\.audit_events/);

  const invite = extractFunction(sql, "public.invite_match_attendance");
  assert.match(invite, /private\.has_team_permission\(p_team_id, 'matches\.manage'\)/);
  assert.match(invite, /on conflict \(match_id, user_id\) do nothing/);
  assert.match(invite, /if v_inserted_count > 0 then/);
  assert.match(invite, /v_match\.status <> 'scheduled'/);
  assert.match(invite, /insert into public\.notifications/);
  assert.match(invite, /'match_invitation'/);
  assert.match(invite, /on conflict \(user_id, type, source_entity, source_id\) do nothing/);
  assert.match(invite, /'\/teams\/' \|\| v_team_slug \|\| '\/matches\/' \|\| p_match_id::text/);

  const remind = extractFunction(sql, "public.remind_match_attendance");
  assert.match(remind, /private\.has_team_permission\(p_team_id, 'matches\.manage'\)/);
  assert.match(remind, /where m\.id = p_match_id and m\.team_id = p_team_id for update/);
  assert.doesNotMatch(remind, /p_user_ids|unnest\(/);
  assert.match(remind, /from public\.match_attendance as attendance/);
  assert.match(remind, /join public\.memberships as membership/);
  assert.match(remind, /attendance\.status = 'pending'/);
  assert.match(remind, /membership\.status = 'active'/);
  assert.match(remind, /order by attendance\.user_id/);
  assert.match(remind, /on conflict \(user_id, type, source_entity, source_id\) do update/);
  assert.match(remind, /read_at = null/);
  assert.match(remind, /if v_written_count > 0 then/);
  assert.match(remind, /insert into private\.audit_events/);
  assert.doesNotMatch(remind, /update public\.match_attendance/);
  assert.ok(
    remind.indexOf("for update") < remind.indexOf("from public.match_attendance as attendance"),
    "the match row must be locked before reminder recipients are derived",
  );

  const respond = extractFunction(sql, "public.respond_match_attendance");
  assert.match(respond, /v_actor_user_id <> p_user_id/);
  assert.match(respond, /private\.has_team_permission\(p_team_id, 'matches\.respond'\)/);
  assert.match(respond, /private\.has_team_permission\(p_team_id, 'matches\.manage'\)/);
  assert.match(respond, /p_expected_updated_at is distinct from v_attendance\.updated_at/);
  assert.match(respond, /status = p_status/);
  assert.match(respond, /insert into private\.audit_events/);
  assert.match(respond, /where m\.id = p_match_id and m\.team_id = p_team_id for update/);

  const analysis = extractFunction(sql, "public.manage_match_analysis");
  assert.match(analysis, /private\.has_team_permission\(p_team_id, 'matches\.manage'\)/);
  assert.match(analysis, /p_events is null/);
  assert.match(analysis, /p_player_stats is null/);
  assert.match(analysis, /p_team_metrics is null/);
  assert.match(analysis, /v_match\.status <> 'completed'/);
  assert.match(analysis, /update public\.matches set updated_at = updated_at where id = p_match_id and team_id = p_team_id returning updated_at into v_updated_at/);
  assert.match(analysis, /return v_updated_at/);
  assert.match(analysis, /insert into private\.audit_events/);

  const saveTactic = extractFunction(sql, "public.save_match_tactic");
  assert.match(saveTactic, /private\.has_team_permission\(p_team_id, 'tactics\.manage'\)/);
  assert.match(saveTactic, /p_slots is null/);
  assert.match(saveTactic, /where m\.id = p_match_id and m\.team_id = p_team_id for update/);
  assert.match(saveTactic, /jsonb_array_elements\(p_slots\)/);
  assert.match(saveTactic, /count\(distinct slot ->> 'user_id'\)/);
  assert.match(saveTactic, /insert into private\.audit_events/);
  assert.doesNotMatch(
    saveTactic.slice(saveTactic.indexOf("insert into private.audit_events")),
    /p_slots|p_instructions/,
  );
  assert.match(saveTactic, /jsonb_build_object\( 'status', 'draft', 'mode', p_mode, 'formation', p_formation, 'version'/);

  const applyTactic = extractFunction(sql, "public.apply_match_tactic");
  assert.match(applyTactic, /count\(\*\) filter \(where slot_kind = 'starter'\)/);
  assert.match(applyTactic, /count\(\*\) filter \(where slot_kind = 'starter' and role_label = 'gk'\)/);
  assert.match(applyTactic, /v_starter_count <> 7/);
  assert.match(applyTactic, /v_goalkeeper_count <> 1/);
  assert.match(applyTactic, /status = 'applied'/);
  assert.match(applyTactic, /where m\.id = v_match_id and m\.team_id = p_team_id for update/);
  assert.match(applyTactic, /with demoted as \( update public\.match_tactics/);
  assert.match(applyTactic, /from demoted/);
  assert.match(applyTactic, /insert into private\.audit_events/);

  const finance = extractFunction(sql, "public.manage_finance_entry");
  assert.match(finance, /private\.has_team_permission\(p_team_id, 'finance\.manage'\)/);
  assert.match(finance, /voided_at = pg_catalog\.now\(\)/);
  assert.match(finance, /insert into private\.audit_events/);

  const dues = extractFunction(sql, "public.manage_member_due");
  assert.match(dues, /private\.has_team_permission\(p_team_id, 'finance\.manage'\)/);
  assert.match(dues, /p_action not in \('create', 'pay', 'waive', 'void_payment'\)/);
  assert.match(dues, /status = 'paid'/);
  assert.match(dues, /set voided_at = pg_catalog\.now\(\), voided_by_user_id = v_actor_user_id, void_reason = p_note/);
  assert.match(dues, /set status = 'pending', paid_at = null, finance_entry_id = null/);
  assert.match(dues, /insert into private\.audit_events/);
});

test("new-table timestamps are monotonic inside one transaction", async () => {
  const sql = normalizeSql(await readMigration());
  const helper = extractFunction(sql, "private.set_monotonic_updated_at");

  assert.ok(helper, "missing monotonic updated_at trigger helper");
  assert.match(helper, /new\.updated_at := greatest\( pg_catalog\.clock_timestamp\(\), old\.updated_at \+ interval '1 microsecond' \)/);
  assert.match(sql, /execute function private\.set_monotonic_updated_at\(\)/);
  assert.match(sql, /revoke execute on function private\.set_monotonic_updated_at\(\) from public, anon, authenticated, service_role/);
});
