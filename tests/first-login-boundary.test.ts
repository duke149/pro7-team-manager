import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";

import { createServer, type ViteDevServer } from "vite";

type ProductUserDependencies = {
  supabase: unknown;
  redirect(url: string): never;
};
type AuthModule = {
  getProductUser(
    next: string,
    deps: ProductUserDependencies,
  ): Promise<unknown>;
  requireProductUser(
    next: string,
    deps: ProductUserDependencies,
  ): Promise<unknown>;
};

let vite: ViteDevServer;
let auth: AuthModule;

test.before(async () => {
  vite = await createServer({
    appType: "custom",
    configFile: false,
    resolve: {
      alias: {
        "next/headers": resolve("node_modules/vinext/dist/shims/headers.js"),
        "next/navigation": resolve("node_modules/vinext/dist/shims/navigation.js"),
      },
    },
    server: { middlewareMode: true },
  });
  const loaded = await vite.ssrLoadModule("/lib/supabase/auth.ts").catch(() => null);
  assert.ok(loaded, "lib/supabase/auth.ts must expose the product-user boundary");
  auth = loaded as AuthModule;
});

test.after(async () => {
  await vite.close();
});

type ProfileResult = {
  data: { requires_password_change: boolean } | null;
  error: { message: string } | null;
};

function dependencies({
  user = { id: "user-1", email: "member@example.com" },
  profile = { data: { requires_password_change: false }, error: null },
}: {
  user?: { id: string; email: string } | null;
  profile?: ProfileResult;
} = {}): ProductUserDependencies & { redirects: string[] } {
  const redirects: string[] = [];
  return {
    redirects,
    supabase: {
      auth: {
        async getUser() {
          return { data: { user }, error: null };
        },
      },
      from(table: string) {
        assert.equal(table, "profiles");
        return {
          select(column: string) {
            assert.equal(column, "requires_password_change");
            return {
              eq(field: string, id: string) {
                assert.equal(field, "id");
                assert.equal(id, user?.id);
                return { maybeSingle: async () => profile };
              },
            };
          },
        };
      },
    } as never,
    redirect(url: string): never {
      redirects.push(url);
      throw new Error("redirected");
    },
  };
}

test("getProductUser returns null for an unauthenticated request", async () => {
  const deps = dependencies({ user: null });

  assert.equal(await auth.getProductUser("/teams/falcons/overview", deps), null);
});

test("requireProductUser redirects unauthenticated users to a safe login return path", async () => {
  const deps = dependencies({ user: null });

  await assert.rejects(
    auth.requireProductUser("https://attacker.example", deps),
    /redirected/,
  );
  assert.deepEqual(deps.redirects, ["/login?next=%2F"]);
});

test("requireProductUser redirects a flagged product user to password replacement", async () => {
  const deps = dependencies({
    profile: { data: { requires_password_change: true }, error: null },
  });

  await assert.rejects(
    auth.requireProductUser("/teams/falcons/overview", deps),
    /redirected/,
  );
  assert.deepEqual(deps.redirects, ["/account/change-password"]);
});

test("requireProductUser permits a flagged user on the password replacement route", async () => {
  const deps = dependencies({
    profile: { data: { requires_password_change: true }, error: null },
  });

  assert.deepEqual(await auth.requireProductUser("/account/change-password", deps), {
    user: { id: "user-1", email: "member@example.com" },
    requiresPasswordChange: true,
  });
  assert.deepEqual(deps.redirects, []);
});

test("requireProductUser does not loop on a normalized password replacement route", async () => {
  const deps = dependencies({
    profile: { data: { requires_password_change: true }, error: null },
  });

  assert.deepEqual(
    await auth.requireProductUser("/account/change-password/?notice=required", deps),
    {
      user: { id: "user-1", email: "member@example.com" },
      requiresPasswordChange: true,
    },
  );
  assert.deepEqual(deps.redirects, []);
});

test("getProductUser returns an unflagged verified user from the trusted profile column", async () => {
  const deps = dependencies();

  assert.deepEqual(await auth.getProductUser("/teams/falcons/overview", deps), {
    user: { id: "user-1", email: "member@example.com" },
    requiresPasswordChange: false,
  });
});

test("getProductUser fails closed when the trusted profile read is missing", async () => {
  const deps = dependencies({ profile: { data: null, error: null } });

  await assert.rejects(
    auth.getProductUser("/teams/falcons/overview", deps),
    /Không thể xác minh trạng thái tài khoản/,
  );
});
