import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after, before } from "node:test";
import { fileURLToPath } from "node:url";

const repositoryPath = fileURLToPath(new URL("../", import.meta.url));
const migrationsPath = join(repositoryPath, "supabase", "migrations");
const verificationPath = join(repositoryPath, "tests", "supabase-web-push-live-verification.sql");
const preapplyPath = join(repositoryPath, "tests", "supabase-web-push-pre-apply.sql");

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
  create schema supabase_migrations;
  create table supabase_migrations.schema_migrations (version text primary key, statements text[], name text);
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
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  create function storage.foldername(p_name text) returns text[] language sql immutable set search_path = '' as
    'select pg_catalog.string_to_array(p_name, ''/'')';
`;

before(async () => {
  clusterPath = await mkdtemp(join(tmpdir(), "pro7-web-push-pg17-"));
  const dataPath = join(clusterPath, "data");
  socketPath = join(clusterPath, "socket");
  const logPath = join(clusterPath, "postgres.log");
  port = 58_500 + (process.pid % 400);
  await mkdir(socketPath);
  run("initdb", ["-D", dataPath, "--auth=trust", "--username=postgres", "--encoding=UTF8", "--no-locale"]);
  run("pg_ctl", ["-D", dataPath, "-l", logPath, "-o", `-F -k ${socketPath} -p ${port}`, "-w", "start"]);
  psql(["-c", bootstrapSql]);
  for (const migration of (await readdir(migrationsPath)).filter((name) => name.endsWith(".sql")).sort()) {
    psql(["-f", join(migrationsPath, migration)]);
    const parsed = migration.match(/^(\d+)_(.+)\.sql$/u);
    assert.ok(parsed);
    psql(["-c", `insert into supabase_migrations.schema_migrations (version, statements, name) values ('${parsed[1]}', array['local verifier'], '${parsed[2]}')`]);
  }
});

after(async () => {
  if (!clusterPath) return;
  run("pg_ctl", ["-D", join(clusterPath, "data"), "-m", "fast", "-w", "stop"], { allowFailure: true });
  await rm(clusterPath, { recursive: true, force: true });
});

test("web push invitation, scheduling, RLS, per-device retry, and cleanup are transactional", () => {
  const result = psql(["-f", verificationPath]);
  assert.match(result.stdout, /web_push_live_verification_ok_rollback_zero_fixtures/u);
});

test("web push pre-apply artifact executes against the controlled applied PostgreSQL 17 state", () => {
  const result = psql(["-f", preapplyPath]);
  const jsonLine = result.stdout.split(/\r?\n/gu).map((line) => line.trim()).find((line) => line.startsWith("{"));
  assert.ok(jsonLine, result.stdout);
  const value = JSON.parse(jsonLine);
  assert.equal(value.migration_history.is_applied, true);
  assert.equal(value.migration_history.recorded_name, "pro7_web_push_rsvp");
  assert.deepEqual(value.missing_prerequisites, []);
  assert.equal(value.prospective_objects.length, 7);
  assert.equal(value.notification_settings_anomalies, 0);
});
