import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after, before } from "node:test";
import { fileURLToPath } from "node:url";

import { getTacticsDetail } from "../lib/tactics/queries.ts";

const repositoryPath = fileURLToPath(new URL("../", import.meta.url));
const migrationsPath = join(repositoryPath, "supabase", "migrations");
const seedPath = join(repositoryPath, "supabase", "demo", "pro7-demo-seed.sql");
const cleanupPath = join(repositoryPath, "supabase", "demo", "pro7-demo-cleanup.sql");
const demoMatchIds = [
  "70000000-0000-4000-8000-000000000001",
  "70000000-0000-4000-8000-000000000002",
  "70000000-0000-4000-8000-000000000003",
];
const demoTeamId = "20000000-0000-4000-8000-000000000001";
const demoOwnerId = "10000000-0000-4000-8000-000000000001";
const demoDueMarkerRequestId = "PRO7-DEMO-DUE-SNAPSHOT";

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
    const publicFilter = schema === "public" && demoFilters[table] ? demoFilters[table] : null;
    const privateFilter = schema === "private" && table === "audit_events" ? `request_id is distinct from '${demoDueMarkerRequestId}'` : null;
    const filter = excludeDemo && (publicFilter ?? privateFilter) ? ` where ${publicFilter ?? privateFilter}` : "";
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
      'due_markers', (select count(*) from private.audit_events where request_id = '${demoDueMarkerRequestId}' and table_name = 'member_dues'),
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
      + (select count(*) from public.member_dues as row where row.id::text like '70000000-0000-4000-8000-0000000005__' and not exists (select 1 from private.audit_events as marker where marker.request_id = '${demoDueMarkerRequestId}' and marker.table_name = 'member_dues' and marker.row_key = jsonb_build_object('id', row.id) and marker.new_data = to_jsonb(row)))
      + (select count(*) from public.notifications where id::text like '70000000-0000-4000-8000-0000000006__' and body not like 'PRO7-DEMO%')
  `));
}

function tacticsRouteFixture() {
  const memberships = JSON.parse(query(String.raw`
    select coalesce(jsonb_agg(jsonb_build_object(
      'user_id', membership.user_id,
      'player', jsonb_build_object(
        'shirt_number', player.shirt_number,
        'official_position', player.official_position,
        'player_status', player.player_status
      )
    ) order by membership.user_id), '[]'::jsonb)
    from public.memberships as membership
    join public.team_player_profiles as player
      on player.team_id = membership.team_id and player.user_id = membership.user_id
    where membership.team_id = '${demoTeamId}' and membership.status = 'active'
  `));
  const profiles = JSON.parse(query(String.raw`
    select coalesce(jsonb_agg(jsonb_build_object('id', profile.id, 'display_name', profile.display_name) order by profile.id), '[]'::jsonb)
    from public.profiles as profile
    join public.memberships as membership on membership.user_id = profile.id
    where membership.team_id = '${demoTeamId}' and membership.status = 'active'
  `));
  const tactics = JSON.parse(query(String.raw`
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', tactic.id,
      'mode', tactic.mode,
      'formation', tactic.formation,
      'instructions', tactic.instructions,
      'version', tactic.version,
      'pressing', tactic.pressing,
      'defensive_line', tactic.defensive_line,
      'status', tactic.status,
      'updated_at', tactic.updated_at,
      'applied_at', tactic.applied_at,
      'slots', coalesce((
        select jsonb_agg(jsonb_build_object(
          'user_id', slot.user_id,
          'slot_kind', slot.slot_kind,
          'slot_key', slot.slot_key,
          'role_label', slot.role_label,
          'shirt_number', slot.shirt_number,
          'x', slot.x,
          'y', slot.y
        ) order by slot.slot_key)
        from public.lineup_slots as slot where slot.tactic_id = tactic.id
      ), '[]'::jsonb)
    ) order by tactic.updated_at desc, tactic.id), '[]'::jsonb)
    from public.match_tactics as tactic
    where tactic.team_id = '${demoTeamId}' and tactic.match_id = '${demoMatchIds[0]}'
  `));
  return { memberships, profiles, tactics };
}

async function parsedTacticsDetail(canManage) {
  const rows = tacticsRouteFixture();
  const supabase = {
    from(table) {
      const filters = new Map();
      return {
        select() { return this; },
        eq(column, value) { filters.set(column, value); return this; },
        gt() { return this; },
        in() { return this; },
        order() { return this; },
        async limit() {
          let data = table === "match_tactics" ? rows.tactics : rows[table];
          if (table === "match_tactics" && filters.has("status")) data = data.filter((row) => row.status === filters.get("status"));
          return { data, error: null };
        },
      };
    },
  };
  const match = {
    id: demoMatchIds[0], opponent: "Saigon Comets", startsAt: "2026-09-05T12:00:00Z",
    venue: "PRO7-DEMO • Riverside Pitch", isHome: true, rsvpDeadline: "2026-09-04T12:00:00Z",
    status: "scheduled", teamScore: null, opponentScore: null, updatedAt: "2026-08-26T00:00:00Z",
    attendance: { invited: 1, available: 0, unavailable: 0, pending: 1 }, ownAttendance: null,
  };
  return getTacticsDetail(demoTeamId, demoMatchIds[0], demoOwnerId, canManage, {
    supabase,
    listMatches: async () => ({ ok: true, matches: [match] }),
  });
}

function assertBoardReadyTactic(detail, mode, expectedBench) {
  assert.equal(detail.ok, true);
  const tactic = detail.ok && detail.detail.tactics.find((candidate) => candidate.mode === mode);
  assert.ok(tactic, `missing ${mode} tactic`);
  const starters = tactic.slots.filter((slot) => slot.slotKind === "starter");
  const bench = tactic.slots.filter((slot) => slot.slotKind === "bench");
  assert.equal(starters.length, 7, `${mode} tactic is hidden by TacticsBoard's seven-starter readiness gate`);
  assert.equal(starters.filter((slot) => slot.roleLabel === "GK").length, 1, `${mode} tactic needs exactly one starting goalkeeper`);
  assert.equal(bench.length, expectedBench);
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
  assert.deepEqual(JSON.parse(resultLine), {
    marker: "PRO7-DEMO", player_count: 8, starter_count: 7, bench_count: 1, bench_coverage: "available",
    injured_player_count: 1, injured_coverage: "available",
  });
  const firstCoverage = demoCoverage();
  assert.deepEqual(firstCoverage, {
    matches: 3, match_statuses: ["cancelled", "completed", "scheduled"], attendance: 3,
    rsvp_statuses: ["available", "pending", "unavailable"], events: 5, player_stats: 3,
    team_stats: 1, news: 2, news_statuses: ["draft", "published"], tactics: 2,
    tactic_statuses: ["applied", "draft"], lineup_slots: 16, starters: 14, bench: 2,
    finance: 3, finance_directions: ["expense", "income"], voided_finance: 1,
    dues: 3, due_statuses: ["paid", "pending", "waived"], due_markers: 3, notifications: 2,
  });
  const adminDetail = await parsedTacticsDetail(true);
  assert.equal(adminDetail.ok, true, "admin getTacticsDetail rejected seeded tactics");
  assert.equal(adminDetail.ok && adminDetail.detail.tactics.length, 2);
  assertBoardReadyTactic(adminDetail, "attacking", 1);
  const memberDetail = await parsedTacticsDetail(false);
  assert.equal(memberDetail.ok, true, "member getTacticsDetail rejected seeded applied tactic");
  assert.equal(memberDetail.ok && memberDetail.detail.tactics.length, 1);
  assertBoardReadyTactic(memberDetail, "balanced", 1);
  assert.equal(markerViolationCount(), 0, "a demo row lacks a bounded marker or marked parent");
  assert.deepEqual(await databaseSnapshot(true), baseline, "seed changed an unmarked row");

  psql(["-f", seedPath]);
  assert.deepEqual(demoCoverage(), firstCoverage, "second seed changed demo row counts");

  psql(["-f", cleanupPath]);
  assert.deepEqual(demoCoverage(), {
    matches: 0, match_statuses: null, attendance: 0, rsvp_statuses: null, events: 0,
    player_stats: 0, team_stats: 0, news: 0, news_statuses: null, tactics: 0,
    tactic_statuses: null, lineup_slots: 0, starters: 0, bench: 0, finance: 0,
    finance_directions: null, voided_finance: 0, dues: 0, due_statuses: null, due_markers: 0, notifications: 0,
  });
  assert.deepEqual(await databaseSnapshot(), baseline, "cleanup did not restore the exact baseline");

  psql(["-f", cleanupPath]);
  assert.deepEqual(await databaseSnapshot(), baseline, "second cleanup changed the baseline");
});

