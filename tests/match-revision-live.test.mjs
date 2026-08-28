import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after, before } from "node:test";
import { fileURLToPath } from "node:url";

const repositoryPath = fileURLToPath(new URL("../", import.meta.url));
const migrationsPath = join(repositoryPath, "supabase", "migrations");
const OWNER = "94000000-0000-4000-8000-000000000001";
const MEMBER = "94000000-0000-4000-8000-000000000002";
const TEAM = "94000000-0000-4000-8000-000000000010";

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

function query(sql) {
  return psql(["-c", sql]).stdout.trim();
}

function authenticated(userId, sql, options = {}) {
  return psql(["-c", `begin; set local role authenticated; set local "request.jwt.claim.sub" = '${userId}'; ${sql}; commit;`], options);
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
  clusterPath = await mkdtemp(join(tmpdir(), "pro7-match-revision-pg17-"));
  const dataPath = join(clusterPath, "data");
  socketPath = join(clusterPath, "socket");
  const logPath = join(clusterPath, "postgres.log");
  port = 58_100 + (process.pid % 400);
  await mkdir(socketPath);
  run("initdb", ["-D", dataPath, "--auth=trust", "--username=postgres", "--encoding=UTF8", "--no-locale"]);
  run("pg_ctl", ["-D", dataPath, "-l", logPath, "-o", `-F -k ${socketPath} -p ${port}`, "-w", "start"]);
  psql(["-c", bootstrapSql]);
  for (const migration of (await readdir(migrationsPath)).filter((name) => name.endsWith(".sql")).sort()) {
    psql(["-f", join(migrationsPath, migration)]);
  }
  psql(["-c", String.raw`
    insert into auth.users (id, email) values ('${OWNER}', 'revision-owner@example.com'), ('${MEMBER}', 'revision-member@example.com');
    insert into public.teams (id, name, slug, owner_user_id) values ('${TEAM}', 'Revision FC', 'revision-fc', '${OWNER}');
    insert into public.memberships (team_id, user_id, role_id)
    select '${TEAM}', '${MEMBER}', id from public.roles where team_id = '${TEAM}' and slug = 'member';
  `]);
});

after(async () => {
  if (!clusterPath) return;
  run("pg_ctl", ["-D", join(clusterPath, "data"), "-m", "fast", "-w", "stop"], { allowFailure: true });
  await rm(clusterPath, { recursive: true, force: true });
});

test("completed match revision is atomic, stale-safe, permission-checked, and audited", () => {
  const matchId = authenticated(OWNER, `
    select public.manage_match(
      'create', '${TEAM}', null, 'FC Original', '2026-09-05T19:00:00Z', 'Old Pitch', true,
      '2026-09-04T19:00:00Z', null, null, null
    )
  `).stdout.trim();
  assert.match(matchId, /^[0-9a-f-]{36}$/u);

  const scheduledToken = query(`select updated_at::text from public.matches where id = '${matchId}'`);
  authenticated(OWNER, `
    select public.manage_match(
      'complete', '${TEAM}', '${matchId}', null, null, null, null, null,
      2::smallint, 1::smallint, '${scheduledToken}'::timestamptz
    )
  `);
  const completedToken = query(`select updated_at::text from public.matches where id = '${matchId}'`);
  assert.notEqual(completedToken, scheduledToken);

  authenticated(OWNER, `
    select public.manage_match(
      'revise', '${TEAM}', '${matchId}', 'Saigon Comets', '2026-09-06T12:30:00Z',
      'Riverside Pitch', false, '2026-09-05T12:30:00Z', 3::smallint, 1::smallint,
      '${completedToken}'::timestamptz
    )
  `);
  assert.equal(query(`
    select opponent || '|' || (starts_at = timestamptz '2026-09-06T12:30:00Z')::text || '|' ||
      venue || '|' || is_home::text || '|' ||
      (rsvp_deadline = timestamptz '2026-09-05T12:30:00Z')::text || '|' ||
      team_score::text || '|' || opponent_score::text || '|' || status
    from public.matches where id = '${matchId}'
  `), "Saigon Comets|true|Riverside Pitch|false|true|3|1|completed");

  const stale = authenticated(OWNER, `
    select public.manage_match(
      'revise', '${TEAM}', '${matchId}', 'Stale FC', '2026-09-06T12:30:00Z', null, true,
      '2026-09-05T12:30:00Z', 0::smallint, 0::smallint, '${completedToken}'::timestamptz
    )
  `, { allowFailure: true });
  assert.notEqual(stale.status, 0);
  assert.match(stale.stderr, /Match changed/iu);

  const latestToken = query(`select updated_at::text from public.matches where id = '${matchId}'`);
  const denied = authenticated(MEMBER, `
    select public.manage_match(
      'revise', '${TEAM}', '${matchId}', 'Denied FC', '2026-09-06T12:30:00Z', null, true,
      '2026-09-05T12:30:00Z', 0::smallint, 0::smallint, '${latestToken}'::timestamptz
    )
  `, { allowFailure: true });
  assert.notEqual(denied.status, 0);
  assert.match(denied.stderr, /permission required/iu);

  assert.equal(query(`
    select count(*) from private.audit_events
    where team_id = '${TEAM}' and table_name = 'matches' and action = 'UPDATE'
      and new_data ->> 'opponent' = 'Saigon Comets'
      and new_data ->> 'team_score' = '3'
  `), "1");
});

test("revision RPC keeps its authenticated-only execute boundary", () => {
  const signature = "public.manage_match(text,uuid,uuid,text,timestamp with time zone,text,boolean,timestamp with time zone,smallint,smallint,timestamp with time zone)";
  assert.equal(query(`select has_function_privilege('anon', '${signature}', 'EXECUTE')`), "f");
  assert.equal(query(`select has_function_privilege('authenticated', '${signature}', 'EXECUTE')`), "t");
  assert.equal(query(`select has_function_privilege('service_role', '${signature}', 'EXECUTE')`), "f");
});
