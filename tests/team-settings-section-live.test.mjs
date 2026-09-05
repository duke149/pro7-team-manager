import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after, before } from "node:test";
import { fileURLToPath } from "node:url";

const repositoryPath = fileURLToPath(new URL("../", import.meta.url));
const migrationsPath = join(repositoryPath, "supabase", "migrations");
const OWNER = "92000000-0000-4000-8000-000000000001";
const MEMBER = "92000000-0000-4000-8000-000000000002";
const TEAM = "92000000-0000-4000-8000-000000000010";

let clusterPath;
let socketPath;
let port;

function run(command, arguments_, options = {}) {
  const result = spawnSync(command, arguments_, { encoding: "utf8", ...options });
  if (!options.allowFailure) assert.equal(result.status, 0, `${command} failed:\n${result.stderr || result.stdout}`);
  return result;
}

function psql(arguments_ = [], options = {}) {
  return run("psql", ["-XAtq", "-v", "ON_ERROR_STOP=1", "-h", socketPath, "-p", String(port), "-U", "postgres", "-d", "postgres", ...arguments_], options);
}

const bootstrapSql = String.raw`
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin;
  create schema extensions;
  create extension pgcrypto with schema extensions;
  create schema auth;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb not null default '{}'::jsonb);
  create schema storage;
  create table storage.buckets (id text primary key, name text not null, public boolean not null default false, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default extensions.gen_random_uuid(), bucket_id text not null references storage.buckets (id), name text not null);
  alter table storage.objects enable row level security;
  create function auth.uid() returns uuid language sql stable set search_path = '' as
    'select nullif(pg_catalog.current_setting(''request.jwt.claim.sub'', true), '''')::uuid';
  create function storage.foldername(p_name text) returns text[] language sql immutable set search_path = '' as
    'select pg_catalog.string_to_array(p_name, ''/'')';
`;

before(async () => {
  clusterPath = await mkdtemp(join(tmpdir(), "pro7-settings-pg17-"));
  const dataPath = join(clusterPath, "data");
  socketPath = join(clusterPath, "socket");
  const logPath = join(clusterPath, "postgres.log");
  port = 57_000 + (process.pid % 500);
  await mkdir(socketPath);
  run("initdb", ["-D", dataPath, "--auth=trust", "--username=postgres", "--encoding=UTF8", "--no-locale"]);
  run("pg_ctl", ["-D", dataPath, "-l", logPath, "-o", `-F -k ${socketPath} -p ${port}`, "-w", "start"]);
  psql(["-c", bootstrapSql]);
  for (const migration of (await readdir(migrationsPath)).filter((name) => name.endsWith(".sql")).sort()) psql(["-f", join(migrationsPath, migration)]);
  psql(["-c", String.raw`
    insert into auth.users (id, email) values ('${OWNER}', 'owner@example.com'), ('${MEMBER}', 'member@example.com');
    insert into public.teams (id, name, slug, owner_user_id) values ('${TEAM}', 'PRO7 FC', 'pro7-fc', '${OWNER}');
    insert into public.memberships (team_id, user_id, role_id)
    select '${TEAM}', '${MEMBER}', id from public.roles where team_id = '${TEAM}' and slug = 'member';
    update public.team_settings set settings = '{"notifications":{"matchInvitations":true,"matchReminders":false,"reminderHoursBefore":24},"future":{"safe":true}}'::jsonb where team_id = '${TEAM}';
  `]);
});

after(async () => {
  if (!clusterPath) return;
  run("pg_ctl", ["-D", join(clusterPath, "data"), "-m", "fast", "-w", "stop"], { allowFailure: true });
  await rm(clusterPath, { recursive: true, force: true });
});

