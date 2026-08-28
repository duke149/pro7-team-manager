import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const migrationsDirectory = fileURLToPath(new URL("../supabase/migrations/", import.meta.url));

function normalize(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//gu, " ")
    .replace(/--[^\n\r]*/gu, " ")
    .toLowerCase()
    .replace(/\s+/gu, " ")
    .trim();
}

async function migration() {
  const files = (await readdir(migrationsDirectory))
    .filter((file) => file.endsWith("_notification_avatar_visibility.sql"));
  assert.equal(files.length, 1, "expected one forward production fix migration");
  return normalize(await readFile(path.join(migrationsDirectory, files[0]), "utf8"));
}

test("team slug changes repair and continue synchronizing notification deep links", async () => {
  const sql = await migration();
  assert.match(sql, /update public\.notifications as notification set target_path = '\/teams\/' \|\| team\.slug \|\| '\/matches\/' \|\| notification\.source_id::text from public\.teams as team where team\.id = notification\.team_id and notification\.target_path is distinct from '\/teams\/' \|\| team\.slug \|\| '\/matches\/' \|\| notification\.source_id::text;/u);
  assert.match(sql, /create or replace function private\.sync_notification_team_slug\(\) returns trigger language plpgsql security definer set search_path = ''/u);
  assert.match(sql, /if new\.slug is distinct from old\.slug then update public\.notifications set target_path = '\/teams\/' \|\| new\.slug \|\| '\/matches\/' \|\| source_id::text where team_id = new\.id;/u);
  assert.match(sql, /create trigger trg_teams_sync_notification_slug after update of slug on public\.teams for each row execute function private\.sync_notification_team_slug\(\);/u);
  assert.match(sql, /revoke execute on function private\.sync_notification_team_slug\(\) from public, anon, authenticated, service_role;/u);
});

test("authenticated teammates with profile visibility can select private avatar objects", async () => {
  const sql = await migration();
  assert.match(sql, /create policy player_avatars_select_team_visible on storage\.objects for select to authenticated using \( bucket_id = 'player-avatars' and case when \(storage\.foldername\(name\)\)\[1\] ~ '\^\[0-9a-f\]/u);
  assert.match(sql, /then private\.can_view_profile\(\(\(storage\.foldername\(name\)\)\[1\]\)::uuid\) else false end \);/u);
  assert.doesNotMatch(sql, /player_avatars_(?:insert|update|delete)_team/u);
});
