import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { createServer, type ViteDevServer } from "vite";

import type { PermissionCode } from "../lib/teams/permissions";

type ProductUser = {
  user: { id: string; email?: string };
  requiresPasswordChange: boolean;
};

type Team = { id: string; name: string; slug: string };
type TeamContext = {
  team: Team;
  userId: string;
  membership: { roleId: string; roleSlug: string; roleName: string };
  permissions: readonly PermissionCode[];
};

type TeamRouteModule = {
  renderOverviewPage: (args: RouteArgs) => Promise<unknown>;
  renderSquadPage: (args: RouteArgs) => Promise<unknown>;
  renderMatchesPage: (args: RouteArgs) => Promise<unknown>;
  renderFundsPage: (args: RouteArgs) => Promise<unknown>;
  renderSettingsPage: (args: RouteArgs) => Promise<unknown>;
};

type RouteArgs = {
  params: Promise<{ slug: string }>;
  requireTeamPermission: (slug: string, permission: PermissionCode) => Promise<TeamContext | null>;
  denied: () => unknown;
};

type ApiModule = {
  createTeamHandler(request: Request, dependencies: ApiDependencies): Promise<Response>;
};

type ApiDependencies = {
  getProductUser: (next: string) => Promise<ProductUser | null>;
  supabase: {
    from(table: "teams"): unknown;
  };
};

type RootModule = {
  redirectFromRoot(dependencies: {
    requireProductUser: (next: string) => Promise<ProductUser>;
    listUserTeams: (userId: string) => Promise<Team[]>;
    redirect: (url: string) => never;
  }): Promise<never>;
};

let vite: ViteDevServer;
let api: ApiModule;
let root: RootModule;
let routes: TeamRouteModule;

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

  const [apiModule, rootModule, overview, squad, matches, funds, settings] = await Promise.all([
    vite.ssrLoadModule("/app/api/teams/route.ts"),
    vite.ssrLoadModule("/app/page.tsx"),
    vite.ssrLoadModule("/app/teams/[slug]/overview/page.tsx"),
    vite.ssrLoadModule("/app/teams/[slug]/squad/page.tsx"),
    vite.ssrLoadModule("/app/teams/[slug]/matches/page.tsx"),
    vite.ssrLoadModule("/app/teams/[slug]/funds/page.tsx"),
    vite.ssrLoadModule("/app/teams/[slug]/admin/settings/page.tsx"),
  ]).catch(() => []);
  assert.ok(apiModule, "team API must expose an injected createTeamHandler");
  assert.ok(rootModule, "root must expose an injected redirect behavior");
  assert.ok(overview && squad && matches && funds && settings, "team route skeletons must exist");
  api = apiModule as ApiModule;
  root = rootModule as RootModule;
  routes = {
    renderOverviewPage: overview.renderOverviewPage,
    renderSquadPage: squad.renderSquadPage,
    renderMatchesPage: matches.renderMatchesPage,
    renderFundsPage: funds.renderFundsPage,
    renderSettingsPage: settings.renderSettingsPage,
  };
});

test.after(async () => {
  await vite.close();
});

function response<T>(data: T, error: { code?: string; message: string } | null = null) {
  return { data, error, count: null, status: error ? 500 : 200, statusText: error ? "Failure" : "OK" };
}

