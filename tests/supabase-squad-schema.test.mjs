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
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n\r]*/g, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

async function readSquadMigration() {
  const matchingFiles = (await readdir(migrationsDirectory))
    .filter((file) => file.endsWith("_pro7_squad_profiles.sql"));

  assert.equal(
    matchingFiles.length,
    1,
    "expected exactly one CLI-generated PRO7 squad migration",
  );

  return readFile(path.join(migrationsDirectory, matchingFiles[0]), "utf8");
}

function extractFunction(sql, qualifiedName) {
  const escapedName = qualifiedName.replaceAll(".", "\\.");
  return sql.match(
    new RegExp(`create or replace function ${escapedName}\\([\\s\\S]*?\\$function\\$;`),
  )?.[0];
}

test("squad migration adds bounded personal profile fields", async () => {
  const sql = normalizeSql(await readSquadMigration());

  for (const clause of [
    /add column if not exists phone text/,
    /add column if not exists date_of_birth date/,
    /add column if not exists height_cm smallint/,
    /add column if not exists weight_kg numeric\(5,2\)/,
    /add column if not exists preferred_positions text\[\] not null default '\{\}'::text\[\]/,
    /add column if not exists avatar_path text/,
  ]) {
    assert.match(sql, clause);
  }

  assert.match(sql, /phone is null or \( phone = btrim\(phone\) and char_length\(phone\) <= 30 \)/);
  assert.match(sql, /date_of_birth is null or date_of_birth <= current_date/);
  assert.match(sql, /height_cm is null or height_cm between 100 and 250/);
  assert.match(sql, /weight_kg is null or \(weight_kg > 30 and weight_kg <= 300\)/);
  assert.match(sql, /preferred_positions <@ array\['gk', 'def', 'mid', 'att'\]::text\[\]/);
  assert.match(sql, /cardinality\(preferred_positions\) <= 4/);
  for (const position of ["gk", "def", "mid", "att"]) {
    assert.match(
      sql,
      new RegExp(`cardinality\\(array_positions\\(preferred_positions, '${position}'\\)\\) <= 1`),
    );
  }
  assert.match(sql, /avatar_path = btrim\(avatar_path\)/);
  assert.match(sql, /char_length\(avatar_path\) <= 300/);
  assert.match(sql, /avatar_path like id::text \|\| '\/%'/);
});

