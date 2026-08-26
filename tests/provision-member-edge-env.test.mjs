import assert from "node:assert/strict";
import test from "node:test";

test("provisioning runtime reads only injected keys and builds caller/service clients lazily", async () => {
  const edge = await import("../supabase/functions/provision-team-member/index.ts").catch(() => null);
  assert.ok(edge, "the local provision-team-member Edge Function must exist");
  assert.equal(typeof edge.createProvisionTeamMemberRuntimeDependencies, "function");

  const reads = [];
  const clients = [];
  const values = new Map([
    ["SUPABASE_URL", "https://local.supabase.invalid"],
    ["SUPABASE_ANON_KEY", "legacy-anon-key"],
    ["SUPABASE_SERVICE_ROLE_KEY", "legacy-service-role-key"],
    ["ALLOWED_ORIGINS", " http://localhost:3000,https://pro7.example,https://pro7.example/path,https://pro7.example "],
  ]);
  const dependencies = edge.createProvisionTeamMemberRuntimeDependencies({
    getEnvironment(name) {
      reads.push(name);
      return values.get(name);
    },
    createSupabaseClient(url, key, options) {
      clients.push({ url, key, options });
      return { auth: { getUser() {}, admin: {} }, rpc() {}, from() {} };
    },
  });

  assert.deepEqual(reads, [
    "SUPABASE_URL",
    "SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "ALLOWED_ORIGINS",
  ]);
  assert.deepEqual(dependencies.allowedOrigins, [
    "http://localhost:3000",
    "https://pro7.example",
  ]);
  assert.deepEqual(clients, []);

  dependencies.createCallerClient("verified-token");
  dependencies.createServiceClient();
  assert.deepEqual(
    clients.map(({ url, key }) => ({ url, key })),
    [
      { url: "https://local.supabase.invalid", key: "legacy-anon-key" },
      { url: "https://local.supabase.invalid", key: "legacy-service-role-key" },
    ],
  );
  assert.deepEqual(clients[0].options.global.headers, {
    Authorization: "Bearer verified-token",
  });
  assert.deepEqual(clients[0].options.auth, {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  });
  assert.deepEqual(clients[1].options.auth, clients[0].options.auth);
  assert.equal(clients[1].options.global, undefined);
});
