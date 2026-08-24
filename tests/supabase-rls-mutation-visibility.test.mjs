import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../supabase/migrations/20260824183536_rls_mutation_visibility.sql",
  import.meta.url,
);

function normalizeSql(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n\r]*/g, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")")
    .trim();
}

function extractPolicy(sql, name) {
  const start = sql.indexOf(`create policy ${name} `);
  assert.notEqual(start, -1, `missing policy ${name}`);
  const end = sql.indexOf(";", start);
  assert.notEqual(end, -1, `policy ${name} has no terminating semicolon`);
  return sql.slice(start, end + 1);
}

test("the additive RLS migration makes mutation permissions select their target rows", async () => {
  const sql = normalizeSql(await readFile(migrationUrl, "utf8"));

  const expectedPolicies = {
    teams_select_authorized:
      /on public\.teams for select to authenticated using \(private\.has_team_permission\(id, 'team\.read'\) or private\.has_team_permission\(id, 'team\.update'\) or private\.has_team_permission\(id, 'team\.delete'\)\);/,
    memberships_select_authorized:
      /on public\.memberships for select to authenticated using \(user_id = \(select auth\.uid\(\)\) or private\.has_team_permission\(team_id, 'members\.read'\) or private\.has_team_permission\(team_id, 'members\.manage'\)\);/,
    roles_select_authorized:
      /on public\.roles for select to authenticated using \(private\.has_team_permission\(team_id, 'roles\.read'\) or private\.has_team_permission\(team_id, 'roles\.manage'\)\);/,
    team_settings_select_authorized:
      /on public\.team_settings for select to authenticated using \(private\.has_team_permission\(team_id, 'settings\.read'\) or private\.has_team_permission\(team_id, 'settings\.update'\)\);/,
  };

  for (const [name, contract] of Object.entries(expectedPolicies)) {
    assert.match(
      sql,
      new RegExp(`drop policy if exists ${name} on public\\.[a-z_]+;`),
      `${name} must replace the already-applied policy`,
    );
    assert.match(extractPolicy(sql, name), contract, `${name} has the wrong visibility`);
  }

  assert.deepEqual(
    [...sql.matchAll(/create policy ([a-z_]+)/g)].map((match) => match[1]).sort(),
    Object.keys(expectedPolicies).sort(),
    "the additive migration must replace only the four affected SELECT policies",
  );
  assert.doesNotMatch(sql, /public\.invitations/, "invitation visibility is not part of this fix");
  assert.doesNotMatch(
    sql,
    /(?:^|;)\s*(?:grant|revoke|insert\s+into|update\s+public\.|delete\s+from|create(?:\s+or\s+replace)?\s+function)\b|\bsecurity definer\b/,
    "the fix must not expand grants, mutate data, or add privileged code",
  );
});
