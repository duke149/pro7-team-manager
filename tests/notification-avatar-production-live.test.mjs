import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readdir, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after, before } from "node:test";
import { fileURLToPath } from "node:url";

const repositoryPath = fileURLToPath(new URL("../", import.meta.url));
const migrationsPath = join(repositoryPath, "supabase", "migrations");
const migrationName = "20260828104446_notification_avatar_visibility.sql";
const owner = "95000000-0000-4000-8000-000000000001";
const member = "95000000-0000-4000-8000-000000000002";
const unrelated = "95000000-0000-4000-8000-000000000003";
const team = "95000000-0000-4000-8000-000000000010";
const match = "95000000-0000-4000-8000-000000000020";

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

async function availablePort() {
  const server = createServer();
  await new Promise((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolvePromise);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const selected = address.port;
  await new Promise((resolvePromise, reject) => server.close((error) => error ? reject(error) : resolvePromise()));
  return selected;
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
  grant usage on schema storage to authenticated;
  grant select on table storage.objects to authenticated;
  create function auth.uid() returns uuid language sql stable set search_path = '' as
    'select nullif(pg_catalog.current_setting(''request.jwt.claim.sub'', true), '''')::uuid';
  create function storage.foldername(p_name text) returns text[] language sql immutable set search_path = '' as
    'select pg_catalog.string_to_array(p_name, ''/'')';
`;

before(async () => {
  clusterPath = await mkdtemp(join(tmpdir(), "p7-na-"));
  const dataPath = join(clusterPath, "data");
  socketPath = join(clusterPath, "socket");
  const logPath = join(clusterPath, "postgres.log");
  port = await availablePort();
  await mkdir(socketPath);
  run("initdb", ["-D", dataPath, "--auth=trust", "--username=postgres", "--encoding=UTF8", "--no-locale"]);
  run("pg_ctl", ["-D", dataPath, "-l", logPath, "-o", `-F -k ${socketPath} -p ${port}`, "-w", "start"]);
  psql(["-c", bootstrapSql]);
  const migrations = (await readdir(migrationsPath)).filter((name) => name.endsWith(".sql")).sort();
  for (const name of migrations.filter((name) => name !== migrationName)) {
    psql(["-f", join(migrationsPath, name)]);
  }
  psql(["-c", String.raw`
    insert into auth.users (id, email) values
      ('${owner}', 'owner@example.test'),
      ('${member}', 'member@example.test'),
      ('${unrelated}', 'unrelated@example.test');
    insert into public.teams (id, name, slug, owner_user_id)
      values ('${team}', 'PRO7 FC', 'pro7-fc', '${owner}');
    insert into public.memberships (team_id, user_id, role_id)
      select '${team}', '${member}', id from public.roles where team_id = '${team}' and slug = 'member';
    insert into public.matches (id, team_id, opponent, starts_at, venue, is_home, rsvp_deadline, status, created_by_user_id)
      values ('${match}', '${team}', 'FC Test', '2026-10-01T12:00:00Z', 'CK2', true, '2026-09-30T12:00:00Z', 'scheduled', '${owner}');
    insert into public.notifications (team_id, user_id, type, source_entity, source_id, title, body, target_path)
      values ('${team}', '${member}', 'match_invitation', 'match', '${match}', 'Lời mời', 'Xác nhận tham gia.', '/teams/stale-slug/matches/${match}');
    insert into storage.objects (bucket_id, name)
      values ('player-avatars', '${member}/avatar.jpg');
  `]);
  psql(["-f", join(migrationsPath, migrationName)]);
});

after(async () => {
  if (!clusterPath) return;
  run("pg_ctl", ["-D", join(clusterPath, "data"), "-m", "fast", "-w", "stop"], { allowFailure: true });
  await rm(clusterPath, { recursive: true, force: true });
});

test("forward migration repairs stale links and keeps them synchronized", () => {
  assert.equal(
    psql(["-c", `select target_path from public.notifications where source_id = '${match}'`]).stdout.trim(),
    `/teams/pro7-fc/matches/${match}`,
  );
  psql(["-c", String.raw`
    begin;
    set local role authenticated;
    set local "request.jwt.claim.sub" = '${owner}';
    update public.teams set slug = 'nat-fc' where id = '${team}';
    commit;
  `]);
  assert.equal(
    psql(["-c", `select target_path from public.notifications where source_id = '${match}'`]).stdout.trim(),
    `/teams/nat-fc/matches/${match}`,
  );
});

test("avatar SELECT is shared-team readable but unrelated users remain denied", () => {
  const selectAs = (userId) => psql(["-c", String.raw`
    begin;
    set local role authenticated;
    set local "request.jwt.claim.sub" = '${userId}';
    select count(*) from storage.objects
    where bucket_id = 'player-avatars' and name = '${member}/avatar.jpg';
    commit;
  `]).stdout.trim();
  assert.equal(selectAs(owner), "1");
  assert.equal(selectAs(member), "1");
  assert.equal(selectAs(unrelated), "0");
});
