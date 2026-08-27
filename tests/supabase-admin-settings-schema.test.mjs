import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = new URL("../supabase/migrations/20260826121407_pro7_admin_settings_audit.sql", import.meta.url);

test("admin settings migration protects private audit rows and exposes one bounded redacted RPC", async () => {
  const sql = await readFile(migration, "utf8");
  assert.match(sql, /alter table private\.audit_events enable row level security/iu);
  assert.match(sql, /revoke all privileges on table private\.audit_events[\s\S]*from public, anon, authenticated, service_role/iu);
  assert.match(sql, /create or replace function public\.get_team_audit_events\(\s*p_team_id uuid,\s*p_limit integer default 50/iu);
  assert.match(sql, /security definer[\s\S]*set search_path = ''/iu);
  assert.match(sql, /private\.has_team_permission\(p_team_id, 'settings\.read'\)/iu);
  assert.match(sql, /p_limit < 1 or p_limit > 100/iu);
  assert.doesNotMatch(sql, /old_data|new_data/iu);
  assert.match(sql, /revoke execute on function public\.get_team_audit_events\(uuid, integer\)[\s\S]*from public, anon, service_role/iu);
  assert.match(sql, /grant execute on function public\.get_team_audit_events\(uuid, integer\) to authenticated/iu);
});