test("admin profile writes are limited to active teammates and audited", () => {
  const runAs = (actor, sql) => psql(["-c", `begin; set local role authenticated; set local "request.jwt.claim.sub"='${actor}'; ${sql} commit;`]);
  runAs(OWNER, `update public.profiles set display_name='QA edited', height_cm=178 where id='${MEMBER}';`);
  assert.equal(psql(["-c", `select display_name from public.profiles where id='${MEMBER}'`]).stdout.trim(), 'QA edited');
  assert.equal(psql(["-c", `select count(*) from private.audit_events where table_name='profiles' and actor_user_id='${OWNER}' and team_id='${TEAM}'`]).stdout.trim(), '1');
  runAs(MEMBER, `update public.profiles set display_name='forged' where id='${OWNER}';`);
  assert.notEqual(psql(["-c", `select display_name from public.profiles where id='${OWNER}'`]).stdout.trim(), 'forged');
  psql(["-c", `update public.memberships set status='inactive' where team_id='${TEAM}' and user_id='${MEMBER}'`]);
  runAs(OWNER, `update public.profiles set display_name='inactive write' where id='${MEMBER}';`);
  assert.equal(psql(["-c", `select display_name from public.profiles where id='${MEMBER}'`]).stdout.trim(), 'QA edited');
  psql(["-c", `update public.memberships set status='active' where team_id='${TEAM}' and user_id='${MEMBER}'`]);
  const outsider = '92000000-0000-4000-8000-000000000099';
  psql(["-c", `insert into auth.users(id,email) values('${outsider}','outside@example.com'); grant usage on schema storage to authenticated; grant select,insert,update,delete on storage.objects to authenticated;`]);
  runAs(OWNER, `update public.profiles set display_name='outside write' where id='${outsider}'; insert into storage.objects(bucket_id,name) values('player-avatars','${MEMBER}/avatar.webp'); update storage.objects set name='${MEMBER}/avatar.png' where name='${MEMBER}/avatar.webp';`);
  assert.notEqual(psql(["-c", `select display_name from public.profiles where id='${outsider}'`]).stdout.trim(), 'outside write');
  const denied = psql(["-c", `begin;set local role authenticated;set local "request.jwt.claim.sub"='${OWNER}';insert into storage.objects(bucket_id,name) values('player-avatars','${outsider}/avatar.webp');commit;`], {allowFailure:true});
  assert.notEqual(denied.status, 0);
  runAs(OWNER, `delete from storage.objects where name='${MEMBER}/avatar.png';`);
  assert.equal(psql(["-c", `select count(*) from storage.objects where name='${MEMBER}/avatar.png'`]).stdout.trim(), '0');
});

test("manual due confirmation creates income once and correction restores pending without losing audit", () => {
  const asOwner = (sql, options = {}) => psql(["-c", `begin; set local role authenticated; set local "request.jwt.claim.sub" = '${OWNER}'; ${sql} commit;`], options);
  const due = asOwner(`select public.manage_member_due('create', '${TEAM}', null, '${MEMBER}', date_trunc('month', current_date)::date, 100000, current_date + 10, null, null);`).stdout.trim();
  const token = psql(["-c", `select updated_at from public.member_dues where id='${due}'`]).stdout.trim();
  const pay = `select public.manage_member_due('pay', '${TEAM}', '${due}', null, null, null, null, null, '${token}'::timestamptz);`;
  asOwner(pay);
  const row = JSON.parse(psql(["-c", `select row_to_json(t) from (select d.status, e.amount_vnd, e.direction, e.description from public.member_dues d join public.finance_entries e on e.id=d.finance_entry_id where d.id='${due}') t`]).stdout.trim());
  assert.equal(row.status, "paid"); assert.equal(row.amount_vnd, 100000); assert.equal(row.direction, "income");
  assert.match(row.description, /^Đóng quỹ tháng \d{2}\/\d{4}$/u);
  const retry = asOwner(pay, { allowFailure: true });
  assert.notEqual(retry.status, 0);
  assert.match(retry.stderr, /changed|Only pending dues/iu);
  assert.equal(psql(["-c", `select count(*) from public.finance_entries where team_id='${TEAM}' and category='member_due'`]).stdout.trim(), "1");
  const memberAttempt = psql(["-c", `begin; set local role authenticated; set local "request.jwt.claim.sub"='${MEMBER}'; ${pay} commit;`], { allowFailure: true });
  assert.notEqual(memberAttempt.status, 0); assert.match(memberAttempt.stderr, /Finance management permission required/iu);
  const paidToken = psql(["-c", `select updated_at from public.member_dues where id='${due}'`]).stdout.trim();
  asOwner(`select public.manage_member_due('void_payment', '${TEAM}', '${due}', null, null, null, null, 'QA correction', '${paidToken}'::timestamptz);`);
  assert.equal(psql(["-c", `select status from public.member_dues where id='${due}'`]).stdout.trim(), "pending");
  assert.equal(psql(["-c", `select coalesce(sum(amount_vnd),0) from public.finance_entries where team_id='${TEAM}' and voided_at is null`]).stdout.trim(), "0");
  assert.equal(psql(["-c", `select count(*) from private.audit_events where team_id='${TEAM}' and table_name='member_dues' and new_data->>'operation'='void_payment'`]).stdout.trim(), "1");
});

