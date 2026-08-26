import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const preflightPath = new URL("../supabase/seed/pro7-roster-preflight.sql", import.meta.url);
const applyPath = new URL("../supabase/seed/pro7-roster-apply.sql", import.meta.url);

test("roster preflight is SELECT-only and checks every identity boundary", async () => {
  const sql = await readFile(preflightPath, "utf8");
  assert.doesNotMatch(sql, /\b(insert|update|delete|merge|truncate|alter|create|drop|call)\b/iu);
  assert.match(sql, /pficsujapinkmqsyvcfw/u);
  assert.match(sql, /pro7-fc/u);
  assert.match(sql, /pro7\.demo\.20260825@gmail\.com/u);
  assert.match(sql, /duc\.lee\.pro7@example\.com/u);
  assert.match(sql, /tuan\.dat\.pro7@example\.com/u);
  assert.match(sql, /trung\.hieu\.pro7@example\.com/u);
  assert.match(sql, /phi\.hung\.pro7@example\.com/u);
  assert.match(sql, /23/u);
  assert.match(sql, /owner/iu);
  assert.match(sql, /admin/iu);
  assert.match(sql, /member/iu);
  assert.match(sql, /collision/iu);
  assert.match(sql, /profile_gap/iu);
});

test("roster apply is one fail-closed transaction with exact cardinalities", async () => {
  const sql = await readFile(applyPath, "utf8");
  assert.match(sql, /^\s*begin;/iu);
  assert.match(sql, /commit;\s*$/iu);
  assert.match(sql, /pg_advisory_xact_lock/iu);
  assert.match(sql, /for update/iu);
  assert.match(sql, /raise exception/iu);
  assert.match(sql, /<>\s*23|!=\s*23/iu);
  assert.match(sql, /<>\s*3|!=\s*3/iu);
  assert.match(sql, /<>\s*20|!=\s*20/iu);
  assert.match(sql, /<>\s*24|!=\s*24/iu);
  assert.match(sql, /requires_password_change\s*=\s*true/iu);
  assert.match(sql, /display_name\s*=\s*excluded\.display_name/iu);
  assert.match(sql, /team_player_profiles/iu);
  assert.match(sql, /phi\.hung\.pro7@example\.com/iu);
  assert.match(sql, /status\s*=\s*'inactive'/iu);
  assert.match(sql, /private\.audit_events/iu);
  assert.doesNotMatch(sql, /encrypted_password|@123|service_role|secret/iu);
  assert.doesNotMatch(sql, /\b(insert\s+into|update|delete\s+from)\s+auth\.users\b/iu);
});

test("roster apply protects Owner and never invents player facts", async () => {
  const sql = await readFile(applyPath, "utf8");
  assert.match(sql, /pro7\.demo\.20260825@gmail\.com/u);
  assert.match(sql, /owner_user_id/iu);
  assert.match(sql, /owner membership/iu);
  assert.doesNotMatch(sql, /shirt_number\s*=|official_position\s*=|date_of_birth\s*=|height_cm\s*=|weight_kg\s*=/iu);
});
