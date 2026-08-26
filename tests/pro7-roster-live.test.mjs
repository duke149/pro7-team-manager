import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after, before } from "node:test";
import { fileURLToPath } from "node:url";

const repositoryPath = fileURLToPath(new URL("../", import.meta.url));
const migrationsPath = join(repositoryPath, "supabase", "migrations");
const preflightPath = join(repositoryPath, "supabase", "seed", "pro7-roster-preflight.sql");
const applyPath = join(repositoryPath, "supabase", "seed", "pro7-roster-apply.sql");
const verifyPath = join(repositoryPath, "tests", "pro7-roster-live-verification.sql");

let clusterPath;
let socketPath;
let port;

function run(command, arguments_, options = {}) {
  const result = spawnSync(command, arguments_, { encoding: "utf8", ...options });
  if (!options.allowFailure) {
    assert.equal(result.status, 0, `${command} failed:\n${result.stderr || result.stdout}`);
  }
  return result;
}

function psql(arguments_ = [], options = {}) {
  return run("psql", [
    "-XAtq", "-v", "ON_ERROR_STOP=1", "-h", socketPath, "-p", String(port),
    "-U", "postgres", "-d", "postgres", ...arguments_,
  ], options);
}

function query(sql) {
  return psql(["-c", sql]).stdout.trim();
}

const bootstrapSql = String.raw`
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin;
  create schema extensions;
  create extension pgcrypto with schema extensions;
  create schema auth;
  create table auth.users (
    id uuid primary key,
    email text,
    raw_user_meta_data jsonb not null default '{}'::jsonb
  );
  create schema storage;
  create table storage.buckets (
    id text primary key,
    name text not null,
    public boolean not null default false,
    file_size_limit bigint,
    allowed_mime_types text[]
  );
  create table storage.objects (
    id uuid primary key default extensions.gen_random_uuid(),
    bucket_id text not null references storage.buckets (id),
    name text not null
  );
  alter table storage.objects enable row level security;
  create function auth.uid() returns uuid language sql stable set search_path = '' as
    'select nullif(pg_catalog.current_setting(''request.jwt.claim.sub'', true), '''')::uuid';
  create function storage.foldername(p_name text) returns text[] language sql immutable set search_path = '' as
    'select pg_catalog.string_to_array(p_name, ''/'')';
`;

const rosterUsers = [
  ["101", "hunglt"], ["102", "quyenbh"], ["103", "buikien"], ["104", "danhtuan"],
  ["003", "datlt"], ["002", "duclee"], ["105", "ducmanh"], ["106", "giakhai"],
  ["107", "nguyenhung"], ["108", "lehuy"], ["109", "tunglk"], ["110", "kimson"],
  ["004", "hieult"], ["111", "vietld"], ["112", "luuminh"], ["113", "minhphong"],
  ["114", "hieunc"], ["115", "toannh"], ["116", "quannm"], ["117", "thanhnp"],
  ["118", "minhnq"], ["119", "anhlt"], ["120", "vulong"],
];

