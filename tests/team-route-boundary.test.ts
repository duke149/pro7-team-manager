import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
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
  POST(request: Request, resolveDependencies?: () => Promise<ApiDependencies>): Promise<Response>;
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
    loadUserTeams: (userId: string) => Promise<{ ok: true; teams: Team[] } | { ok: false }>;
    redirect: (url: string) => never;
  }): Promise<never>;
};

type LayoutModule = {
  renderTeamLayout(args: {
    children: unknown;
    params: Promise<{ slug: string }>;
    requireProductUser: (next: string) => Promise<ProductUser>;
  }): Promise<unknown>;
};

type PlaceholderModule = {
  TeamPlaceholder(args: {
    context: TeamContext;
    title: string;
    pendingSlice: string;
  }): React.ReactElement;
};

let vite: ViteDevServer;
let api: ApiModule;
let root: RootModule;
let routes: TeamRouteModule;
let layout: LayoutModule;
let placeholder: PlaceholderModule;

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

  const [apiModule, rootModule, overview, squad, matches, funds, settings, layoutModule, placeholderModule] = await Promise.all([
    vite.ssrLoadModule("/app/api/teams/route.ts"),
    vite.ssrLoadModule("/app/page.tsx"),
    vite.ssrLoadModule("/app/teams/[slug]/overview/page.tsx"),
    vite.ssrLoadModule("/app/teams/[slug]/squad/page.tsx"),
    vite.ssrLoadModule("/app/teams/[slug]/matches/page.tsx"),
    vite.ssrLoadModule("/app/teams/[slug]/funds/page.tsx"),
    vite.ssrLoadModule("/app/teams/[slug]/admin/settings/page.tsx"),
    vite.ssrLoadModule("/app/teams/[slug]/layout.tsx"),
    vite.ssrLoadModule("/app/components/team-placeholder.tsx"),
  ]).catch(() => []);
  assert.ok(apiModule, "team API must expose an injected createTeamHandler");
  assert.ok(rootModule, "root must expose an injected redirect behavior");
  assert.ok(overview && squad && matches && funds && settings, "team route skeletons must exist");
  api = apiModule as ApiModule;
  root = rootModule as RootModule;
  layout = layoutModule as LayoutModule;
  placeholder = placeholderModule as PlaceholderModule;
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

function request(
  body: unknown,
  headers: Record<string, string> = {},
): Request {
  return new Request("https://pro7.example/api/teams", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://pro7.example",
      "sec-fetch-site": "same-origin",
      ...headers,
    },
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

test("createTeamHandler rejects cross-origin mutations before body, auth, or database work", async () => {
  const fixture = apiDependencies();
  const responseValue = await api.createTeamHandler(
    request({ name: "Falcons" }, { origin: "https://attacker.example" }),
    fixture.dependencies,
  );

  assert.equal(responseValue.status, 403);
  assert.deepEqual(fixture.calls, []);
});

test("createTeamHandler requires application/json before auth or database work", async () => {
  const fixture = apiDependencies();
  const responseValue = await api.createTeamHandler(
    request({ name: "Falcons" }, { "content-type": "text/plain" }),
    fixture.dependencies,
  );

  assert.equal(responseValue.status, 415);
  assert.deepEqual(fixture.calls, []);
});

test("createTeamHandler differentiates oversized and malformed JSON bodies", async () => {
  const fixture = apiDependencies();
  const oversized = await api.createTeamHandler(
    request({ name: "Falcons" }, { "content-length": "8193" }),
    fixture.dependencies,
  );
  assert.equal(oversized.status, 413);
  assert.deepEqual(fixture.calls, []);

  const streamFixture = apiDependencies();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(JSON.stringify("x".repeat(8_193))));
      controller.close();
    },
  });
  const streamedOversized = await api.createTeamHandler(
    new Request("https://pro7.example/api/teams", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://pro7.example",
        "sec-fetch-site": "same-origin",
      },
      body: stream,
      duplex: "half",
    }),
    streamFixture.dependencies,
  );
  assert.equal(streamedOversized.status, 413);
  assert.deepEqual(streamFixture.calls, []);

  const malformed = await api.createTeamHandler(
    new Request("https://pro7.example/api/teams", {
      method: "POST",
      headers: {
        "content-type": "application/json; charset=utf-8",
        origin: "https://pro7.example",
        "sec-fetch-site": "same-origin",
      },
      body: "{not-json",
    }),
    fixture.dependencies,
  );
  assert.equal(malformed.status, 400);
  assert.deepEqual(fixture.calls, []);
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

