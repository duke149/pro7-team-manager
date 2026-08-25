import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import { build } from "vite";

async function render(pathname = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(new Request(`https://pro7.example${pathname}`, { headers: { accept: "text/html" } }), {
    ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
  }, { waitUntil() {}, passThroughOnException() {} });
}

test("server-renders the Vietnamese Supabase login boundary", async () => {
  const response = await render("/login?next=%2F");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /PRO7 Team Manager/);
  assert.match(html, /Đăng nhập/);
  assert.match(html, /Email/);
  assert.match(html, /Mật khẩu/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/);
});

test("redirects an unauthenticated dashboard request to the Supabase login", async () => {
  const response = await render("/");

  assert.equal(response.status, 307);
  assert.equal(response.headers.get("location"), "/login?next=%2F");
});

test("includes the five core surfaces and social metadata", async () => {
  const [source, layout] = await Promise.all([
    readFile(new URL("../app/pro7-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
  ]);
  for (const label of ["Tổng quan", "Đội hình", "Trận đấu", "Chiến thuật", "Quỹ đội"]) {
    assert.match(source, new RegExp(label));
  }
  assert.match(layout, /openGraph/);
  assert.match(layout, /twitter/);
  assert.doesNotMatch(layout, /og\.png/);
});

test("wires verified Supabase auth without changing Sites auth routes", async () => {
  const [auth, callback, home, accountMenu, productShell, chatgptAuth] = await Promise.all([
    readFile(new URL("../lib/supabase/auth.ts", import.meta.url), "utf8").catch(() => ""),
    readFile(new URL("../app/auth/callback/route.ts", import.meta.url), "utf8").catch(() => ""),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/account-menu.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/product-shell.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/chatgpt-auth.ts", import.meta.url), "utf8"),
  ]);

  assert.match(auth, /auth\.getUser\(\)/, "server identity must be verified");
  assert.match(auth, /redirect\([^)]*\/login/, "unauthenticated users must be sent to /login");
  assert.match(callback, /auth\.exchangeCodeForSession\(code\)/, "callback must exchange its PKCE code");
  assert.match(callback, /safeRelativeReturnPath\(/, "callback redirects must be local-only");
  assert.match(
    home,
    /await requireProductUser\("\/"\)/,
    "the dashboard must enforce the temporary-password boundary",
  );
  assert.match(accountMenu, /auth\.signOut\(\)/, "the product shell must expose Supabase logout");
  assert.match(accountMenu, /Đăng xuất/, "logout must have an accessible Vietnamese label");
  assert.match(productShell, /<ProductNav/, "the product shell must render route-aware navigation");
  assert.doesNotMatch(productShell, /FC Spartans|Coach Miller/u);
  assert.match(chatgptAuth, /const SIGN_IN_PATH = "\/signin-with-chatgpt"/);
  assert.match(chatgptAuth, /const CALLBACK_PATH = "\/callback"/);
  assert.doesNotMatch(chatgptAuth, /Supabase|\/auth\/callback/);
});

test("browser password replacement bundle contains no service credential", async () => {
  const result = await build({
    configFile: false,
    define: {
      "process.env.NEXT_PUBLIC_SUPABASE_URL": JSON.stringify(
        "https://bundle-test.supabase.co",
      ),
      "process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(
        "sb_publishable_bundle_test_key",
      ),
      "process.env.SUPABASE_SERVICE_ROLE_KEY": JSON.stringify(
        "service-value-that-must-never-reach-the-browser",
      ),
    },
    build: {
      lib: {
        entry: resolve("app/account/change-password/change-password-form.tsx"),
        formats: ["es"],
        fileName: "change-password-form",
      },
      write: false,
    },
  });
  const bundledCode = (Array.isArray(result) ? result : [result])
    .flatMap((bundle) => bundle.output)
    .filter((output) => output.type === "chunk")
    .map((output) => output.code)
    .join("\n");

  assert.match(bundledCode, /change-temporary-password/);
  assert.match(
    bundledCode,
    /Không thể hoàn tất đổi mật khẩu\. Vui lòng liên hệ quản trị viên\./,
    "the browser must surface manual recovery guidance without upstream details",
  );
  assert.doesNotMatch(
    bundledCode,
    /SUPABASE_SERVICE_ROLE_KEY|service-value-that-must-never-reach-the-browser/u,
  );
});
