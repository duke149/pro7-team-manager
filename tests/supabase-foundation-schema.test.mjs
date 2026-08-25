import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const migrationsDirectory = fileURLToPath(
  new URL("../supabase/migrations/", import.meta.url),
);

const newCodes = [
  "players.read", "players.manage",
  "matches.read", "matches.manage", "matches.respond",
  "tactics.read", "tactics.manage",
  "news.read", "news.manage",
  "finance.read", "finance.manage",
];
const memberCodes = [
  "team.read", "members.read", "roles.read", "players.read",
  "matches.read", "matches.respond", "tactics.read", "news.read",
];

function normalizeSql(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n\r]*/g, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

async function readFoundationMigration() {
  const matchingFiles = (await readdir(migrationsDirectory))
    .filter((file) => file.endsWith("_pro7_foundation_permissions.sql"));

  assert.equal(
    matchingFiles.length,
    1,
    "expected exactly one generated PRO7 foundation-permissions migration",
  );

  return readFile(path.join(migrationsDirectory, matchingFiles[0]), "utf8");
}

async function readTestFile(file) {
  return readFile(new URL(`./${file}`, import.meta.url), "utf8");
}

test("foundation migration defines first-login and membership lifecycle columns", async () => {
  const sql = normalizeSql(await readFoundationMigration());

  assert.match(
    sql,
    /alter table public\.profiles add column if not exists requires_password_change boolean not null default false;/,
  );
  assert.match(
    sql,
    /alter table public\.memberships add column if not exists status text not null default 'active', add column if not exists updated_at timestamptz not null default now\(\);/,
  );
  assert.match(
    sql,
    /add constraint memberships_status_check check \(status in \('active', 'inactive'\)\);/,
  );
  assert.match(
    sql,
    /create index if not exists memberships_team_id_status_idx on public\.memberships \(team_id, status\);/,
  );
  assert.match(
    sql,
    /create trigger trg_memberships_set_updated_at before update on public\.memberships for each row execute function private\.set_updated_at\(\);/,
  );
  assert.doesNotMatch(sql, /grant update[^;]*requires_password_change/);
  assert.doesNotMatch(sql, /grant update[^;]*\bstatus\b/);
});

test("foundation migration seeds the eleven permission codes conflict-safely", async () => {
  const sql = normalizeSql(await readFoundationMigration());

  for (const code of newCodes) {
    assert.match(sql, new RegExp(`\\('${code.replace(".", "\\.")}',`));
  }
  assert.match(
    sql,
    /on conflict \(code\) do update set description = excluded\.description;/,
  );
});

test("foundation migration remaps only system roles to their exact permission sets", async () => {
  const sql = normalizeSql(await readFoundationMigration());
  const memberArray = memberCodes.map((code) => `'${code}'`).join(", ");

  assert.match(
    sql,
    /delete from public\.role_permissions as rp using public\.roles as r where rp\.role_id = r\.id and r\.is_system and r\.slug = any \(array\['owner', 'admin', 'member'\]::text\[\]\);/,
  );
  assert.match(sql, /when 'owner' then true/);
  assert.match(sql, /when 'admin' then p\.code <> 'team\.delete'/);
  assert.match(
    sql,
    new RegExp(`when 'member' then p\\.code = any \\(array\\[\\s*${memberArray.replaceAll(".", "\\.")}\\s*\\]::text\\[\\]\\)`),
  );
  assert.doesNotMatch(
    sql,
    /when 'member' then[\s\S]*settings\.read/,
    "Member must not retain settings.read",
  );
  assert.match(sql, /create or replace function private\.bootstrap_team\(\)/);
});

test("foundation migration excludes inactive memberships from permission context", async () => {
  const sql = normalizeSql(await readFoundationMigration());

  assert.match(sql, /create or replace function private\.is_team_member\(p_team_id uuid\)[\s\S]*m\.status = 'active'/);
  assert.match(sql, /create or replace function private\.has_team_permission\([\s\S]*m\.status = 'active'/);
  assert.match(sql, /create or replace function private\.can_view_profile\(p_profile_user_id uuid\)[\s\S]*subject\.status = 'active'/);
  assert.match(sql, /create or replace function private\.can_view_profile\(p_profile_user_id uuid\)[\s\S]*viewer\.status = 'active'/);
});

test("foundation live harness preserves pre-migration fixtures through the additive migration", async () => {
  const testFiles = await readdir(fileURLToPath(new URL("./", import.meta.url)));
  for (const file of [
    "supabase-foundation-live-harness.sql",
    "supabase-foundation-pre-migration-fixtures.sql",
    "supabase-foundation-fixture-cleanup.sql",
  ]) {
    assert.ok(testFiles.includes(file), `missing required live-harness file: ${file}`);
  }

  const [harness, preMigrationFixtures, verifier, cleanup] = await Promise.all([
    readTestFile("supabase-foundation-live-harness.sql"),
    readTestFile("supabase-foundation-pre-migration-fixtures.sql"),
    readTestFile("supabase-foundation-live-verification.sql"),
    readTestFile("supabase-foundation-fixture-cleanup.sql"),
  ]);

  const fixtureIndex = harness.indexOf("supabase-foundation-pre-migration-fixtures.sql");
  const migrationIndex = harness.indexOf("20260825013307_pro7_foundation_permissions.sql");
  const verifierIndex = harness.indexOf("supabase-foundation-live-verification.sql");
  const cleanupIndex = harness.indexOf("supabase-foundation-fixture-cleanup.sql");

  assert.ok(fixtureIndex >= 0, "harness must create fixtures before foundation migration");
  assert.ok(migrationIndex > fixtureIndex, "harness must apply foundation after pre-migration fixtures");
  assert.ok(verifierIndex > migrationIndex, "harness must verify after foundation migration");
  assert.ok(cleanupIndex > verifierIndex, "harness must clean persisted pre-migration fixtures after verification");
  assert.match(preMigrationFixtures, /'settings\.update'/);
  assert.doesNotMatch(
    preMigrationFixtures,
    /insert into public\.memberships\s*\([^)]*\b(?:status|updated_at)\b/,
  );
  assert.match(verifier, /updated_at > v_old_updated_at/);
  assert.match(verifier, /rollback;/);
  assert.match(cleanup, /fixture_auth_users/);
  assert.match(cleanup, /fixture_permissions/);
});
