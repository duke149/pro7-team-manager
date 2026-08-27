import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const migrationsDirectory = fileURLToPath(
  new URL("../supabase/migrations/", import.meta.url),
);

function normalizeSql(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n\r]*/g, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

async function readSquadMigration() {
  const matchingFiles = (await readdir(migrationsDirectory))
    .filter((file) => file.endsWith("_pro7_squad_profiles.sql"));
  assert.equal(matchingFiles.length, 1);
  return normalizeSql(
    await readFile(path.join(migrationsDirectory, matchingFiles[0]), "utf8"),
  );
}

test("avatar bucket remains private and enforces the reviewed file envelope", async () => {
  const sql = await readSquadMigration();

  assert.match(
    sql,
    /insert into storage\.buckets \( id, name, public, file_size_limit, allowed_mime_types \) values \( 'player-avatars', 'player-avatars', false, 3145728, array\['image\/jpeg', 'image\/png', 'image\/webp'\]::text\[\] \) on conflict \(id\) do update set name = excluded\.name, public = false, file_size_limit = excluded\.file_size_limit, allowed_mime_types = excluded\.allowed_mime_types;/,
  );
});

test("avatar object policies expose every upsert operation only under the caller prefix", async () => {
  const sql = await readSquadMigration();
  const ownerPredicate = "storage.foldername(name))[1] = (select auth.uid())::text";

  assert.match(
    sql,
    /create policy player_avatars_select_own on storage\.objects for select to authenticated using \( bucket_id = 'player-avatars' and \(storage\.foldername\(name\)\)\[1\] = \(select auth\.uid\(\)\)::text \);/,
  );
  assert.match(
    sql,
    /create policy player_avatars_insert_own on storage\.objects for insert to authenticated with check \( bucket_id = 'player-avatars' and \(storage\.foldername\(name\)\)\[1\] = \(select auth\.uid\(\)\)::text \);/,
  );
  assert.match(
    sql,
    /create policy player_avatars_update_own on storage\.objects for update to authenticated using \( bucket_id = 'player-avatars' and \(storage\.foldername\(name\)\)\[1\] = \(select auth\.uid\(\)\)::text \) with check \( bucket_id = 'player-avatars' and \(storage\.foldername\(name\)\)\[1\] = \(select auth\.uid\(\)\)::text \);/,
  );
  assert.match(
    sql,
    /create policy player_avatars_delete_own on storage\.objects for delete to authenticated using \( bucket_id = 'player-avatars' and \(storage\.foldername\(name\)\)\[1\] = \(select auth\.uid\(\)\)::text \);/,
  );
  assert.equal(
    sql.split(ownerPredicate).length - 1,
    5,
    "SELECT, INSERT, UPDATE USING/CHECK, and DELETE must all bind to auth.uid()",
  );
  assert.doesNotMatch(sql, /create policy player_avatars_[^;]*using \(bucket_id = 'player-avatars'\);/);
});