const fixtureSql = String.raw`
  insert into auth.users (id, email) values
    ('91000000-0000-4000-8000-000000000001', 'pro7.demo.20260825@gmail.com'),
    ('91000000-0000-4000-8000-000000000005', 'phi.hung.pro7@example.com'),
    ('91000000-0000-4000-8000-000000000999', 'unrelated@example.com'),
    ${rosterUsers.map(([suffix, username]) => `('91000000-0000-4000-8000-000000000${suffix}', '${username}@pro7.test')`).join(",\n    ")};

  insert into public.teams (id, name, slug, owner_user_id)
  values (
    '91000000-0000-4000-8000-000000000010',
    'PRO7 FC',
    'pro7-fc',
    '91000000-0000-4000-8000-000000000001'
  );

  insert into public.memberships (team_id, user_id, role_id)
  select
    '91000000-0000-4000-8000-000000000010',
    fixture.user_id,
    role.id
  from unnest(array[
    '91000000-0000-4000-8000-000000000002'::uuid,
    '91000000-0000-4000-8000-000000000003'::uuid,
    '91000000-0000-4000-8000-000000000004'::uuid,
    '91000000-0000-4000-8000-000000000005'::uuid
  ]) as fixture(user_id)
  join public.roles as role
    on role.team_id = '91000000-0000-4000-8000-000000000010'
   and role.slug = 'member';

  insert into public.profiles (
    id, display_name, phone, height_cm, preferred_positions, requires_password_change
  ) values (
    '91000000-0000-4000-8000-000000000002',
    'Legacy Đức Lee',
    '0900000000',
    178,
    array['MID']::text[],
    false
  ) on conflict (id) do update set
    display_name = excluded.display_name,
    phone = excluded.phone,
    height_cm = excluded.height_cm,
    preferred_positions = excluded.preferred_positions,
    requires_password_change = excluded.requires_password_change;

  update public.team_player_profiles
  set shirt_number = 8, official_position = 'MID', admin_notes = 'Preserve me'
  where team_id = '91000000-0000-4000-8000-000000000010'
    and user_id = '91000000-0000-4000-8000-000000000002';
`;

before(async () => {
  clusterPath = await mkdtemp(join(tmpdir(), "pro7-roster-pg17-"));
  const dataPath = join(clusterPath, "data");
  socketPath = join(clusterPath, "socket");
  const logPath = join(clusterPath, "postgres.log");
  port = 55_000 + (process.pid % 900);
  await mkdir(socketPath);
  run("initdb", ["-D", dataPath, "--auth=trust", "--username=postgres", "--encoding=UTF8", "--no-locale"]);
  run("pg_ctl", ["-D", dataPath, "-l", logPath, "-o", `-F -k ${socketPath} -p ${port}`, "-w", "start"]);
  psql(["-c", bootstrapSql]);
  const migrations = (await readdir(migrationsPath)).filter((name) => name.endsWith(".sql")).sort();
  for (const migration of migrations) psql(["-f", join(migrationsPath, migration)]);
  psql(["-c", fixtureSql]);
});

after(async () => {
  if (!clusterPath) return;
  run("pg_ctl", ["-D", join(clusterPath, "data"), "-m", "fast", "-w", "stop"], { allowFailure: true });
  await rm(clusterPath, { recursive: true, force: true });
});

test("read-only preflight recognizes the exact post-Auth state", () => {
  const output = psql(["-f", preflightPath]).stdout.trim();
  const summary = JSON.parse(output);
  assert.equal(summary.project_ref, "pficsujapinkmqsyvcfw");
  assert.equal(summary.roster_count, 23);
  assert.equal(summary.collision_count, 0);
  assert.equal(summary.ready_after_auth, true);
});

test("atomic roster apply is idempotent and preserves reused data", () => {
  psql(["-f", applyPath]);
  psql(["-f", applyPath]);
  const output = psql(["-f", verifyPath]).stdout.trim();
  assert.match(output, /pro7_roster_live_verification_ok/u);
});

test("an unexpected active membership rolls the entire import back", () => {
  query(String.raw`
    insert into public.memberships (team_id, user_id, role_id)
    select
      '91000000-0000-4000-8000-000000000010',
      '91000000-0000-4000-8000-000000000999',
      id
    from public.roles
    where team_id = '91000000-0000-4000-8000-000000000010' and slug = 'member';
    update public.profiles
    set display_name = 'Before rollback'
    where id = '91000000-0000-4000-8000-000000000002';
  `);
  const beforeAudit = query("select count(*) from private.audit_events where request_id like 'PRO7-ROSTER-20260826%'");
  const failed = psql(["-f", applyPath], { allowFailure: true });
  assert.notEqual(failed.status, 0);
  assert.match(failed.stderr, /exactly 24 active memberships/iu);
  assert.equal(query("select display_name from public.profiles where id = '91000000-0000-4000-8000-000000000002'"), "Before rollback");
  assert.equal(query("select count(*) from private.audit_events where request_id like 'PRO7-ROSTER-20260826%'"), beforeAudit);
});
