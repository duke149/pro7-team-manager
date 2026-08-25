import assert from "node:assert/strict";
import test from "node:test";

test("Edge runtime construction uses the pinned automatically injected key names", async () => {
  const edge = await import("../supabase/functions/change-temporary-password/index.ts");
  assert.equal(
    typeof edge.createChangeTemporaryPasswordRuntimeDependencies,
    "function",
  );

  const reads = [];
  const clients = [];
  const values = new Map([
    ["SUPABASE_URL", "https://local.supabase.invalid"],
    ["SUPABASE_ANON_KEY", "legacy-anon-key"],
    ["SUPABASE_SERVICE_ROLE_KEY", "legacy-service-role-key"],
    ["SUPABASE_PUBLISHABLE_KEY", "must-not-be-read"],
    ["ALLOWED_ORIGINS", "https://pro7.example, https://admin.pro7.example"],
  ]);
  const dependencies = edge.createChangeTemporaryPasswordRuntimeDependencies({
    getEnvironment(name) {
      reads.push(name);
      return values.get(name);
    },
    createSupabaseClient(url, key, options) {
      clients.push({ url, key, options });
      return {
        auth: {
          getUser: async () => ({ data: { user: null }, error: null }),
          signInWithPassword: async () => ({ data: { session: null, user: null }, error: null }),
          admin: {
            updateUserById: async () => ({ data: null, error: null }),
          },
        },
        from() {
          throw new Error("profile update is outside this construction test");
        },
      };
    },
  });

  dependencies.createJwtClient("verified-token");
  dependencies.createPasswordClient();
  dependencies.createServiceClient();

  assert.deepEqual(reads, [
    "SUPABASE_URL",
    "SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "ALLOWED_ORIGINS",
  ]);
  assert.deepEqual(
    clients.map(({ url, key }) => ({ url, key })),
    [
      { url: "https://local.supabase.invalid", key: "legacy-anon-key" },
      { url: "https://local.supabase.invalid", key: "legacy-anon-key" },
      { url: "https://local.supabase.invalid", key: "legacy-service-role-key" },
    ],
  );
  assert.deepEqual(dependencies.allowedOrigins, [
    "https://pro7.example",
    "https://admin.pro7.example",
  ]);
});