test("seven selected players keep both tactics board-ready while reporting deferred bench coverage", async () => {
  psql(["-c", String.raw`
    update public.memberships
    set status = 'inactive'
    where team_id = '${demoTeamId}'
      and user_id in (
        select user_id from public.memberships
        where team_id = '${demoTeamId}' and status = 'active'
        order by user_id offset 7
      )
  `]);
  const seeded = psql(["-f", seedPath]);
  const resultLine = seeded.stdout.split(/\r?\n/u).map((line) => line.trim()).find((line) => line.startsWith("{"));
  assert.ok(resultLine);
  assert.deepEqual(JSON.parse(resultLine), {
    marker: "PRO7-DEMO", player_count: 7, starter_count: 7, bench_count: 0, bench_coverage: "deferred",
    injured_player_count: 0, injured_coverage: "deferred",
  });
  const coverage = demoCoverage();
  assert.deepEqual(coverage.tactic_statuses, ["applied", "draft"]);
  assert.equal(coverage.lineup_slots, 14);
  assert.equal(coverage.starters, 14);
  assert.equal(coverage.bench, 0);
  const adminDetail = await parsedTacticsDetail(true);
  assertBoardReadyTactic(adminDetail, "attacking", 0);
  const memberDetail = await parsedTacticsDetail(false);
  assertBoardReadyTactic(memberDetail, "balanced", 0);
  psql(["-f", cleanupPath]);
  psql(["-c", `update public.memberships set status = 'active' where team_id = '${demoTeamId}'`]);
});