test("settings RPC merges a section and preserves notifications and future keys", () => {
  const token = psql(["-c", `select updated_at from public.team_settings where team_id = '${TEAM}'`]).stdout.trim();
  const output = psql(["-c", String.raw`
    begin;
    set local role authenticated;
    set local "request.jwt.claim.sub" = '${OWNER}';
    select public.update_team_settings_section(
      '${TEAM}', 'payments',
      '{"bankCode":"MB","accountNumber":"0901234567","accountHolder":"LE DUC","transferPrefix":"PRO7 QUY"}'::jsonb,
      '${token}'::timestamptz
    );
    commit;
  `]).stdout.trim();
  assert.match(output, /^\d{4}-\d{2}-\d{2}/u);
  const settings = JSON.parse(psql(["-c", `select settings::text from public.team_settings where team_id = '${TEAM}'`]).stdout.trim());
  assert.deepEqual(settings.notifications, { matchInvitations: true, matchReminders: false, reminderHoursBefore: 24 });
  assert.deepEqual(settings.future, { safe: true });
  assert.deepEqual(settings.payments, { bankCode: "MB", accountNumber: "0901234567", accountHolder: "LE DUC", transferPrefix: "PRO7 QUY" });

  const stale = psql(["-c", String.raw`
    begin; set local role authenticated; set local "request.jwt.claim.sub" = '${OWNER}';
    select public.update_team_settings_section('${TEAM}', 'notifications', '{"matchInvitations":false,"matchReminders":true,"reminderHoursBefore":12}'::jsonb, '${token}'::timestamptz);
    commit;
  `], { allowFailure: true });
  assert.notEqual(stale.status, 0);
  assert.match(stale.stderr, /Team settings changed/iu);
});

test("member, anon, and direct authenticated updates remain denied", () => {
  const token = psql(["-c", `select updated_at from public.team_settings where team_id = '${TEAM}'`]).stdout.trim();
  const member = psql(["-c", String.raw`
    begin; set local role authenticated; set local "request.jwt.claim.sub" = '${MEMBER}';
    select public.update_team_settings_section('${TEAM}', 'notifications', '{"matchInvitations":true,"matchReminders":true,"reminderHoursBefore":24}'::jsonb, '${token}'::timestamptz);
    commit;
  `], { allowFailure: true });
  assert.notEqual(member.status, 0);
  assert.match(member.stderr, /Settings update permission required/iu);

  const direct = psql(["-c", String.raw`
    begin; set local role authenticated; set local "request.jwt.claim.sub" = '${OWNER}';
    update public.team_settings set settings = '{}'::jsonb where team_id = '${TEAM}';
    commit;
  `], { allowFailure: true });
  assert.notEqual(direct.status, 0);
  assert.match(direct.stderr, /permission denied/iu);

  const anonymous = psql(["-c", String.raw`
    begin; set local role anon;
    select public.update_team_settings_section('${TEAM}', 'notifications', '{"matchInvitations":true,"matchReminders":true,"reminderHoursBefore":24}'::jsonb, '${token}'::timestamptz);
    commit;
  `], { allowFailure: true });
  assert.notEqual(anonymous.status, 0);
  assert.match(anonymous.stderr, /permission denied/iu);
});
