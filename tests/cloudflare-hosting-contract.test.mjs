import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  MAX_GZIP_BYTES,
  parseWranglerDryRun,
  scanServerBundle,
  validateWorkerConfig,
} from "../scripts/cloudflare-build-contract.mjs";

const validConfig = {
  name: "pro7-team-manager",
  main: "index.js",
  compatibility_date: "2026-08-27",
  compatibility_flags: ["nodejs_compat"],
  no_bundle: true,
  assets: { directory: "../client" },
  d1_databases: [],
  r2_buckets: [],
  kv_namespaces: [],
  durable_objects: { bindings: [] },
  queues: { producers: [], consumers: [] },
  services: [],
  hyperdrive: [],
};

test("accepts only the exact Workers Free generated configuration", () => {
  assert.deepEqual(validateWorkerConfig(validConfig), []);

  assert.match(
    validateWorkerConfig({ ...validConfig, name: "wrong" }).join("\n"),
    /worker name/i,
  );
  assert.match(
    validateWorkerConfig({ ...validConfig, d1_databases: [{ binding: "DB" }] }).join("\n"),
    /d1/i,
  );
  assert.match(
    validateWorkerConfig({ ...validConfig, routes: ["example.com/*"] }).join("\n"),
    /route/i,
  );
  assert.match(
    validateWorkerConfig({ ...validConfig, kv_namespaces: undefined }).join("\n"),
    /kv/i,
  );
  assert.match(
    validateWorkerConfig({ ...validConfig, ai: { binding: "AI" } }).join("\n"),
    /ai/i,
  );
});

test("parses Wrangler gzip output and enforces the 3 MiB Free limit", () => {
  assert.equal(
    parseWranglerDryRun("Total Upload: 1.0 MiB / gzip: 2.99 MiB").gzipBytes,
    3_135_242,
  );
  assert.equal(
    parseWranglerDryRun("Total Upload: 1.0 MiB / gzip: 3072 KiB").gzipBytes,
    MAX_GZIP_BYTES,
  );
  assert.throws(
    () => parseWranglerDryRun("Total Upload: 1.0 MiB / gzip: 3.01 MiB"),
    /3 MiB/i,
  );
  assert.throws(() => parseWranglerDryRun("Upload complete"), /not found/i);
});

test("bundle scanning rejects actual Supabase secret and service-role values", async () => {
  const root = await mkdtemp(join(tmpdir(), "pro7-cloudflare-secret-"));
  try {
    await mkdir(join(root, "nested"));
    await writeFile(
      join(root, "nested", "worker.js"),
      `export const value = "sb_secret_${"a".repeat(32)}";`,
    );
    const errors = await scanServerBundle(root);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /nested\/worker\.js contains a secret key/i);
    assert.doesNotMatch(errors[0], /sb_secret_/i);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("bundle scanning decodes and rejects a service-role JWT", async () => {
  const root = await mkdtemp(join(tmpdir(), "pro7-cloudflare-jwt-"));
  try {
    const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(JSON.stringify({ role: "service_role" })).toString("base64url");
    await writeFile(join(root, "worker.mjs"), `export default "${header}.${payload}.signature";`);

    const errors = await scanServerBundle(root);
    assert.deepEqual(errors, ["worker.mjs contains a service-role JWT"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("bundle scanning accepts the public Supabase URL and publishable-key shape", async () => {
  const root = await mkdtemp(join(tmpdir(), "pro7-cloudflare-public-"));
  try {
    await writeFile(
      join(root, "worker.json"),
      JSON.stringify({
        url: "https://pficsujapinkmqsyvcfw.supabase.co",
        key: `sb_publishable_${"p".repeat(32)}`,
        validationLiteral: "sb_secret_[A-Za-z0-9_-]{20,}",
      }),
    );
    assert.deepEqual(await scanServerBundle(root), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("production deploy accepts only Supabase public values and the public VAPID key", async () => {
  const deployScript = await readFile(new URL("../scripts/deploy-cloudflare-worker.sh", import.meta.url), "utf8");
  const envExample = await readFile(new URL("../.env.example", import.meta.url), "utf8");
  assert.match(deployScript, /NEXT_PUBLIC_PRO7_VAPID_PUBLIC_KEY/u);
  assert.match(deployScript, /\^\[A-Za-z0-9_\\-\]\{80,120\}\$/u);
  assert.match(deployScript, /exactly the three approved public variable names/u);
  assert.doesNotMatch(deployScript, /PRO7_VAPID_PRIVATE_KEY/u);
  assert.match(envExample, /^NEXT_PUBLIC_PRO7_VAPID_PUBLIC_KEY=/mu);
  assert.doesNotMatch(envExample, /PRO7_VAPID_PRIVATE_KEY/u);
});