test("createTeamHandler converts rejected auth, insert, and select dependencies to generic 500 responses", async () => {
  const rejectedAuth = apiDependencies();
  rejectedAuth.dependencies.getProductUser = async () => Promise.reject(new Error("auth upstream detail"));
  const authResponse = await api.createTeamHandler(request({ name: "Falcons" }), rejectedAuth.dependencies);
  assert.equal(authResponse.status, 500);
  assert.doesNotMatch(await authResponse.text(), /auth upstream detail/u);

  const rejectedInsert = apiDependencies();
  rejectedInsert.dependencies.supabase = {
    from() {
      return { insert: async () => Promise.reject(new Error("insert upstream detail")) };
    },
  };
  const insertResponse = await api.createTeamHandler(request({ name: "Falcons" }), rejectedInsert.dependencies);
  assert.equal(insertResponse.status, 500);
  assert.doesNotMatch(await insertResponse.text(), /insert upstream detail/u);

  const rejectedSelect = apiDependencies();
  rejectedSelect.dependencies.supabase = {
    from() {
      return {
        insert: async () => response(null),
        select() {
          return { eq: () => ({ maybeSingle: async () => Promise.reject(new Error("select upstream detail")) }) };
        },
      };
    },
  };
  const selectResponse = await api.createTeamHandler(request({ name: "Falcons" }), rejectedSelect.dependencies);
  assert.equal(selectResponse.status, 500);
  assert.doesNotMatch(await selectResponse.text(), /select upstream detail/u);
});

test("exported POST adapter returns a generic 500 when dependency initialization rejects", async () => {
  const responseValue = await api.POST(
    request({ name: "Falcons" }),
    async () => Promise.reject(new Error("environment initialization detail")),
  );

  assert.equal(responseValue.status, 500);
  assert.doesNotMatch(await responseValue.text(), /environment initialization detail/u);
});

test("exported POST adapter rejects a foreign origin before dependency initialization", async () => {
  let dependencyInitialization = 0;
  const responseValue = await api.POST(
    request({ name: "Falcons" }, { origin: "https://attacker.example" }),
    async () => {
      dependencyInitialization += 1;
      throw new Error("must not initialize");
    },
  );

  assert.equal(responseValue.status, 403);
  assert.equal(dependencyInitialization, 0);
});

test("exported POST adapter passes resolved server dependencies into the real team handler", async () => {
  const fixture = apiDependencies();
  const responseValue = await api.POST(
    request({ name: "Falcons" }),
    async () => fixture.dependencies,
  );

  assert.equal(responseValue.status, 201);
  assert.deepEqual(fixture.calls, [
    { method: "insert", value: { name: "Falcons", slug: "falcons" } },
    { method: "select", value: "id, name, slug" },
    { method: "eq", value: { field: "slug", value: "falcons" } },
  ]);
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
      loadUserTeams: async (userId) => {
        receivedUserId = userId;
        return { ok: true, teams: [] };
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
      loadUserTeams: async () => ({
        ok: true,
        teams: [
          { id: "team-2", name: "Zebra", slug: "zebra" },
          { id: "team-1", name: "Alpha", slug: "đội bóng" },
        ],
      }),
      redirect,
    }),
    /redirected/,
  );
  assert.deepEqual(redirects, ["/setup/team", "/teams/%C4%91%E1%BB%99i%20b%C3%B3ng/overview"]);
});

test("root does not convert a failed team lookup into a setup redirect", async () => {
  const redirects: string[] = [];
  await assert.rejects(
    root.redirectFromRoot({
      requireProductUser: async () => ({ user: { id: "user-1" }, requiresPasswordChange: false }),
      loadUserTeams: async () => ({ ok: false }),
      redirect: (url): never => {
        redirects.push(url);
        throw new Error("redirected");
      },
    }),
    /Không thể tải danh sách đội/,
  );
  assert.deepEqual(redirects, []);
});

test("team layout enforces the product-user guard for its encoded team route", async () => {
  const seen: string[] = [];
  const children = { content: "child" };
  assert.equal(
    await layout.renderTeamLayout({
      children,
      params: Promise.resolve({ slug: "đội bóng" }),
      requireProductUser: async (next) => {
        seen.push(next);
        return { user: { id: "user-1" }, requiresPasswordChange: false };
      },
    }),
    children,
  );
  assert.deepEqual(seen, ["/teams/%C4%91%E1%BB%99i%20b%C3%B3ng/overview"]);
});

test("TeamPlaceholder renders the real team, role, and pending vertical-slice state", () => {
  const html = renderToStaticMarkup(
    placeholder.TeamPlaceholder({
      context: {
        team: { id: "team-1", name: "Đội Thật", slug: "doi-that" },
        userId: "user-1",
        membership: { roleId: "role-1", roleSlug: "member", roleName: "Thành viên" },
        permissions: ["team.read"],
      },
      title: "Tổng quan",
      pendingSlice: "Dữ liệu tổng quan",
    }),
  );
  assert.match(html, /Đội Thật/u);
  assert.match(html, /Vai trò hiện tại: Thành viên/u);
  assert.match(html, /Dữ liệu tổng quan sẽ được xây dựng ở lát cắt tiếp theo/u);
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
