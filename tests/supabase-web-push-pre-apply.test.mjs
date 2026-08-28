import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

const validatorUrl = new URL("./supabase-web-push-pre-apply.sql", import.meta.url);
const validatorPath = fileURLToPath(validatorUrl);
const pendingDatabaseUrl = process.env.PRO7_WEB_PUSH_PENDING_DATABASE_URL;
const appliedDatabaseUrl = process.env.PRO7_WEB_PUSH_APPLIED_DATABASE_URL;

function stripNonExecutableText(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//gu, " ")
    .replace(/--[^\n\r]*/gu, " ")
    .replace(/'(?:''|[^'])*'/gu, "''")
    .replace(/\s+/gu, " ")
    .trim()
    .toLowerCase();
}

function runPreapply(databaseUrl) {
  const result = spawnSync("psql", ["-XAtq", "-v", "ON_ERROR_STOP=1", "-d", databaseUrl, "-f", validatorPath], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const jsonLine = result.stdout.split(/\r?\n/gu).map((line) => line.trim()).find((line) => line.startsWith("{"));
  assert.ok(jsonLine, `pre-apply query returned no JSON:\n${result.stdout}`);
  return JSON.parse(jsonLine);
}

test("web push pre-apply artifact is read-only and inventories every collision class without recipient data", async () => {
  const source = await readFile(validatorUrl, "utf8");
  const executable = stripNonExecutableText(source);
  const statements = executable.split(";").map((statement) => statement.trim()).filter(Boolean);
  assert.match(statements[0] ?? "", /^begin transaction read only$/u);
  assert.match(statements.at(-1) ?? "", /^(?:commit|rollback)$/u);
  for (const statement of statements.slice(1, -1)) assert.match(statement, /^(?:select|with)\b/u, statement);
  assert.doesNotMatch(executable, /\b(?:insert|update|delete|merge|alter|create|drop|truncate|grant|revoke|copy|call|do)\b/u);
  for (const evidence of [
    /migration_history/u,
    /missing_prerequisites/u,
    /prospective_objects/u,
    /notification_settings_anomalies/u,
    /extension_state/u,
    /vault_available/u,
    /supabase_migrations\.schema_migrations/u,
  ]) assert.match(executable, evidence);
  assert.doesNotMatch(executable, /\b(?:endpoint|p256dh|auth|email|user_id)\b/u);
});

test("pre-apply reports a clean pending Web Push state", { skip: !pendingDatabaseUrl && "set PRO7_WEB_PUSH_PENDING_DATABASE_URL" }, () => {
  const result = runPreapply(pendingDatabaseUrl);
  assert.equal(result.migration_history.is_applied, false);
  assert.deepEqual(result.missing_prerequisites, []);
  assert.deepEqual(result.prospective_objects, []);
  assert.equal(result.notification_settings_anomalies, 0);
});

test("pre-apply reports the controlled applied Web Push state", { skip: !appliedDatabaseUrl && "set PRO7_WEB_PUSH_APPLIED_DATABASE_URL" }, () => {
  const result = runPreapply(appliedDatabaseUrl);
  assert.equal(result.migration_history.is_applied, true);
  assert.equal(result.migration_history.recorded_name, "pro7_web_push_rsvp");
  assert.deepEqual(result.missing_prerequisites, []);
  assert.equal(result.prospective_objects.length, 7);
  assert.equal(result.notification_settings_anomalies, 0);
});