test("squad migration creates the constrained team-player relation and access indexes", async () => {
  const sql = normalizeSql(await readSquadMigration());

  assert.match(
    sql,
    /create table public\.team_player_profiles \( team_id uuid not null, user_id uuid not null,/,
  );
  assert.match(sql, /constraint team_player_profiles_pkey primary key \(team_id, user_id\)/);
  assert.match(
    sql,
    /constraint team_player_profiles_membership_fkey foreign key \(team_id, user_id\) references public\.memberships \(team_id, user_id\) on delete restrict/,
  );
  assert.match(sql, /shirt_number smallint[\s\S]*shirt_number between 1 and 99/);
  assert.match(sql, /official_position text[\s\S]*official_position in \('gk', 'def', 'mid', 'att'\)/);
  assert.match(sql, /player_status text not null default 'available'[\s\S]*player_status in \('available', 'injured', 'unavailable'\)/);
  assert.match(sql, /join_date date not null default current_date[\s\S]*join_date <= current_date/);
  assert.match(sql, /admin_notes text[\s\S]*admin_notes = btrim\(admin_notes\)[\s\S]*char_length\(admin_notes\) <= 1000/);
  assert.match(sql, /created_at timestamptz not null default pg_catalog\.now\(\)/);
  assert.match(sql, /updated_at timestamptz not null default pg_catalog\.now\(\)/);
  assert.match(
    sql,
    /create unique index team_player_profiles_team_shirt_number_key on public\.team_player_profiles \(team_id, shirt_number\) where shirt_number is not null;/,
  );
  assert.match(
    sql,
    /create index team_player_profiles_team_status_position_idx on public\.team_player_profiles \(team_id, player_status, official_position\);/,
  );
  assert.match(
    sql,
    /create index team_player_profiles_user_id_team_id_idx on public\.team_player_profiles \(user_id, team_id\);/,
  );
  assert.match(
    sql,
    /create trigger trg_team_player_profiles_set_updated_at before update on public\.team_player_profiles for each row execute function private\.set_updated_at\(\);/,
  );
  assert.match(
    sql,
    /insert into public\.team_player_profiles \(team_id, user_id, join_date\) select m\.team_id, m\.user_id, least\(m\.joined_at::date, current_date\) from public\.memberships as m where m\.status = 'active' on conflict \(team_id, user_id\) do nothing;/,
    "existing active memberships must not disappear from the new squad relation",
  );
  assert.match(
    sql,
    /create or replace function private\.ensure_team_player_profile\(\) returns trigger language plpgsql security invoker set search_path = ''/,
    "membership synchronization does not need definer privilege",
  );
  assert.match(
    sql,
    /create trigger trg_memberships_ensure_team_player_profile after insert or update of status on public\.memberships for each row when \(new\.status = 'active'\) execute function private\.ensure_team_player_profile\(\);/,
    "future invitation/bootstrap membership inserts must also receive a player row",
  );
  assert.match(sql, /alter function private\.ensure_team_player_profile\(\) owner to postgres;/);
  assert.match(
    sql,
    /revoke execute on function private\.ensure_team_player_profile\(\) from public, anon, authenticated, service_role;/,
  );
});

test("squad migration closes legacy write grants and grants only reviewed safe columns", async () => {
  const sql = normalizeSql(await readSquadMigration());

  assert.match(
    sql,
    /revoke update \(avatar_url\) on table public\.profiles from authenticated;/,
    "legacy avatar_url UPDATE must be explicitly revoked",
  );
  assert.match(
    sql,
    /grant update \( display_name, phone, date_of_birth, height_cm, weight_kg, preferred_positions, avatar_path \) on table public\.profiles to authenticated;/,
  );
  assert.doesNotMatch(sql, /grant update[^;]*requires_password_change/);
  assert.doesNotMatch(sql, /grant update[^;]*avatar_url/);
  assert.match(
    sql,
    /grant select \( id, display_name, avatar_url, phone, date_of_birth, height_cm, weight_kg, preferred_positions, avatar_path, requires_password_change, created_at, updated_at \) on table public\.profiles to authenticated;/,
  );
  assert.match(
    sql,
    /grant select \( team_id, user_id, shirt_number, official_position, player_status, join_date, created_at, updated_at \) on table public\.team_player_profiles to authenticated;/,
  );
  assert.doesNotMatch(sql, /grant select[^;]*admin_notes/);
  assert.match(
    sql,
    /revoke all privileges on table public\.team_player_profiles from public, anon, authenticated, service_role;/,
  );
  assert.match(sql, /grant select, insert, update, delete on table public\.team_player_profiles to service_role;/);
  assert.match(sql, /revoke update \(role_id\) on table public\.memberships from authenticated;/);
  assert.match(sql, /revoke update \(status\) on table public\.memberships from authenticated;/);
  assert.match(sql, /revoke delete on table public\.memberships from authenticated;/);
});

test("squad migration enables RLS and exposes only reviewed row visibility", async () => {
  const sql = normalizeSql(await readSquadMigration());

  assert.match(sql, /alter table public\.team_player_profiles enable row level security;/);
  assert.match(
    sql,
    /create policy team_player_profiles_select_authorized on public\.team_player_profiles for select to authenticated using \(private\.has_team_permission\(team_id, 'players\.read'\)\);/,
  );
  assert.doesNotMatch(sql, /create policy team_player_profiles_(?:insert|update|delete)/);
  assert.match(
    sql,
    /create policy profiles_update_own on public\.profiles for update to authenticated using \(\(select auth\.uid\(\)\) = id\) with check \(\(select auth\.uid\(\)\) = id\);/,
  );
  assert.match(
    sql,
    /create or replace function private\.can_view_profile\(p_profile_user_id uuid\)[\s\S]*rp\.permission_code = 'players\.read'[\s\S]*viewer\.user_id = \(select auth\.uid\(\)\)[\s\S]*viewer\.status = 'active'/,
  );
  assert.match(sql, /drop policy if exists memberships_update_authorized on public\.memberships;/);
  assert.match(sql, /drop policy if exists memberships_delete_authorized on public\.memberships;/);
});

test("manager RPC is a hardened transactional authorization boundary", async () => {
  const sql = normalizeSql(await readSquadMigration());
  const functionSql = extractFunction(sql, "public.manage_team_player");

  assert.ok(functionSql, "missing manage_team_player function");
  assert.match(functionSql, /language plpgsql security definer set search_path = ''/);
  assert.match(functionSql, /v_actor_user_id uuid := \(select auth\.uid\(\)\)/);
  assert.match(functionSql, /private\.has_team_permission\(p_team_id, 'players\.manage'\)/);
  assert.match(functionSql, /private\.has_team_permission\(p_team_id, 'members\.manage'\)/);
  assert.match(functionSql, /t\.owner_user_id = p_user_id/);
  assert.match(functionSql, /target_role\.is_system and target_role\.slug = 'owner'/);
  assert.match(functionSql, /rp\.permission_code = 'team\.delete'/);
  assert.match(functionSql, /requested_role\.team_id = p_team_id/);
  assert.match(functionSql, /set role_id = p_role_id, status = case when p_deactivate then 'inactive' else m\.status end/);
  assert.match(functionSql, /update public\.team_player_profiles/);
  assert.match(functionSql, /insert into private\.audit_events/);

  const auditSql = functionSql.slice(functionSql.indexOf("insert into private.audit_events"));
  assert.doesNotMatch(auditSql, /p_admin_notes|admin_notes|phone|email|date_of_birth|avatar/);
  assert.match(sql, /alter function public\.manage_team_player\( uuid, uuid, uuid, smallint, text, text, date, text, boolean \) owner to postgres;/);
  assert.match(
    sql,
    /revoke execute on function public\.manage_team_player\( uuid, uuid, uuid, smallint, text, text, date, text, boolean \) from public, anon, authenticated, service_role;/,
  );
  assert.match(
    sql,
    /grant execute on function public\.manage_team_player\( uuid, uuid, uuid, smallint, text, text, date, text, boolean \) to authenticated;/,
  );
});

test("admin notes are available only through the dual-permission detail RPC", async () => {
  const sql = normalizeSql(await readSquadMigration());
  const functionSql = extractFunction(sql, "public.get_team_player_admin_detail");

  assert.ok(functionSql, "missing get_team_player_admin_detail function");
  assert.match(functionSql, /returns table \(admin_notes text\)/);
  assert.match(functionSql, /language plpgsql stable security definer set search_path = ''/);
  assert.match(functionSql, /v_actor_user_id uuid := \(select auth\.uid\(\)\)/);
  assert.match(functionSql, /private\.has_team_permission\(p_team_id, 'players\.manage'\)/);
  assert.match(functionSql, /private\.has_team_permission\(p_team_id, 'members\.manage'\)/);
  assert.match(sql, /alter function public\.get_team_player_admin_detail\(uuid, uuid\) owner to postgres;/);
  assert.match(
    sql,
    /revoke execute on function public\.get_team_player_admin_detail\(uuid, uuid\) from public, anon, authenticated, service_role;/,
  );
  assert.match(sql, /grant execute on function public\.get_team_player_admin_detail\(uuid, uuid\) to authenticated;/);
});

test("service-role attachment RPC rechecks the verified actor and stays unreachable to user roles", async () => {
  const sql = normalizeSql(await readSquadMigration());
  const functionSql = extractFunction(sql, "public.attach_team_member");

  assert.ok(functionSql, "missing public PostgREST attachment entry point");
  assert.match(functionSql, /language plpgsql security definer set search_path = ''/);
  assert.match(functionSql, /p_verified_actor_user_id is null/);
  assert.match(functionSql, /m\.user_id = p_verified_actor_user_id/);
  assert.match(functionSql, /m\.status = 'active'/);
  assert.match(functionSql, /p\.requires_password_change = false/);
  assert.match(functionSql, /having count\(distinct rp\.permission_code\) = 2/);
  assert.match(functionSql, /rp\.permission_code = 'team\.delete'/);
  assert.match(functionSql, /r\.team_id = p_team_id/);
  assert.match(functionSql, /v_existing_membership\.status = 'active'/);
  assert.match(functionSql, /insert into public\.profiles/);
  assert.match(functionSql, /insert into public\.memberships/);
  assert.match(functionSql, /insert into public\.team_player_profiles/);
  assert.match(functionSql, /on conflict \(team_id, user_id\) do update/);

  const auditSql = functionSql.slice(functionSql.indexOf("insert into private.audit_events"));
  assert.doesNotMatch(auditSql, /p_display_name|display_name|phone|email|admin_notes|date_of_birth|avatar/);
  assert.match(
    sql,
    /revoke execute on function public\.attach_team_member\( uuid, uuid, uuid, text, boolean, uuid, smallint, text, date \) from public, anon, authenticated, service_role;/,
  );
  assert.match(
    sql,
    /grant execute on function public\.attach_team_member\( uuid, uuid, uuid, text, boolean, uuid, smallint, text, date \) to service_role;/,
  );
  assert.doesNotMatch(sql, /grant execute on function public\.attach_team_member[^;]*to authenticated/);
});
