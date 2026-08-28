import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = new URL("../supabase/migrations/20260828034001_manage_team_news.sql", import.meta.url);

test("Team News migration adds archive lifecycle and one hardened mutation RPC", async () => {
  const sql = await readFile(migration, "utf8");
  assert.match(sql, /drop constraint team_news_status_check[\s\S]*add constraint team_news_status_check[\s\S]*status in \('draft', 'published', 'archived'\)/iu);
  assert.match(sql, /drop constraint team_news_publish_check[\s\S]*add constraint team_news_publish_check[\s\S]*status = 'archived'/iu);
  assert.match(sql, /create or replace function public\.manage_team_news\(\s*p_team_id uuid,\s*p_action text,\s*p_news_id uuid,\s*p_title text,\s*p_body text,\s*p_expected_updated_at timestamptz/iu);
  assert.match(sql, /returns table \( id uuid, title text, body text, status text, published_at timestamptz, updated_at timestamptz \)/iu);
  assert.match(sql, /security definer[\s\S]*set search_path = ''/iu);
  assert.match(sql, /auth\.uid\(\)[\s\S]*private\.has_team_permission\(p_team_id, 'news\.manage'\)/iu);
  assert.match(sql, /where news\.id = p_news_id[\s\S]*and news\.team_id = p_team_id[\s\S]*for update/iu);
  assert.match(sql, /p_expected_updated_at is distinct from v_news\.updated_at[\s\S]*errcode = '40001'/iu);
  assert.match(sql, /p_action = 'create'[\s\S]*when 'update'[\s\S]*when 'publish'[\s\S]*when 'archive'[\s\S]*when 'restore'/iu);
  assert.match(sql, /insert into private\.audit_events/iu);
  assert.match(sql, /revoke execute on function public\.manage_team_news\(uuid, text, uuid, text, text, timestamptz\)[\s\S]*from public, anon, authenticated, service_role/iu);
  assert.match(sql, /grant execute on function public\.manage_team_news\(uuid, text, uuid, text, text, timestamptz\) to authenticated/iu);
  assert.doesNotMatch(sql, /grant (?:insert|update|delete)[^;]*team_news[^;]*authenticated/iu);
});
