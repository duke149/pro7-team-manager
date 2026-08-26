import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after, before } from "node:test";
import { fileURLToPath } from "node:url";

const repositoryPath = fileURLToPath(new URL("../", import.meta.url));
const migrationsPath = join(repositoryPath, "supabase", "migrations");
const seedPath = join(repositoryPath, "supabase", "demo", "pro7-demo-seed.sql");
const cleanupPath = join(repositoryPath, "supabase", "demo", "pro7-demo-cleanup.sql");
const demoMatchIds = [
  "70000000-0000-4000-8000-000000000001",
  "70000000-0000-4000-8000-000000000002",
  "70000000-0000-4000-8000-000000000003",
];

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
  return run(
    "psql",
    ["-XAtq", "-v", "ON_ERROR_STOP=1", "-h", socketPath, "-p", String(port), "-U", "postgres", "-d", "postgres", ...arguments_],
    options,
  );
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
  create function auth.uid() returns uuid language sql stable set search_path = '' as
    'select nullif(pg_catalog.current_setting(''request.jwt.claim.sub'', true), '''')::uuid';
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
  create function storage.foldername(p_name text) returns text[] language sql immutable set search_path = '' as
    'select pg_catalog.string_to_array(p_name, ''/'')';
`;

const fixtureSql = String.raw`
  insert into auth.users (id, email, raw_user_meta_data) values
    ('10000000-0000-4000-8000-000000000001', null, '{"display_name":"Fixture Owner"}'),
    ('10000000-0000-4000-8000-000000000010', null, '{"display_name":"PRO7 Demo Player 01"}'),
    ('10000000-0000-4000-8000-000000000011', null, '{"display_name":"PRO7 Demo Player 02"}'),
    ('10000000-0000-4000-8000-000000000012', null, '{"display_name":"PRO7 Demo Player 03"}'),
    ('10000000-0000-4000-8000-000000000013', null, '{"display_name":"PRO7 Demo Player 04"}'),
    ('10000000-0000-4000-8000-000000000014', null, '{"display_name":"PRO7 Demo Player 05"}'),
    ('10000000-0000-4000-8000-000000000015', null, '{"display_name":"PRO7 Demo Player 06"}'),
    ('10000000-0000-4000-8000-000000000016', null, '{"display_name":"PRO7 Demo Player 07"}'),
    ('10000000-0000-4000-8000-000000000017', null, '{"display_name":"PRO7 Demo Player 08"}'),
    ('10000000-0000-4000-8000-000000000099', null, '{"display_name":"Unmarked Fixture Member"}');

  insert into public.teams (id, name, slug, owner_user_id)
  values ('20000000-0000-4000-8000-000000000001', 'PRO7 FC', 'pro7-fc', '10000000-0000-4000-8000-000000000001');

  insert into public.memberships (team_id, user_id, role_id)
  select '20000000-0000-4000-8000-000000000001', users.user_id, roles.id
  from unnest(array[
    '10000000-0000-4000-8000-000000000010'::uuid,
    '10000000-0000-4000-8000-000000000011'::uuid,
    '10000000-0000-4000-8000-000000000012'::uuid,
    '10000000-0000-4000-8000-000000000013'::uuid,
    '10000000-0000-4000-8000-000000000014'::uuid,
    '10000000-0000-4000-8000-000000000015'::uuid,
    '10000000-0000-4000-8000-000000000016'::uuid,
    '10000000-0000-4000-8000-000000000017'::uuid,
    '10000000-0000-4000-8000-000000000099'::uuid
  ]) as users(user_id)
  cross join public.roles as roles
  where roles.team_id = '20000000-0000-4000-8000-000000000001'
    and roles.slug = 'member';

  update public.team_player_profiles as player
  set shirt_number = positions.shirt_number,
      official_position = positions.official_position,
      player_status = positions.player_status,
      join_date = date '2026-01-01',
      admin_notes = positions.admin_notes
  from (values
    ('10000000-0000-4000-8000-000000000010'::uuid, 1::smallint, 'GK', 'available', 'Fixture goalkeeper'),
    ('10000000-0000-4000-8000-000000000011'::uuid, 2::smallint, 'DEF', 'available', null),
    ('10000000-0000-4000-8000-000000000012'::uuid, 3::smallint, 'DEF', 'available', null),
    ('10000000-0000-4000-8000-000000000013'::uuid, 4::smallint, 'MID', 'available', null),
    ('10000000-0000-4000-8000-000000000014'::uuid, 5::smallint, 'MID', 'available', null),
    ('10000000-0000-4000-8000-000000000015'::uuid, 6::smallint, 'ATT', 'available', null),
    ('10000000-0000-4000-8000-000000000016'::uuid, 7::smallint, 'ATT', 'available', null),
    ('10000000-0000-4000-8000-000000000017'::uuid, 8::smallint, 'MID', 'injured', 'Fixture injury')
  ) as positions(user_id, shirt_number, official_position, player_status, admin_notes)
  where player.team_id = '20000000-0000-4000-8000-000000000001'
    and player.user_id = positions.user_id;

  insert into public.team_news (id, team_id, title, body, status, published_at, author_user_id)
  values ('90000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'Unmarked fixture news', 'This row must survive demo cleanup unchanged.', 'published', '2026-08-01T00:00:00Z', '10000000-0000-4000-8000-000000000001');

  insert into public.finance_entries (id, team_id, direction, amount_vnd, category, occurred_on, description, created_by_user_id)
  values ('90000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', 'income', 123456, 'fixture', '2026-08-01', 'This unmarked finance row must survive unchanged.', '10000000-0000-4000-8000-000000000001');
`;

const demoFilters = {
  matches: `id <> all (array[${demoMatchIds.map((id) => `'${id}'::uuid`).join(",")}])`,
  match_attendance: `match_id <> all (array[${demoMatchIds.map((id) => `'${id}'::uuid`).join(",")}])`,
  match_events: "id::text not like '70000000-0000-4000-8000-0000000001__'",
  match_player_stats: `match_id <> all (array[${demoMatchIds.map((id) => `'${id}'::uuid`).join(",")}])`,
  match_team_stats: `match_id <> all (array[${demoMatchIds.map((id) => `'${id}'::uuid`).join(",")}])`,
  team_news: "id::text not like '70000000-0000-4000-8000-0000000002__'",
  match_tactics: "id::text not like '70000000-0000-4000-8000-0000000003__'",
  lineup_slots: "id::text not like '70000000-0000-4000-8000-000000001___'",
  finance_entries: "id::text not like '70000000-0000-4000-8000-0000000004__'",
  member_dues: "id::text not like '70000000-0000-4000-8000-0000000005__'",
  notifications: "id::text not like '70000000-0000-4000-8000-0000000006__'",
};

async function databaseSnapshot(excludeDemo = false) {
  const tables = query(String.raw`
    select table_schema || '.' || table_name
    from information_schema.tables
    where table_type = 'BASE TABLE'
      and table_schema = any (array['auth', 'private', 'public', 'storage'])
    order by table_schema, table_name
  `).split("\n").filter(Boolean);
  const snapshot = {};
  for (const qualified of tables) {
    const [schema, table] = qualified.split(".");
    const filter = excludeDemo && schema === "public" && demoFilters[table] ? ` where ${demoFilters[table]}` : "";
    const raw = query(`select coalesce(jsonb_agg(row_json order by row_json::text), '[]'::jsonb) from (select to_jsonb(value) as row_json from ${schema}.${table} as value${filter}) as rows`);
    snapshot[qualified] = JSON.parse(raw);
  }
  return snapshot;
}

function demoCoverage() {
  const ids = demoMatchIds.map((id) => `'${id}'::uuid`).join(",");
  return JSON.parse(query(String.raw`
    select jsonb_build_object(
      'matches', (select count(*) from public.matches where id = any (array[${ids}])),
      'match_statuses', (select jsonb_agg(status order by status) from public.matches where id = any (array[${ids}])),
      'attendance', (select count(*) from public.match_attendance where match_id = any (array[${ids}])),
      'rsvp_statuses', (select jsonb_agg(status order by status) from public.match_attendance where match_id = any (array[${ids}])),
      'events', (select count(*) from public.match_events where id::text like '70000000-0000-4000-8000-0000000001__'),
      'player_stats', (select count(*) from public.match_player_stats where match_id = any (array[${ids}])),
      'team_stats', (select count(*) from public.match_team_stats where match_id = any (array[${ids}])),
      'news', (select count(*) from public.team_news where id::text like '70000000-0000-4000-8000-0000000002__'),
      'news_statuses', (select jsonb_agg(status order by status) from public.team_news where id::text like '70000000-0000-4000-8000-0000000002__'),
      'tactics', (select count(*) from public.match_tactics where id::text like '70000000-0000-4000-8000-0000000003__'),
      'tactic_statuses', (select jsonb_agg(status order by status) from public.match_tactics where id::text like '70000000-0000-4000-8000-0000000003__'),
      'lineup_slots', (select count(*) from public.lineup_slots where id::text like '70000000-0000-4000-8000-000000001___'),
      'starters', (select count(*) from public.lineup_slots where id::text like '70000000-0000-4000-8000-000000001___' and slot_kind = 'starter'),
      'bench', (select count(*) from public.lineup_slots where id::text like '70000000-0000-4000-8000-000000001___' and slot_kind = 'bench'),
      'finance', (select count(*) from public.finance_entries where id::text like '70000000-0000-4000-8000-0000000004__'),
      'finance_directions', (select jsonb_agg(distinct direction order by direction) from public.finance_entries where id::text like '70000000-0000-4000-8000-0000000004__'),
      'voided_finance', (select count(*) from public.finance_entries where id::text like '70000000-0000-4000-8000-0000000004__' and voided_at is not null),
      'dues', (select count(*) from public.member_dues where id::text like '70000000-0000-4000-8000-0000000005__'),
      'due_statuses', (select jsonb_agg(status order by status) from public.member_dues where id::text like '70000000-0000-4000-8000-0000000005__'),
      'notifications', (select count(*) from public.notifications where id::text like '70000000-0000-4000-8000-0000000006__')
    )
  `));
}

function markerViolationCount() {
  return Number(query(String.raw`
    select
      (select count(*) from public.matches where id::text like '70000000-0000-4000-8000-00000000000_' and venue not like 'PRO7-DEMO%')
      + (select count(*) from public.match_attendance as row join public.matches as parent on parent.id = row.match_id and parent.team_id = row.team_id where parent.id::text like '70000000-0000-4000-8000-00000000000_' and (row.note not like 'PRO7-DEMO%' or parent.venue not like 'PRO7-DEMO%'))
      + (select count(*) from public.match_events where id::text like '70000000-0000-4000-8000-0000000001__' and note not like 'PRO7-DEMO%')
      + (select count(*) from public.match_player_stats as row join public.matches as parent on parent.id = row.match_id and parent.team_id = row.team_id where parent.id::text like '70000000-0000-4000-8000-00000000000_' and parent.venue not like 'PRO7-DEMO%')
      + (select count(*) from public.match_team_stats as row join public.matches as parent on parent.id = row.match_id and parent.team_id = row.team_id where parent.id::text like '70000000-0000-4000-8000-00000000000_' and parent.venue not like 'PRO7-DEMO%')
      + (select count(*) from public.team_news where id::text like '70000000-0000-4000-8000-0000000002__' and body not like 'PRO7-DEMO%')
      + (select count(*) from public.match_tactics where id::text like '70000000-0000-4000-8000-0000000003__' and instructions not like 'PRO7-DEMO%')
      + (select count(*) from public.lineup_slots as row join public.match_tactics as parent on parent.id = row.tactic_id and parent.team_id = row.team_id where row.id::text like '70000000-0000-4000-8000-000000001___' and parent.instructions not like 'PRO7-DEMO%')
      + (select count(*) from public.finance_entries where id::text like '70000000-0000-4000-8000-0000000004__' and (category not like 'PRO7-DEMO%' or description not like 'PRO7-DEMO%'))
      + (select count(*) from public.member_dues as row where row.id::text like '70000000-0000-4000-8000-0000000005__' and not exists (select 1 from public.finance_entries as marker where marker.id = '70000000-0000-4000-8000-000000000401' and marker.team_id = row.team_id and marker.description like 'PRO7-DEMO%'))
      + (select count(*) from public.notifications where id::text like '70000000-0000-4000-8000-0000000006__' and body not like 'PRO7-DEMO%')
  `));
}

before(async () => {
  clusterPath = await mkdtemp(join(tmpdir(), "pro7-demo-pg17-"));
  const dataPath = join(clusterPath, "data");
  socketPath = join(clusterPath, "socket");
  const logPath = join(clusterPath, "postgres.log");
  port = 54_000 + (process.pid % 1_000);
  await mkdir(socketPath);
  run("initdb", ["-D", dataPath, "--auth=trust", "--username=postgres", "--encoding=UTF8", "--no-locale"]);
  run("pg_ctl", ["-D", dataPath, "-l", logPath, "-o", `-F -k ${socketPath} -p ${port}`, "-w", "start"]);
  psql(["-c", bootstrapSql]);
  const migrations = (await readdir(migrationsPath)).filter((name) => name.endsWith(".sql")).sort();
  assert.ok(migrations.length > 0);
  for (const migration of migrations) psql(["-f", join(migrationsPath, migration)]);
  psql(["-c", fixtureSql]);
});

after(async () => {
  if (!clusterPath) return;
  run("pg_ctl", ["-D", join(clusterPath, "data"), "-m", "fast", "-w", "stop"], { allowFailure: true });
  await rm(clusterPath, { recursive: true, force: true });
});

test("demo SQL is explicitly marked and cannot mutate Supabase Auth identities", async () => {
  const [seed, cleanup] = await Promise.all([readFile(seedPath, "utf8"), readFile(cleanupPath, "utf8")]);
  const combined = `${seed}\n${cleanup}`;
  assert.match(seed, /PRO7-DEMO/u);
  assert.match(cleanup, /PRO7-DEMO/u);
  assert.doesNotMatch(combined, /\bauth\.users\b/iu);
  assert.doesNotMatch(combined, /\b(?:password|encrypted_password|email)\b/iu);
  assert.doesNotMatch(seed, /\bgen_random_uuid\s*\(/iu);
});

test("seed is idempotent, covers every MVP state, and cleanup restores the exact baseline", async () => {
  const baseline = await databaseSnapshot();
  const firstSeed = psql(["-f", seedPath]);
  const resultLine = firstSeed.stdout.split(/\r?\n/u).map((line) => line.trim()).find((line) => line.startsWith("{"));
  assert.ok(resultLine);
  assert.deepEqual(JSON.parse(resultLine), { marker: "PRO7-DEMO", player_count: 7 });
  const firstCoverage = demoCoverage();
  assert.deepEqual(firstCoverage, {
    matches: 3, match_statuses: ["cancelled", "completed", "scheduled"], attendance: 3,
    rsvp_statuses: ["available", "pending", "unavailable"], events: 5, player_stats: 3,
    team_stats: 1, news: 2, news_statuses: ["draft", "published"], tactics: 2,
    tactic_statuses: ["applied", "draft"], lineup_slots: 14, starters: 14, bench: 0,
    finance: 3, finance_directions: ["expense", "income"], voided_finance: 1,
    dues: 3, due_statuses: ["paid", "pending", "waived"], notifications: 2,
  });
  assert.equal(markerViolationCount(), 0, "a demo row lacks a bounded marker or marked parent");
  assert.deepEqual(await databaseSnapshot(true), baseline, "seed changed an unmarked row");

  psql(["-f", seedPath]);
  assert.deepEqual(demoCoverage(), firstCoverage, "second seed changed demo row counts");

  psql(["-f", cleanupPath]);
  assert.deepEqual(demoCoverage(), {
    matches: 0, match_statuses: null, attendance: 0, rsvp_statuses: null, events: 0,
    player_stats: 0, team_stats: 0, news: 0, news_statuses: null, tactics: 0,
    tactic_statuses: null, lineup_slots: 0, starters: 0, bench: 0, finance: 0,
    finance_directions: null, voided_finance: 0, dues: 0, due_statuses: null, notifications: 0,
  });
  assert.deepEqual(await databaseSnapshot(), baseline, "cleanup did not restore the exact baseline");

  psql(["-f", cleanupPath]);
  assert.deepEqual(await databaseSnapshot(), baseline, "second cleanup changed the baseline");
});

test("seed supports one active membership and emits its bounded tactic player count", () => {
  psql(["-c", "update public.memberships set status = 'inactive' where team_id = '20000000-0000-4000-8000-000000000001' and user_id <> '10000000-0000-4000-8000-000000000001'"]);
  const seeded = psql(["-f", seedPath]);
  const resultLine = seeded.stdout.split(/\r?\n/u).map((line) => line.trim()).find((line) => line.startsWith("{"));
  assert.ok(resultLine, `seed returned no player-count result:\n${seeded.stdout}`);
  assert.deepEqual(JSON.parse(resultLine), { marker: "PRO7-DEMO", player_count: 1 });
  const coverage = demoCoverage();
  assert.equal(coverage.attendance, 3);
  assert.deepEqual(coverage.rsvp_statuses, ["available", "pending", "unavailable"]);
  assert.equal(coverage.tactics, 2);
  assert.equal(coverage.lineup_slots, 2);
  assert.equal(coverage.starters, 2);
  assert.equal(coverage.bench, 0);
  assert.deepEqual(coverage.due_statuses, ["paid", "pending", "waived"]);
  psql(["-f", cleanupPath]);
  psql(["-c", "update public.memberships set status = 'active' where team_id = '20000000-0000-4000-8000-000000000001'"]);
});

test("seed and cleanup preserve an unmarked deterministic-ID collision", () => {
  psql(["-c", "insert into public.matches (id, team_id, opponent, starts_at, venue, is_home, rsvp_deadline, status, created_by_user_id) values ('70000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'Unmarked Collision', '2026-12-01T12:00:00Z', 'Real venue', true, '2026-11-30T12:00:00Z', 'scheduled', '10000000-0000-4000-8000-000000000001')"]);
  const beforeCollision = query("select to_jsonb(row) from public.matches as row where id = '70000000-0000-4000-8000-000000000001'");
  const seeded = psql(["-f", seedPath], { allowFailure: true });
  assert.notEqual(seeded.status, 0);
  assert.match(seeded.stderr, /deterministic identifier collides with an unmarked row/iu);
  psql(["-f", cleanupPath]);
  assert.equal(query("select to_jsonb(row) from public.matches as row where id = '70000000-0000-4000-8000-000000000001'"), beforeCollision);
  psql(["-c", "delete from public.matches where id = '70000000-0000-4000-8000-000000000001' and venue = 'Real venue'"]);
});

test("seed refuses missing and ambiguous exact pro7-fc targets", () => {
  const missing = psql(["-c", "begin", "-c", "update public.teams set slug = 'renamed-pro7-fc' where slug = 'pro7-fc'", "-f", seedPath], { allowFailure: true });
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /exactly one public\.teams row with slug pro7-fc/iu);

  const ambiguous = psql([
    "-c", "begin",
    "-c", "drop index public.teams_slug_lower_key",
    "-c", "insert into public.teams (id, name, slug, owner_user_id) values ('20000000-0000-4000-8000-000000000002', 'Duplicate', 'pro7-fc', '10000000-0000-4000-8000-000000000001')",
    "-f", seedPath,
  ], { allowFailure: true });
  assert.notEqual(ambiguous.status, 0);
  assert.match(ambiguous.stderr, /exactly one public\.teams row with slug pro7-fc/iu);
});
