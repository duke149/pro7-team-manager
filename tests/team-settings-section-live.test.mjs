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
