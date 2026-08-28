import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after, before } from "node:test";
import { fileURLToPath } from "node:url";

const repositoryPath = fileURLToPath(new URL("../", import.meta.url));
const migrationsPath = join(repositoryPath, "supabase", "migrations");
const OWNER = "93000000-0000-4000-8000-000000000001";
const MEMBER = "93000000-0000-4000-8000-000000000002";
const OTHER_OWNER = "93000000-0000-4000-8000-000000000003";
const TEAM = "93000000-0000-4000-8000-000000000010";
const OTHER_TEAM = "93000000-0000-4000-8000-000000000011";

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
  clusterPath = await mkdtemp(join(tmpdir(), "pro7-news-pg17-"));
  const dataPath = join(clusterPath, "data");
  socketPath = join(clusterPath, "socket");
  const logPath = join(clusterPath, "postgres.log");
  port = 57_500 + (process.pid % 400);
  await mkdir(socketPath);
  run("initdb", ["-D", dataPath, "--auth=trust", "--username=postgres", "--encoding=UTF8", "--no-locale"]);
  run("pg_ctl", ["-D", dataPath, "-l", logPath, "-o", `-F -k ${socketPath} -p ${port}`, "-w", "start"]);
  psql(["-c", bootstrapSql]);
  for (const migration of (await readdir(migrationsPath)).filter((name) => name.endsWith(".sql")).sort()) psql(["-f", join(migrationsPath, migration)]);
  psql(["-c", String.raw`
    insert into auth.users (id, email) values ('${OWNER}', 'owner@example.com'), ('${MEMBER}', 'member@example.com'), ('${OTHER_OWNER}', 'other-owner@example.com');
    insert into public.teams (id, name, slug, owner_user_id) values ('${TEAM}', 'PRO7 FC', 'pro7-fc', '${OWNER}');
    insert into public.teams (id, name, slug, owner_user_id) values ('${OTHER_TEAM}', 'Other FC', 'other-fc', '${OTHER_OWNER}');
    insert into public.memberships (team_id, user_id, role_id)
    select '${TEAM}', '${MEMBER}', id from public.roles where team_id = '${TEAM}' and slug = 'member';
  `]);
});

after(async () => {
  if (!clusterPath) return;
  run("pg_ctl", ["-D", join(clusterPath, "data"), "-m", "fast", "-w", "stop"], { allowFailure: true });
  await rm(clusterPath, { recursive: true, force: true });
});

function authenticated(userId, sql, options = {}) {
  return psql(["-c", `begin; set local role authenticated; set local "request.jwt.claim.sub" = '${userId}'; ${sql}; commit;`], options);
}

