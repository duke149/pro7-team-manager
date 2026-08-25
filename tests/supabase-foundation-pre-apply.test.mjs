import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const validatorUrl = new URL("./supabase-foundation-pre-apply.sql", import.meta.url);

function stripNonExecutableText(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//gu, " ")
    .replace(/--[^\n\r]*/gu, " ")
    .replace(/'(?:''|[^'])*'/gu, "''")
    .replace(/\s+/gu, " ")
    .trim()
    .toLowerCase();
}

test("pre-apply foundation validator is read-only and covers populated-project conflicts", async () => {
  const source = await readFile(validatorUrl, "utf8");
  const executable = stripNonExecutableText(source);
  const statements = executable.split(";").map((statement) => statement.trim()).filter(Boolean);

  assert.match(statements[0] ?? "", /^begin transaction read only$/u);
  assert.match(statements.at(-1) ?? "", /^(?:commit|rollback)$/u);
  for (const statement of statements.slice(1, -1)) {
    assert.match(statement, /^(?:select|with)\b/u, statement);
  }
  assert.doesNotMatch(
    executable,
    /\b(?:insert|update|delete|merge|alter|create|drop|truncate|grant|revoke|copy|call|do)\b/u,
  );

  for (const evidence of [
    /team_slug_conflicts/u,
    /auth_user_profile_gaps/u,
    /permission_catalog/u,
    /system_role_invariants/u,
    /custom_role_invariants/u,
    /foundation_column_conflicts/u,
    /migration_history/u,
    /supabase_migrations\.schema_migrations/u,
    /pg_catalog\.md5/u,
  ]) {
    assert.match(executable, evidence);
  }
  assert.doesNotMatch(
    executable,
    /(?:profiles\s+as\s+\w+\s+where[^;]*requires_password_change|memberships\s+as\s+\w+\s+where[^;]*\b(?:status|updated_at)\b)/u,
    "the pre-apply validator must inspect prospective columns through catalogs only",
  );
});
