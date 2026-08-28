import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = new URL("../supabase/migrations/20260828031423_update_team_settings_section.sql", import.meta.url);

test("team settings section RPC is narrow, stale-safe, and least-privileged", async () => {
  const sql = await readFile(migration, "utf8");
  assert.match(sql, /create or replace function public\.update_team_settings_section\(\s*p_team_id uuid,\s*p_section text,\s*p_value jsonb,\s*p_expected_updated_at timestamptz/iu);
  assert.match(sql, /returns timestamptz[\s\S]*security definer[\s\S]*set search_path = ''/iu);
  assert.match(sql, /auth\.uid\(\)[\s\S]*private\.has_team_permission\(p_team_id, 'settings\.update'\)/iu);
  assert.match(sql, /from public\.team_settings[\s\S]*for update/iu);
  assert.match(sql, /p_expected_updated_at is distinct from v_settings\.updated_at[\s\S]*errcode = '40001'/iu);
  assert.match(sql, /p_section not in \('notifications', 'payments'\)/iu);
  assert.match(sql, /jsonb_build_object\(p_section, p_value\)/iu);
  assert.match(sql, /revoke update \(settings\) on table public\.team_settings from authenticated/iu);
  assert.match(sql, /revoke execute on function public\.update_team_settings_section\(uuid, text, jsonb, timestamptz\)[\s\S]*from public, anon, authenticated, service_role/iu);
  assert.match(sql, /grant execute on function public\.update_team_settings_section\(uuid, text, jsonb, timestamptz\) to authenticated/iu);
});