test("Team News lifecycle is atomic, stale-safe, audited, and published-only for Members", () => {
  const created = authenticated(OWNER, `
    select id::text || '|' || updated_at::text
    from public.manage_team_news('${TEAM}', 'create', null, 'Thông báo tập luyện', 'Toàn đội có mặt lúc 19 giờ.', null)
  `).stdout.trim().split("|");
  assert.equal(created.length, 2);
  const [newsId, createToken] = created;
  assert.match(newsId, /^[0-9a-f-]{36}$/u);
  assert.match(createToken, /^\d{4}-\d{2}-\d{2}/u);

  assert.equal(authenticated(MEMBER, `select count(*) from public.team_news where team_id = '${TEAM}'`).stdout.trim(), "0");

  const updatedToken = authenticated(OWNER, `
    select updated_at::text from public.manage_team_news(
      '${TEAM}', 'update', '${newsId}', 'Thông báo tập luyện cập nhật', 'Toàn đội có mặt lúc 19 giờ 30.', '${createToken}'::timestamptz
    )
  `).stdout.trim();
  assert.notEqual(updatedToken, createToken);

  const stale = authenticated(OWNER, `
    select * from public.manage_team_news('${TEAM}', 'publish', '${newsId}', null, null, '${createToken}'::timestamptz)
  `, { allowFailure: true });
  assert.notEqual(stale.status, 0);
  assert.match(stale.stderr, /Team news changed/iu);

  const publishedToken = authenticated(OWNER, `
    select updated_at::text from public.manage_team_news('${TEAM}', 'publish', '${newsId}', null, null, '${updatedToken}'::timestamptz)
  `).stdout.trim();
  assert.equal(authenticated(MEMBER, `select count(*) from public.team_news where id = '${newsId}' and status = 'published'`).stdout.trim(), "1");

  const archived = authenticated(OWNER, `
    select status::text || '|' || updated_at::text from public.manage_team_news('${TEAM}', 'archive', '${newsId}', null, null, '${publishedToken}'::timestamptz)
  `).stdout.trim().split("|");
  assert.equal(archived[0], "archived");
  assert.equal(authenticated(MEMBER, `select count(*) from public.team_news where id = '${newsId}'`).stdout.trim(), "0");

  const restored = authenticated(OWNER, `
    select status from public.manage_team_news('${TEAM}', 'restore', '${newsId}', null, null, '${archived[1]}'::timestamptz)
  `).stdout.trim();
  assert.equal(restored, "draft");
  assert.equal(authenticated(MEMBER, `select count(*) from public.team_news where id = '${newsId}'`).stdout.trim(), "0");

  const audit = psql(["-c", `select count(*)::text || '|' || count(*) filter (where coalesce(old_data, '{}'::jsonb) ? 'title' or coalesce(new_data, '{}'::jsonb) ? 'body')::text from private.audit_events where team_id = '${TEAM}' and table_name = 'team_news'`]).stdout.trim();
  assert.equal(audit, "5|0");
});

test("Member, anonymous, and direct authenticated Team News writes are denied", () => {
  const member = authenticated(MEMBER, `select * from public.manage_team_news('${TEAM}', 'create', null, 'Không hợp lệ', 'Không được phép.', null)`, { allowFailure: true });
  assert.notEqual(member.status, 0);
  assert.match(member.stderr, /News management permission required/iu);

  const direct = authenticated(OWNER, `insert into public.team_news (team_id, title, body, author_user_id) values ('${TEAM}', 'Trực tiếp', 'Không được phép.', '${OWNER}')`, { allowFailure: true });
  assert.notEqual(direct.status, 0);
  assert.match(direct.stderr, /permission denied/iu);

  const anonymous = psql(["-c", `begin; set local role anon; select * from public.manage_team_news('${TEAM}', 'create', null, 'Ẩn danh', 'Không được phép.', null); commit;`], { allowFailure: true });
  assert.notEqual(anonymous.status, 0);
  assert.match(anonymous.stderr, /permission denied/iu);
});

test("an authorized manager cannot mutate a foreign team or smuggle a foreign News identity", () => {
  const foreign = authenticated(OTHER_OWNER, `
    select id::text || '|' || updated_at::text
    from public.manage_team_news('${OTHER_TEAM}', 'create', null, 'Tin đội khác', 'Không thuộc PRO7.', null)
  `).stdout.trim().split("|");
  assert.equal(foreign.length, 2);

  const foreignTeam = authenticated(OWNER, `
    select * from public.manage_team_news('${OTHER_TEAM}', 'archive', '${foreign[0]}', null, null, '${foreign[1]}'::timestamptz)
  `, { allowFailure: true });
  assert.notEqual(foreignTeam.status, 0);
  assert.match(foreignTeam.stderr, /News management permission required/iu);

  const foreignIdentity = authenticated(OWNER, `
    select * from public.manage_team_news('${TEAM}', 'archive', '${foreign[0]}', null, null, '${foreign[1]}'::timestamptz)
  `, { allowFailure: true });
  assert.notEqual(foreignIdentity.status, 0);
  assert.match(foreignIdentity.stderr, /Team news not found/iu);
  assert.equal(psql(["-c", `select status from public.team_news where id = '${foreign[0]}'`]).stdout.trim(), "draft");
});
