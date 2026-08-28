import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../supabase/migrations/20260828132345_harden_web_push_scheduler.sql",
  import.meta.url,
);

async function migration() {
  return (await readFile(migrationUrl, "utf8"))
    .replaceAll(/--.*$/gmu, "")
    .replaceAll(/\s+/gu, " ")
    .replaceAll(/\(\s+/gu, "(")
    .replaceAll(/\s+\)/gu, ")")
    .trim()
    .toLowerCase();
}

test("private Web Push queues enable defense-in-depth RLS without client policies", async () => {
  const sql = await migration();
  assert.match(sql, /alter table private\.push_outbox enable row level security/u);
  assert.match(sql, /alter table private\.push_deliveries enable row level security/u);
  assert.doesNotMatch(sql, /create policy [^;]+ on private\.push_(?:outbox|deliveries)/u);
});

test("the minute worker is scheduled through the exact pg_cron overload", async () => {
  const sql = await migration();
  assert.match(sql, /to_regprocedure\('cron\.schedule\(text,text,text\)'\)/u);
  assert.match(sql, /to_regclass\('cron\.job'\)/u);
  assert.match(
    sql,
    /execute 'select not exists \(select 1 from cron\.job where jobname = \$1\)' into v_should_schedule using 'pro7-web-push-minute'/u,
  );
  assert.match(
    sql,
    /execute 'select cron\.schedule\(\$1, \$2, \$3\)' using 'pro7-web-push-minute', '\* \* \* \* \*', 'select private\.run_push_minute\(\);'/u,
  );
});
