import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const databaseUrl = process.env.PRO7_SQUAD_DATABASE_URL;
const preapplyPath = fileURLToPath(
  new URL("./supabase-squad-pre-apply.sql", import.meta.url),
);

function runPreapply(setupSql) {
  const result = spawnSync(
    "psql",
    [
      "-XAtq",
      "-v",
      "ON_ERROR_STOP=1",
      "-d",
      databaseUrl,
      "-c",
      "begin",
      ...(setupSql ? ["-c", setupSql] : []),
      "-f",
      preapplyPath,
      "-c",
      "rollback",
    ],
    { encoding: "utf8" },
  );

  assert.equal(
    result.status,
    0,
    `pre-apply query failed:\n${result.stderr || result.stdout}`,
  );

  const jsonLine = result.stdout
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .find((line) => line.startsWith("{"));

  assert.ok(jsonLine, `pre-apply query returned no JSON:\n${result.stdout}`);
  return JSON.parse(jsonLine);
}

test(
  "pre-apply gate blocks a same-type pre-existing Squad profile column",
  { skip: !databaseUrl && "set PRO7_SQUAD_DATABASE_URL to a core-only PG17 database" },
  () => {
    const result = runPreapply(
      "alter table public.profiles add column phone text",
    );

    assert.deepEqual(
      result.preexisting_profile_columns.map((column) => ({
        table_schema: column.table_schema,
        table_name: column.table_name,
        column_name: column.column_name,
        data_type: column.data_type,
        udt_name: column.udt_name,
      })),
      [
        {
          table_schema: "public",
          table_name: "profiles",
          column_name: "phone",
          data_type: "text",
          udt_name: "text",
        },
      ],
    );
  },
);

test(
  "pre-apply gate reports no Squad profile collision on the clean core schema",
  { skip: !databaseUrl && "set PRO7_SQUAD_DATABASE_URL to a core-only PG17 database" },
  () => {
    const result = runPreapply();

    assert.deepEqual(result.preexisting_profile_columns, []);
    assert.deepEqual(
      result.legacy_grants.map((grant) => ({
        table_name: grant.table_name,
        column_name: grant.column_name,
        privilege_type: grant.privilege_type,
      })),
      [
        {
          table_name: "memberships",
          column_name: null,
          privilege_type: "DELETE",
        },
        {
          table_name: "memberships",
          column_name: "role_id",
          privilege_type: "UPDATE",
        },
        {
          table_name: "profiles",
          column_name: "avatar_url",
          privilege_type: "UPDATE",
        },
      ],
    );
  },
);
