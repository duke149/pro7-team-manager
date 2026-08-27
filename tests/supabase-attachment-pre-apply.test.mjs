import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

const validatorUrl = new URL("./supabase-attachment-pre-apply.sql", import.meta.url);
const validatorPath = fileURLToPath(validatorUrl);
const databaseUrl = process.env.PRO7_ATTACHMENT_DATABASE_URL;

function stripNonExecutableText(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//gu, " ")
    .replace(/--[^\n\r]*/gu, " ")
    .replace(/'(?:''|[^'])*'/gu, "''")
    .replace(/\s+/gu, " ")
    .trim()
    .toLowerCase();
}

test("attachment pre-apply checkpoint is read-only and proves the exact pending function boundary", async () => {
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
    /supabase_migrations\.schema_migrations/u,
    /service_role/u,
    /display_name/u,
    /auth_user_profile_gaps/u,
  ]) {
    assert.match(executable, evidence);
  }
  for (const literal of [
    "20260825091904",
    "20260826035128",
    "preserve_existing_profile_attachment",
    "public.attach_team_member",
    "requires_password_change",
  ]) {
    assert.match(source.toLowerCase(), new RegExp(literal, "u"));
  }
});

test(
  "attachment pre-apply checkpoint parses and executes on PostgreSQL 17",
  { skip: !databaseUrl && "set PRO7_ATTACHMENT_DATABASE_URL to an applied-Squad PG17 database" },
  () => {
    const result = spawnSync(
      "psql",
      [
        "-XAtq",
        "-v",
        "ON_ERROR_STOP=1",
        "-d",
        databaseUrl,
        "-c",
        "select 'server_version_num|' || current_setting('server_version_num')",
        "-f",
        validatorPath,
      ],
      { encoding: "utf8" },
    );

    assert.equal(
      result.status,
      0,
      `attachment pre-apply query failed:\n${result.stderr || result.stdout}`,
    );
    const version = result.stdout.match(/^server_version_num\|(\d+)$/mu)?.[1];
    assert.ok(version, `missing PostgreSQL version evidence:\n${result.stdout}`);
    assert.ok(Number(version) >= 170000 && Number(version) < 180000, version);
    assert.match(
      result.stdout,
      /^migration_history\|20260825091904\|pro7_squad_profiles\|[a-f0-9]{64}\|t\|t\|pro7_squad_profiles\|[a-f0-9]{32}\|t$/mu,
    );
    assert.match(
      result.stdout,
      /^migration_history\|20260826035128\|preserve_existing_profile_attachment\|[a-f0-9]{64}\|f\|f\|\|\|t$/mu,
    );
    assert.match(
      result.stdout,
      /^attachment_function\|t\|postgres\|t\|.*\|t\|f\|f\|t\|t\|f\|f$/mu,
    );
    assert.match(result.stdout, /^auth_user_profile_gaps\|0$/mu);
  },
);
