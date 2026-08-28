import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL("../supabase/migrations/20260828120720_pro7_web_push_rsvp.sql", import.meta.url);

async function migration() {
  return (await readFile(migrationUrl, "utf8"))
    .replaceAll(/--.*$/gmu, "")
    .replaceAll(/\s+/gu, " ")
    .replaceAll(/\(\s+/gu, "(")
    .replaceAll(/\s+\)/gu, ")")
    .trim()
    .toLowerCase();
}

test("push subscriptions are globally endpoint-unique, explicitly granted, and own-user isolated", async () => {
  const sql = await migration();
  assert.match(sql, /create table public\.push_subscriptions \(/u);
  assert.match(sql, /endpoint_hash bytea generated always as \(extensions\.digest\(endpoint, 'sha256'::text\)\) stored/u);
  assert.match(sql, /constraint push_subscriptions_endpoint_hash_key unique \(endpoint_hash\)/u);
  assert.match(sql, /alter table public\.push_subscriptions enable row level security/u);
  assert.match(sql, /create policy push_subscriptions_select_own on public\.push_subscriptions for select to authenticated using \(user_id = \(select auth\.uid\(\)\)\)/u);
  assert.match(sql, /create policy push_subscriptions_delete_own on public\.push_subscriptions for delete to authenticated using \(user_id = \(select auth\.uid\(\)\)\)/u);
  assert.match(sql, /grant select, delete on table public\.push_subscriptions to authenticated/u);
  assert.doesNotMatch(sql, /grant (?:insert|update).*public\.push_subscriptions to authenticated/u);
});

test("subscription mutation functions bind the authenticated caller and hide raw table writes", async () => {
  const sql = await migration();
  assert.match(sql, /create or replace function public\.upsert_push_subscription\(p_endpoint text, p_p256dh text, p_auth text, p_expiration_time bigint, p_user_agent text\)/u);
  assert.match(sql, /v_actor_user_id uuid := \(select auth\.uid\(\)\)/u);
  assert.match(sql, /on conflict \(endpoint_hash\) do update set user_id = excluded\.user_id/u);
  assert.match(sql, /create or replace function public\.delete_push_subscription\(p_endpoint text\)/u);
  assert.match(sql, /where user_id = v_actor_user_id and endpoint_hash = extensions\.digest\(p_endpoint, 'sha256'::text\)/u);
  assert.match(sql, /grant execute on function public\.upsert_push_subscription\(text, text, text, bigint, text\) to authenticated/u);
  assert.match(sql, /grant execute on function public\.delete_push_subscription\(text\) to authenticated/u);
});

test("private outbox and per-device deliveries provide bounded idempotent retry state", async () => {
  const sql = await migration();
  assert.match(sql, /create table private\.push_outbox \(/u);
  assert.match(sql, /constraint push_outbox_event_kind_check check \(event_kind in \('invitation', 'manual_reminder', 'configured_reminder', 'two_hour_reminder'\)\)/u);
  assert.match(sql, /constraint push_outbox_status_check check \(status in \('pending', 'processing', 'completed', 'no_subscription', 'failed'\)\)/u);
  assert.match(sql, /constraint push_outbox_identity_key unique \(match_id, user_id, event_key\)/u);
  assert.match(sql, /create table private\.push_deliveries \(/u);
  assert.match(sql, /constraint push_deliveries_outbox_subscription_key unique \(outbox_id, subscription_id\)/u);
  assert.match(sql, /constraint push_deliveries_status_check check \(status in \('pending', 'processing', 'sent', 'failed'\)\)/u);
  assert.doesNotMatch(sql, /grant [^;]* on table private\.push_(?:outbox|deliveries)/u);
});

test("invitation and reminder workflows enqueue RSVP push events in their business transaction", async () => {
  const sql = await migration();
  assert.match(sql, /create or replace function private\.enqueue_match_push\(/u);
  assert.match(sql, /'\/teams\/' \|\| v_team_slug \|\| '\/matches\/' \|\| p_match_id::text \|\| '\/rsvp'/u);
  const invite = sql.slice(sql.indexOf("create or replace function public.invite_match_attendance("), sql.indexOf("create or replace function public.remind_match_attendance("));
  assert.match(invite, /private\.enqueue_match_push/u);
  assert.match(invite, /'invitation'/u);
  const remind = sql.slice(sql.indexOf("create or replace function public.remind_match_attendance("), sql.indexOf("create or replace function private.schedule_match_push_events("));
  assert.match(remind, /date_trunc\('minute', pg_catalog\.clock_timestamp\(\)\)/u);
  assert.match(remind, /private\.enqueue_match_push/u);
  assert.match(remind, /'manual_reminder'/u);
});

test("scheduler emits pending-only configured and fixed two-hour milestones without equality duplicates", async () => {
  const sql = await migration();
  assert.match(sql, /create or replace function private\.schedule_match_push_events\(\)/u);
  assert.match(sql, /attendance\.status = 'pending'/u);
  assert.match(sql, /membership\.status = 'active'/u);
  assert.match(sql, /reminder_hours <> 2/u);
  assert.match(sql, /'configured:' \|\| scheduled\.reminder_hours::text/u);
  assert.match(sql, /'fixed:2h'/u);
  assert.match(sql, /'two_hour_reminder'/u);
});

test("delivery claim and settlement functions are service-role only", async () => {
  const sql = await migration();
  assert.match(sql, /create or replace function public\.claim_push_deliveries\(p_limit integer\)/u);
  assert.match(sql, /for update skip locked/u);
  assert.match(sql, /create or replace function public\.settle_push_delivery\(p_delivery_id uuid, p_outcome text, p_error_code text\)/u);
  assert.match(sql, /grant execute on function public\.claim_push_deliveries\(integer\) to service_role/u);
  assert.match(sql, /grant execute on function public\.settle_push_delivery\(uuid, text, text\) to service_role/u);
  assert.doesNotMatch(sql, /grant execute on function public\.(?:claim_push_deliveries|settle_push_delivery).* to (?:authenticated|anon|public)/u);
});

test("queue wake-up is best-effort and cron provides a minute-level recovery path", async () => {
  const sql = await migration();
  assert.match(sql, /create or replace function private\.request_push_worker\(\)/u);
  assert.match(sql, /exception when others then return null/u);
  assert.match(sql, /perform private\.request_push_worker\(\)/u);
  assert.match(sql, /select cron\.schedule\('pro7-web-push-minute'/u);
  assert.match(sql, /private\.schedule_match_push_events\(\)/u);
  assert.match(sql, /private\.request_push_worker\(\)/u);
});

test("team slug changes keep durable RSVP notifications and unfinished push links canonical", async () => {
  const sql = await migration();
  assert.match(sql, /create or replace function private\.sync_notification_team_slug\(\)/u);
  assert.match(sql, /set target_path = '\/teams\/' \|\| new\.slug \|\| '\/matches\/' \|\| source_id::text \|\| '\/rsvp'/u);
  assert.match(sql, /update private\.push_outbox/u);
  assert.match(sql, /where team_id = new\.id and status in \('pending', 'processing'\)/u);
});
