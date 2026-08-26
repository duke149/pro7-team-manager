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

test("includes the production shell surfaces and social metadata", async () => {
  const [navigation, routeNavigation, routeHeader, routeShell, squadView, squadDetail, playerDetail, squadLoading, squadError, playerApi, overview, squad, tactics, matches, funds, settings, teamLayout, layout, styles] = await Promise.all([
    readFile(new URL("../app/components/product-nav.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/pro7-route-navigation.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/pro7-route-header.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/pro7-route-shell.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/teams/[slug]/squad/squad-view.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/teams/[slug]/squad/[userId]/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/teams/[slug]/squad/[userId]/player-detail.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/teams/[slug]/squad/loading.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/teams/[slug]/squad/error.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/teams/[slug]/players/[userId]/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/teams/[slug]/overview/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/teams/[slug]/squad/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/teams/[slug]/tactics/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/teams/[slug]/matches/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/teams/[slug]/funds/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/teams/[slug]/admin/settings/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/teams/[slug]/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  for (const label of ["Tổng quan", "Đội hình", "Trận đấu", "Quỹ đội", "Cài đặt đội"]) {
    assert.match(navigation, new RegExp(label));
  }
  assert.doesNotMatch(navigation, /Chiến thuật/u);
  assert.match(overview, /team\.read/);
  assert.match(squad, /players\.read/);
  assert.match(matches, /matches\.read/);
  assert.match(funds, /finance\.read/);
  assert.match(settings, /settings\.read/);
  assert.match(routeNavigation, /TEAM MANAGER/);
  assert.match(routeNavigation, /Tổng quan[\s\S]*Đội hình[\s\S]*Trận đấu[\s\S]*Chiến thuật[\s\S]*Quỹ đội/);
  assert.match(routeNavigation, /href=\{href\}/);
  assert.match(routeHeader, /Đội hình chính/);
  assert.match(routeHeader, /Theo dõi nhân sự, phong độ và vai trò thi đấu\./);
  assert.match(routeHeader, /players\.manage/);
  assert.match(routeHeader, /members\.manage/);
  assert.match(routeShell, /<Pro7RouteNavigation/);
  assert.match(routeShell, /<Pro7RouteHeader/);
  assert.match(squadView, /squad-toolbar/);
  assert.match(squadView, /squad-summary/);
  assert.match(squadView, /player-grid/);
  assert.match(squadView, /add-player-card/);
  assert.match(squadView, /members\.manage/);
  assert.doesNotMatch(squadView, /Marcus Trent|David Silva|Liam Kompany/u);
  assert.match(squad, /parseSquadFilters/);
  assert.match(squad, /listSquadPlayers/);
  assert.match(squad, /SquadView/);
  assert.match(squadDetail, /players\.read/);
  assert.match(squadDetail, /getSquadPlayer/);
  assert.match(playerDetail, /Chỉnh sửa thông tin đội/);
  assert.match(playerDetail, /Nhập DEACTIVATE để xác nhận/);
  assert.match(squadLoading, /Đang tải đội hình/);
  assert.match(squadError, /Không thể tải đội hình/);
  assert.match(playerApi, /updateTeamPlayer/);
  assert.match(playerApi, /deactivateTeamPlayer/);
  assert.doesNotMatch(squad, /TeamPlaceholder/);
  assert.match(tactics, /tactics\.read/);
  assert.match(tactics, /Chưa có trận đấu để lập chiến thuật/);
  assert.match(teamLayout, /Pro7RouteShell/);
  assert.doesNotMatch(teamLayout, /ProductShell/);
  assert.match(styles, /\.main-nav a\.active\{[^}]*color:\s*(?:#fff|white)/u);
  assert.doesNotMatch(styles, /\.main-nav a\.active\{[^}]*color:\s*var\(--navy\)/u);
  assert.match(layout, /openGraph/);
  assert.match(layout, /twitter/);
  assert.doesNotMatch(layout, /og\.png/);
});

test("wires verified Supabase auth without changing Sites auth routes", async () => {
  const [auth, callback, home, accountMenu, controls, productShell, chatgptAuth] = await Promise.all([
    readFile(new URL("../lib/supabase/auth.ts", import.meta.url), "utf8").catch(() => ""),
    readFile(new URL("../app/auth/callback/route.ts", import.meta.url), "utf8").catch(() => ""),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/account-menu.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/product-shell-controls.ts", import.meta.url), "utf8"),
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
  assert.match(accountMenu, /createBrowserSupabaseClient/, "the product shell must use the browser client");
  assert.match(accountMenu, /requestLocalLogout/, "the product shell must use verified local logout");
  assert.match(accountMenu, /window\.location\.replace/, "logout must use safe replacement navigation");
  assert.match(controls, /Đăng xuất/, "logout must have an accessible Vietnamese label");
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

test("browser product-shell bundle contains no server-only imports or credentials", async () => {
  const result = await build({
    configFile: false,
    define: {
      "process.env.NEXT_PUBLIC_SUPABASE_URL": JSON.stringify("https://bundle-test.supabase.co"),
      "process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(
        "sb_publishable_bundle_test_key",
      ),
      "process.env.SUPABASE_SERVICE_ROLE_KEY": JSON.stringify(
        "product-shell-service-sentinel-must-not-bundle",
      ),
    },
    build: {
      lib: {
        entry: resolve("app/components/product-shell.tsx"),
        formats: ["es"],
        fileName: "product-shell",
      },
      rollupOptions: { external: ["next/navigation"] },
      write: false,
    },
  });
  const bundledCode = (Array.isArray(result) ? result : [result])
    .flatMap((bundle) => bundle.output)
    .filter((output) => output.type === "chunk")
    .map((output) => output.code)
    .join("\n");

  assert.doesNotMatch(
    bundledCode,
    /SUPABASE_SERVICE_ROLE_KEY|product-shell-service-sentinel-must-not-bundle|createServerSupabaseClient|lib\/supabase\/server/u,
  );
});