test("seed supports one active membership with parser-valid incomplete drafts and truthful deferred coverage", async () => {
  psql(["-c", "update public.memberships set status = 'inactive' where team_id = '20000000-0000-4000-8000-000000000001' and user_id <> '10000000-0000-4000-8000-000000000001'"]);
  const seeded = psql(["-f", seedPath]);
  const resultLine = seeded.stdout.split(/\r?\n/u).map((line) => line.trim()).find((line) => line.startsWith("{"));
  assert.ok(resultLine, `seed returned no player-count result:\n${seeded.stdout}`);
  assert.deepEqual(JSON.parse(resultLine), {
    marker: "PRO7-DEMO", player_count: 1, starter_count: 1, bench_count: 0, bench_coverage: "deferred",
    injured_player_count: 0, injured_coverage: "deferred",
  });
  const coverage = demoCoverage();
  assert.equal(coverage.attendance, 3);
  assert.deepEqual(coverage.rsvp_statuses, ["available", "pending", "unavailable"]);
  assert.equal(coverage.tactics, 2);
  assert.deepEqual(coverage.tactic_statuses, ["draft", "draft"]);
  assert.equal(coverage.lineup_slots, 2);
  assert.equal(coverage.starters, 2);
  assert.equal(coverage.bench, 0);
  const adminDetail = await parsedTacticsDetail(true);
  assert.equal(adminDetail.ok, true, "admin getTacticsDetail rejected sparse demo drafts");
  assert.equal(adminDetail.ok && adminDetail.detail.tactics.length, 2);
  const memberDetail = await parsedTacticsDetail(false);
  assert.equal(memberDetail.ok, true, "member getTacticsDetail rejected sparse demo data");
  assert.equal(memberDetail.ok && memberDetail.detail.tactics.length, 0, "sparse demo must not expose an invalid applied tactic");
  assert.deepEqual(coverage.due_statuses, ["paid", "pending", "waived"]);
  psql(["-f", cleanupPath]);
  psql(["-c", "update public.memberships set status = 'active' where team_id = '20000000-0000-4000-8000-000000000001'"]);
});

test("cleanup preserves a replaced deterministic due without an exact per-row marker", () => {
  psql(["-f", seedPath]);
  psql(["-c", String.raw`
    delete from public.member_dues where id = '70000000-0000-4000-8000-000000000502';
    insert into public.member_dues (
      id, team_id, user_id, period_start, amount_vnd, due_date, status, created_by_user_id
    ) values (
      '70000000-0000-4000-8000-000000000502', '${demoTeamId}', '${demoOwnerId}',
      date '2025-01-01', 777000, date '2025-01-15', 'pending', '${demoOwnerId}'
    );
  `]);
  const replacement = query("select to_jsonb(row) from public.member_dues as row where id = '70000000-0000-4000-8000-000000000502'");
  const reseeded = psql(["-f", seedPath], { allowFailure: true });
  assert.notEqual(reseeded.status, 0);
  assert.match(reseeded.stderr, /deterministic identifier collides with an unmarked row/iu);
  assert.equal(query("select to_jsonb(row) from public.member_dues as row where id = '70000000-0000-4000-8000-000000000502'"), replacement);
  psql(["-f", cleanupPath]);
  assert.equal(query("select to_jsonb(row) from public.member_dues as row where id = '70000000-0000-4000-8000-000000000502'"), replacement);
  assert.equal(query(`select count(*) from private.audit_events where request_id = '${demoDueMarkerRequestId}'`), "0");
  psql(["-f", cleanupPath]);
  assert.equal(query("select to_jsonb(row) from public.member_dues as row where id = '70000000-0000-4000-8000-000000000502'"), replacement);
  psql(["-c", "delete from public.member_dues where id = '70000000-0000-4000-8000-000000000502' and amount_vnd = 777000"]);
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