function request(body: unknown): Request {
  return new Request("https://pro7.example/api/teams", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function apiDependencies({
  productUser = { user: { id: "user-1", email: "owner@example.com" }, requiresPasswordChange: false },
  insertResult = response(null),
  selectResult = response({ id: "team-1", name: "Falcons", slug: "falcons" }),
}: {
  productUser?: ProductUser | null;
  insertResult?: ReturnType<typeof response>;
  selectResult?: ReturnType<typeof response>;
} = {}) {
  const calls: Array<{ method: string; value?: unknown }> = [];
  const insert = (value: unknown) => {
    calls.push({ method: "insert", value });
    return Promise.resolve(insertResult);
  };
  const select = (columns: string) => {
    calls.push({ method: "select", value: columns });
    return {
      eq(field: string, value: string) {
        calls.push({ method: "eq", value: { field, value } });
        return { maybeSingle: () => Promise.resolve(selectResult) };
      },
    };
  };

  return {
    calls,
    dependencies: {
      getProductUser: async () => productUser,
      supabase: {
        from(table: "teams") {
          assert.equal(table, "teams");
          return { insert, select };
        },
      },
    } as ApiDependencies,
  };
}

test("createTeamHandler rejects unauthenticated and password-change callers", async () => {
  const unauthenticated = apiDependencies({ productUser: null });
  assert.equal((await api.createTeamHandler(request({ name: "Falcons" }), unauthenticated.dependencies)).status, 401);
  assert.deepEqual(unauthenticated.calls, []);

  const passwordChange = apiDependencies({
    productUser: { user: { id: "user-1" }, requiresPasswordChange: true },
  });
  assert.equal((await api.createTeamHandler(request({ name: "Falcons" }), passwordChange.dependencies)).status, 403);
  assert.deepEqual(passwordChange.calls, []);
});

test("createTeamHandler permits only a bounded name and optional validated slug", async () => {
  for (const body of [
    { name: "", slug: "falcons" },
    { name: "Falcons", slug: "setup" },
    { name: "Falcons", owner_user_id: "attacker" },
  ]) {
    const fixture = apiDependencies();
    assert.equal((await api.createTeamHandler(request(body), fixture.dependencies)).status, 422);
    assert.deepEqual(fixture.calls, []);
  }
});

test("createTeamHandler maps a duplicate slug to a bounded conflict response", async () => {
  const fixture = apiDependencies({
    insertResult: response(null, { code: "23505", message: "duplicate key value exposes database details" }),
  });
  const responseValue = await api.createTeamHandler(request({ name: "Falcons" }), fixture.dependencies);

  assert.equal(responseValue.status, 409);
  assert.doesNotMatch(await responseValue.text(), /duplicate key|database details/u);
});

test("createTeamHandler keeps unknown insert failures generic", async () => {
  const fixture = apiDependencies({
    insertResult: response(null, { message: "connection secret and internal detail" }),
  });
  const responseValue = await api.createTeamHandler(request({ name: "Falcons" }), fixture.dependencies);

  assert.equal(responseValue.status, 500);
  assert.doesNotMatch(await responseValue.text(), /connection secret|internal detail/u);
});

test("createTeamHandler does a plain insert then independent bootstrap select", async () => {
  const fixture = apiDependencies();
  const responseValue = await api.createTeamHandler(
    request({ name: "Falcons", slug: "Falcons", role: "owner", created_at: "attacker" }),
    fixture.dependencies,
  );

  assert.equal(responseValue.status, 422, "untrusted ownership and timestamps must be rejected before writes");

  const success = apiDependencies();
  const successResponse = await api.createTeamHandler(request({ name: "Falcons", slug: "Falcons" }), success.dependencies);
  assert.equal(successResponse.status, 201);
  assert.deepEqual(await successResponse.json(), {
    team: { id: "team-1", name: "Falcons", slug: "falcons" },
  });
  assert.deepEqual(success.calls, [
    { method: "insert", value: { name: "Falcons", slug: "falcons" } },
    { method: "select", value: "id, name, slug" },
    { method: "eq", value: { field: "slug", value: "falcons" } },
  ]);
});

test("root redirects a verified user to setup without teams and first sorted team otherwise", async () => {
  const redirects: string[] = [];
  const redirect = (url: string): never => {
    redirects.push(url);
    throw new Error("redirected");
  };
  let receivedUserId = "";
  await assert.rejects(
    root.redirectFromRoot({
      requireProductUser: async () => ({ user: { id: "user-1" }, requiresPasswordChange: false }),
      listUserTeams: async (userId) => {
        receivedUserId = userId;
        return [];
      },
      redirect,
    }),
    /redirected/,
  );
  assert.equal(receivedUserId, "user-1");
  assert.deepEqual(redirects, ["/setup/team"]);

  await assert.rejects(
    root.redirectFromRoot({
      requireProductUser: async () => ({ user: { id: "user-1" }, requiresPasswordChange: false }),
      listUserTeams: async () => [
        { id: "team-2", name: "Zebra", slug: "zebra" },
        { id: "team-1", name: "Alpha", slug: "đội bóng" },
      ],
      redirect,
    }),
    /redirected/,
  );
  assert.deepEqual(redirects, ["/setup/team", "/teams/%C4%91%E1%BB%99i%20b%C3%B3ng/overview"]);
});

test("team route skeletons request the exact permission and withhold member-only protected output", async () => {
  const context: TeamContext = {
    team: { id: "team-1", name: "Falcons", slug: "falcons" },
    userId: "user-1",
    membership: { roleId: "role-1", roleSlug: "member", roleName: "Member" },
    permissions: ["team.read", "players.read", "matches.read"],
  };
  const checks: Array<{ slug: string; permission: string }> = [];
  const guard = async (slug: string, permission: PermissionCode) => {
    checks.push({ slug, permission });
    return context.permissions.includes(permission) ? context : null;
  };
  const denied = () => "SAFE_DENIAL";
  const params = () => Promise.resolve({ slug: "falcons" });

  const allowed = await Promise.all([
    routes.renderOverviewPage({ params: params(), requireTeamPermission: guard, denied }),
    routes.renderSquadPage({ params: params(), requireTeamPermission: guard, denied }),
    routes.renderMatchesPage({ params: params(), requireTeamPermission: guard, denied }),
  ]);
  assert.equal(allowed.includes("SAFE_DENIAL"), false);
  assert.deepEqual(checks, [
    { slug: "falcons", permission: "team.read" },
    { slug: "falcons", permission: "players.read" },
    { slug: "falcons", permission: "matches.read" },
  ]);

  assert.equal(await routes.renderFundsPage({ params: params(), requireTeamPermission: guard, denied }), "SAFE_DENIAL");
  assert.equal(await routes.renderSettingsPage({ params: params(), requireTeamPermission: guard, denied }), "SAFE_DENIAL");
  assert.deepEqual(checks.slice(3), [
    { slug: "falcons", permission: "finance.read" },
    { slug: "falcons", permission: "settings.read" },
  ]);
});
