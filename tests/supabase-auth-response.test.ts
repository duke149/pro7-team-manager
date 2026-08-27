import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";

import { createServer, type ViteDevServer } from "vite";

import { matchesMiddleware } from "../node_modules/vinext/dist/server/middleware-matcher.js";
import { mergeMiddlewareResponseHeaders } from "../node_modules/vinext/dist/server/middleware-response-headers.js";
import { normalizePath } from "../node_modules/vinext/dist/server/normalize-path.js";
import {
  NextRequest,
  type NextResponse,
} from "../node_modules/vinext/dist/shims/server.js";
import { normalizePathnameForRouteMatchStrict } from "../node_modules/vinext/dist/routing/utils.js";

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
    ): Promise<{
      data: { session: null; user: null };
      error: unknown;
    }>;
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

test("middleware overwrites the trusted same-origin return path for server layouts", async () => {
  const middleware = await loadModule<AuthBoundaryModule>(
    "/middleware.ts",
    "middleware.ts must expose the Supabase refresh boundary",
  );
  const request = new NextRequest(
    "https://pro7.example/teams/%C4%91%E1%BB%99i%20b%C3%B3ng/funds?tab=open",
    { headers: { "x-pro7-return-path": "https://attacker.example/steal" } },
  );
  const response = await middleware.refreshSupabaseSession(
    request,
    () => ({
      auth: {
        async getUser() {
          return { data: { user: null }, error: null };
        },
      },
    }),
  );

  assert.equal(
    response.headers.get("x-middleware-request-x-pro7-return-path"),
    "/teams/%C4%91%E1%BB%99i%20b%C3%B3ng/funds?tab=open",
  );
});

function middlewarePathname(rawPathname: string): string {
  return normalizePath(normalizePathnameForRouteMatchStrict(rawPathname));
}

test("middleware matcher refreshes app routes but skips static assets", async () => {
  const middleware = await loadModule<AuthBoundaryModule>(
    "/middleware.ts",
    "middleware.ts must expose its matcher",
  );

  for (const pathname of ["/", "/login", "/auth/ordinary", "/squad"]) {
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

test("middleware gives callback routes one response owner after Vinext normalization", async () => {
  const middleware = await loadModule<AuthBoundaryModule>(
    "/middleware.ts",
    "middleware.ts must expose its matcher",
  );

  for (const rawPathname of [
    "/auth/callback",
    "/auth/callback/",
    "/auth/callback/again",
    "/auth//callback",
    "/auth//callback/again",
  ]) {
    const pathname = middlewarePathname(rawPathname);
    assert.equal(
      matchesMiddleware(pathname, middleware.config.matcher),
      false,
      `${rawPathname} normalized to ${pathname}`,
    );
  }
});

test("Vinext finalization cannot append a middleware session after callback exchange", async () => {
  const middleware = await loadModule<AuthBoundaryModule>(
    "/middleware.ts",
    "middleware.ts must expose the Supabase refresh boundary",
  );
  const callback = await loadModule<CallbackModule>(
    "/app/auth/callback/route.ts",
    "the auth callback module must load",
  );
  const request = new NextRequest(
    "https://pro7.example/auth//callback?code=valid-code&next=%2Fsquad",
    { headers: { cookie: "sb-session=old-session; pkce=verifier" } },
  );
  const pathname = middlewarePathname(new URL(request.url).pathname);
  let middlewareResponse: NextResponse | undefined;

  if (matchesMiddleware(pathname, middleware.config.matcher)) {
    middlewareResponse = await middleware.refreshSupabaseSession(
      request,
      (_url, _key, { cookies }) => ({
        auth: {
          async getUser() {
            await cookies.setAll(
              [
                {
                  name: "sb-session",
                  value: "middleware-old-refresh",
                  options: { httpOnly: true, path: "/" },
                },
              ],
              { "Cache-Control": "private, no-store" },
            );
            return { data: { user: null }, error: null };
          },
        },
      }),
    );
  }

  const callbackResponse = await callback.handleAuthCallback(
    request,
    (_url, _key, { cookies }) => ({
      auth: {
        async exchangeCodeForSession() {
          await cookies.setAll(
            [
              {
                name: "sb-session",
                value: "callback-new-session",
                options: { httpOnly: true, path: "/" },
              },
            ],
            { "Cache-Control": "private, no-cache, no-store" },
          );
          return { data: { session: null, user: null }, error: null };
        },
      },
    }),
  );
  const finalizedHeaders = new Headers(callbackResponse.headers);
  mergeMiddlewareResponseHeaders(
    finalizedHeaders,
    middlewareResponse?.headers ?? null,
  );

  const sessionCookies = finalizedHeaders
    .getSetCookie()
    .filter((value) => value.startsWith("sb-session="));
  assert.deepEqual(sessionCookies, [
    "sb-session=callback-new-session; Path=/; HttpOnly",
  ]);
  assert.equal(
    finalizedHeaders.get("cache-control"),
    "private, no-cache, no-store",
  );
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

test("callback failure preserves response-owned cookies and cache headers on a safe redirect", async () => {
  const callback = await loadModule<CallbackModule>(
    "/app/auth/callback/route.ts",
    "the auth callback module must load",
  );
  const request = new NextRequest(
    "https://pro7.example/auth/callback?code=expired-code&next=%2Fauth%2F%2Fcallback",
    { headers: { cookie: "pkce=expired-verifier" } },
  );
  const response = await callback.handleAuthCallback(
    request,
    (_url, _key, { cookies }) => ({
      auth: {
        async exchangeCodeForSession() {
          await cookies.setAll(
            [
              {
                name: "pkce",
                value: "",
                options: { expires: new Date(0), httpOnly: true, path: "/" },
              },
            ],
            {
              "Cache-Control": "private, no-cache, no-store, must-revalidate",
              Expires: "0",
              Pragma: "no-cache",
            },
          );
          return {
            data: { session: null, user: null },
            error: new Error("expired code"),
          };
        },
      },
    }),
  );

  assert.equal(response.status, 303);
  assert.equal(
    response.headers.get("location"),
    "https://pro7.example/login?next=%2F&error=callback",
  );
  assert.ok(
    setCookies(response).some((value) =>
      value.startsWith("pkce=; Path=/; Expires=Thu, 01 Jan 1970"),
    ),
  );
  assert.equal(
    response.headers.get("cache-control"),
    "private, no-cache, no-store, must-revalidate",
  );
  assert.equal(response.headers.get("expires"), "0");
  assert.equal(response.headers.get("pragma"), "no-cache");
});
