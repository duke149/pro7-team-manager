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

test("foundation migration narrows team slugs to product route-safe values", async () => {
  const sql = normalizeSql(await readFoundationMigration());

  assert.match(
    sql,
    /alter table public\.teams drop constraint if exists teams_slug_check;/,
  );
  assert.match(
    sql,
    /alter table public\.teams add constraint teams_slug_check check \( slug = lower\(slug\) and char_length\(slug\) between 1 and 48 and slug ~ '\^\[a-z0-9\]\+\(\?:-\[a-z0-9\]\+\)\*\$' and slug <> all \(array\['setup', 'account', 'api', 'login', 'auth'\]::text\[\]\) \);/,
  );
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

test("foundation migration keeps base policies restrictive and exposes a hardened context RPC", async () => {
  const sql = normalizeSql(await readFoundationMigration());

  assert.match(
    sql,
    /create policy teams_select_authorized on public\.teams for select to authenticated using \( private\.has_team_permission\(id, 'team\.read'\) or private\.has_team_permission\(id, 'team\.update'\) or private\.has_team_permission\(id, 'team\.delete'\) \);/,
  );
  assert.match(
    sql,
    /create policy roles_select_authorized on public\.roles for select to authenticated using \( private\.has_team_permission\(team_id, 'roles\.read'\) or private\.has_team_permission\(team_id, 'roles\.manage'\) \);/,
  );
  assert.match(
    sql,
    /create policy role_permissions_select_authorized on public\.role_permissions for select to authenticated using \( private\.can_view_role\(role_id\) \);/,
  );
  assert.doesNotMatch(sql, /grant usage on schema private to authenticated/);
  assert.match(
    sql,
    /create or replace function public\.get_current_team_access_contexts\(\) returns table \( team_id uuid, team_name text, team_slug text, role_id uuid, role_slug text, role_name text, permission_codes text\[\] \) language sql stable security definer set search_path = ''/,
  );
  assert.match(
    sql,
    /from public\.memberships as m join public\.teams as t on t\.id = m\.team_id join public\.roles as r on r\.id = m\.role_id and r\.team_id = m\.team_id left join public\.role_permissions as rp on rp\.role_id = r\.id where private\.is_trusted_product_user\(\) and m\.user_id = \(select auth\.uid\(\)\) and m\.status = 'active'/,
  );
  assert.match(sql, /pg_catalog\.array_agg\(rp\.permission_code order by rp\.permission_code\)/);
  assert.match(sql, /alter function public\.get_current_team_access_contexts\(\) owner to postgres;/);
  assert.match(sql, /revoke execute on function public\.get_current_team_access_contexts\(\) from public, anon, authenticated, service_role;/);
  assert.match(sql, /grant execute on function public\.get_current_team_access_contexts\(\) to authenticated;/);
});

test("foundation migration enforces the first-login boundary in PostgreSQL", async () => {
  const sql = normalizeSql(await readFoundationMigration());

  assert.match(
    sql,
    /create or replace function private\.is_trusted_product_user\(\) returns boolean language sql stable security definer set search_path = '' as \$function\$ select \(select auth\.uid\(\)\) is not null and exists \( select 1 from public\.profiles as p where p\.id = \(select auth\.uid\(\)\) and p\.requires_password_change = false \); \$function\$;/,
  );
  for (const helper of ["is_team_member", "has_team_permission", "can_view_profile"]) {
    assert.match(
      sql,
      new RegExp(
        `create or replace function private\\.${helper}[\\s\\S]*?private\\.is_trusted_product_user\\(\\)[\\s\\S]*?\\$function\\$;`,
      ),
      `${helper} must compose the trusted product-user boundary`,
    );
  }
  assert.match(
    sql,
    /create policy memberships_select_authorized on public\.memberships for select to authenticated using \( \( user_id = \(select auth\.uid\(\)\) and private\.is_trusted_product_user\(\) \) or private\.has_team_permission\(team_id, 'members\.read'\) or private\.has_team_permission\(team_id, 'members\.manage'\) \);/,
  );
  assert.match(
    sql,
    /create or replace function public\.get_current_team_access_contexts\(\)[\s\S]*?where private\.is_trusted_product_user\(\)[\s\S]*?\$function\$;/,
  );
  assert.match(
    sql,
    /create or replace function public\.accept_team_invitation\(token text\)[\s\S]*?private\.is_trusted_product_user\(\)[\s\S]*?\$function\$;/,
  );
  assert.match(sql, /drop policy if exists teams_insert_own on public\.teams;/);
  assert.doesNotMatch(sql, /create policy teams_insert_own/);
  assert.match(sql, /revoke insert on table public\.teams from authenticated;/);
});

test("foundation migration exposes only the hardened atomic team-creation RPC", async () => {
  const sql = normalizeSql(await readFoundationMigration());

  assert.match(
    sql,
    /create or replace function public\.create_team\(p_name text, p_slug text\) returns table \( id uuid, name text, slug text \) language plpgsql security definer set search_path = ''/,
  );
  assert.match(
    sql,
    /if v_user_id is null or not private\.is_trusted_product_user\(\) then raise exception/,
  );
  assert.match(
    sql,
    /insert into public\.teams \(name, slug, owner_user_id\) values \(p_name, p_slug, v_user_id\) returning teams\.id, teams\.name, teams\.slug/,
  );
  assert.match(
    sql,
    /when unique_violation then return query select t\.id, t\.name, t\.slug from public\.teams as t where t\.slug = p_slug and t\.name = p_name and t\.owner_user_id = v_user_id;/,
  );
  const functionSql = sql.match(
    /create or replace function public\.create_team\(p_name text, p_slug text\)[\s\S]*?\$function\$;/,
  )?.[0];
  assert.ok(functionSql, "missing create_team function body");
  assert.doesNotMatch(functionSql, /\bexecute\b/, "atomic RPC must not use dynamic SQL");
  assert.match(sql, /alter function public\.create_team\(text, text\) owner to postgres;/);
  assert.match(
    sql,
    /revoke execute on function public\.create_team\(text, text\) from public, anon, authenticated, service_role;/,
  );
  assert.match(
    sql,
    /grant execute on function public\.create_team\(text, text\) to authenticated;/,
  );
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
