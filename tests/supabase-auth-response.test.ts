import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";

import { createServer, type ViteDevServer } from "vite";

import { matchesMiddleware } from "../node_modules/vinext/dist/server/middleware-matcher.js";
import {
  NextRequest,
  type NextResponse,
} from "../node_modules/vinext/dist/shims/server.js";

type CookieOptions = Record<string, unknown>;
type CookieToSet = {
  name: string;
  value: string;
  options: CookieOptions;
};
type CookieAdapter = {
  getAll(): Array<{ name: string; value: string }> | null;
  setAll(
    cookies: CookieToSet[],
    headers: Record<string, string>,
  ): void | Promise<void>;
};
type ClientFactoryOptions = { cookies: CookieAdapter };
type AuthBoundaryModule = {
  config: { matcher: string | string[] };
  refreshSupabaseSession(
    request: NextRequest,
    createClient: MiddlewareClientFactory,
  ): Promise<NextResponse>;
};
type CallbackModule = {
  handleAuthCallback(
    request: NextRequest,
    createClient: CallbackClientFactory,
  ): Promise<NextResponse>;
};
type MiddlewareClientFactory = (
  url: string,
  key: string,
  options: ClientFactoryOptions,
) => {
  auth: { getUser(): Promise<{ data: { user: null }; error: null }> };
};
type CallbackClientFactory = (
  url: string,
  key: string,
  options: ClientFactoryOptions,
) => {
  auth: {
    exchangeCodeForSession(
      code: string,
    ): Promise<{ data: { session: null; user: null }; error: null }>;
  };
};

let vite: ViteDevServer;
let previousSupabaseUrl: string | undefined;
let previousSupabaseKey: string | undefined;

test.before(async () => {
  previousSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  previousSupabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://boundary-test.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY =
    "sb_publishable_boundary_test_key";
  vite = await createServer({
    appType: "custom",
    configFile: false,
    resolve: {
      alias: {
        "next/headers": resolve("node_modules/vinext/dist/shims/headers.js"),
        "next/server": resolve("node_modules/vinext/dist/shims/server.js"),
      },
    },
    server: { middlewareMode: true },
  });
});

test.after(async () => {
  await vite.close();
  if (previousSupabaseUrl === undefined) {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  } else {
    process.env.NEXT_PUBLIC_SUPABASE_URL = previousSupabaseUrl;
  }
  if (previousSupabaseKey === undefined) {
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  } else {
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = previousSupabaseKey;
  }
});

async function loadModule<T>(path: string, message: string): Promise<T> {
  const loaded = await vite.ssrLoadModule(path).catch(() => null);
  assert.ok(loaded, message);
  return loaded as T;
}

function setCookies(response: NextResponse): string[] {
  return response.headers.getSetCookie();
}

test("middleware forwards refreshed cookies to the render and browser with cache headers", async () => {
  const middleware = await loadModule<AuthBoundaryModule>(
    "/middleware.ts",
    "middleware.ts must expose the Supabase refresh boundary",
  );
  assert.equal(typeof middleware.refreshSupabaseSession, "function");

  const request = new NextRequest("https://pro7.example/", {
    headers: { cookie: "existing=one" },
  });
  const createClient: MiddlewareClientFactory = (_url, _key, { cookies }) => ({
    auth: {
      async getUser() {
        assert.deepEqual(cookies.getAll(), [{ name: "existing", value: "one" }]);
        await cookies.setAll(
          [
            {
              name: "sb-access",
              value: "fresh-access",
              options: { httpOnly: true, path: "/", sameSite: "lax" },
            },
          ],
          {
            "Cache-Control": "private, no-cache, no-store, must-revalidate, max-age=0",
            Expires: "0",
          },
        );
        await cookies.setAll(
          [
            {
              name: "sb-refresh",
              value: "fresh-refresh",
              options: { httpOnly: true, path: "/", sameSite: "lax" },
            },
          ],
          { Pragma: "no-cache" },
        );
        return { data: { user: null }, error: null };
      },
    },
  });

  const response = await middleware.refreshSupabaseSession(request, createClient);

  assert.match(request.headers.get("cookie") ?? "", /sb-access=fresh-access/);
  assert.match(request.headers.get("cookie") ?? "", /sb-refresh=fresh-refresh/);
  assert.match(
    response.headers.get("x-middleware-request-cookie") ?? "",
    /sb-access=fresh-access/,
  );
  assert.match(
    response.headers.get("x-middleware-request-cookie") ?? "",
    /sb-refresh=fresh-refresh/,
  );
  assert.ok(setCookies(response).some((value) => value.includes("sb-access=fresh-access")));
  assert.ok(setCookies(response).some((value) => value.includes("sb-refresh=fresh-refresh")));
  assert.equal(
    response.headers.get("cache-control"),
    "private, no-cache, no-store, must-revalidate, max-age=0",
  );
  assert.equal(response.headers.get("expires"), "0");
  assert.equal(response.headers.get("pragma"), "no-cache");
});

test("middleware matcher refreshes app and auth routes but skips static assets", async () => {
  const middleware = await loadModule<AuthBoundaryModule>(
    "/middleware.ts",
    "middleware.ts must expose its matcher",
  );

  for (const pathname of ["/", "/login", "/auth/callback", "/squad"] ) {
    assert.equal(
      matchesMiddleware(pathname, middleware.config.matcher),
      true,
      pathname,
    );
  }
  for (const pathname of [
    "/_next/static/chunks/app.js",
    "/_next/image?url=%2Fteam.png",
    "/favicon.ico",
    "/team-badge.png",
  ]) {
    assert.equal(
      matchesMiddleware(pathname, middleware.config.matcher),
      false,
      pathname,
    );
  }
});

test("callback success keeps exchanged cookies and cache headers on its redirect", async () => {
  const callback = await loadModule<CallbackModule>(
    "/app/auth/callback/route.ts",
    "the auth callback module must load",
  );
  assert.equal(typeof callback.handleAuthCallback, "function");

  const request = new NextRequest(
    "https://pro7.example/auth/callback?code=valid-code&next=%2Fsquad",
    { headers: { cookie: "pkce=verifier" } },
  );
  const createClient: CallbackClientFactory = (_url, _key, { cookies }) => ({
    auth: {
      async exchangeCodeForSession(code) {
        assert.equal(code, "valid-code");
        assert.deepEqual(cookies.getAll(), [{ name: "pkce", value: "verifier" }]);
        await cookies.setAll(
          [
            {
              name: "sb-access",
              value: "callback-access",
              options: { httpOnly: true, path: "/", sameSite: "lax" },
            },
          ],
          {
            "Cache-Control": "private, no-cache, no-store, must-revalidate, max-age=0",
            Expires: "0",
            Pragma: "no-cache",
          },
        );
        return { data: { session: null, user: null }, error: null };
      },
    },
  });

  const response = await callback.handleAuthCallback(request, createClient);

  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), "https://pro7.example/squad");
  assert.ok(
    setCookies(response).some((value) =>
      value.includes("sb-access=callback-access"),
    ),
  );
  assert.equal(
    response.headers.get("cache-control"),
    "private, no-cache, no-store, must-revalidate, max-age=0",
  );
  assert.equal(response.headers.get("expires"), "0");
  assert.equal(response.headers.get("pragma"), "no-cache");
});
