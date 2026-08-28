import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

const MIGRATIONS = new URL("../supabase/migrations/", import.meta.url);

async function revisionSql() {
  const file = (await readdir(MIGRATIONS)).find((name) =>
    name.endsWith("_revise_completed_matches.sql"),
  );
  assert.ok(file, "missing additive completed-match revision migration");
  return (await readFile(new URL(file, MIGRATIONS), "utf8"))
    .toLowerCase()
    .replaceAll(/\s+/gu, " ");
}

test("completed-match revision extends the existing narrow audited RPC without widening ACLs", async () => {
  const sql = await revisionSql();
  assert.match(sql, /create or replace function public\.manage_match\(/u);
  assert.match(sql, /p_action not in \('create', 'update', 'complete', 'cancel', 'revise'\)/u);
  assert.match(sql, /p_action = 'revise' and v_match\.status <> 'completed'/u);
  assert.match(sql, /p_action <> 'revise' and v_match\.status <> 'scheduled'/u);
  assert.match(sql, /elsif p_action = 'revise' then/u);
  assert.match(sql, /set opponent = p_opponent,[\s\S]*starts_at = p_starts_at,[\s\S]*team_score = p_team_score,[\s\S]*opponent_score = p_opponent_score/u);
  assert.match(sql, /private\.has_team_permission\(p_team_id, 'matches\.manage'\)/u);
  assert.match(sql, /p_expected_updated_at is distinct from v_match\.updated_at/u);
  assert.match(sql, /insert into private\.audit_events/u);
  assert.match(sql, /revoke execute on function public\.manage_match\([^)]+\) from public, anon, authenticated, service_role/u);
  assert.match(sql, /grant execute on function public\.manage_match\([^)]+\) to authenticated/u);
});
