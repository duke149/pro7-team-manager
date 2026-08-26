import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer, type ViteDevServer } from "vite";

import { Pro7RouteHeader } from "../app/components/pro7-route-header";
import type { SquadFilters } from "../lib/squad/filters";
import type { SquadListResult } from "../lib/squad/model";
import type { TeamAccessContext } from "../lib/teams/context";

type SquadRouteModule = {
  renderSquadPage: (args: {
    params: Promise<{ slug: string }>;
    searchParams: Promise<Record<string, string | string[] | undefined>>;
    requireTeamPermission: () => Promise<TeamAccessContext>;
    listSquadPlayers: (teamId: string, filters: SquadFilters) => Promise<SquadListResult>;
    denied: () => string;
  }) => Promise<unknown>;
};

let vite: ViteDevServer;
let squad: SquadRouteModule;

test.before(async () => {
  vite = await createServer({
    appType: "custom",
    configFile: false,
    plugins: [{
      name: "pro7-shell-parity-navigation-shim",
      resolveId(id) {
        return id === "next/navigation" ? "\0pro7-shell-parity-navigation" : null;
      },
      load(id) {
        return id === "\0pro7-shell-parity-navigation"
          ? "export function notFound() { return 'SAFE_DENIAL'; }"
          : null;
      },
    }],
    resolve: { alias: { "next/navigation": resolve("node_modules/vinext/dist/shims/navigation.js") } },
    server: { middlewareMode: true },
  });
  squad = await vite.ssrLoadModule("/app/teams/[slug]/squad/page.tsx") as SquadRouteModule;
});

test.after(async () => vite.close());

const adminContext: TeamAccessContext = {
  team: { id: "team-1", name: "FC Spartans", slug: "fc-spartans" },
  userId: "admin-1",
  membership: { roleId: "role-admin", roleSlug: "admin", roleName: "Quản lý đội" },
  permissions: [
    "team.read",
    "players.read",
    "players.manage",
    "members.manage",
    "matches.read",
    "tactics.read",
    "finance.read",
  ],
};

async function renderSquadRoute(context: TeamAccessContext = adminContext): Promise<string> {
  const params = Promise.resolve({ slug: context.team.slug });
  const page = await squad.renderSquadPage({
    params,
    searchParams: Promise.resolve({}),
    requireTeamPermission: async () => context,
    listSquadPlayers: async () => ({ ok: true, players: [] }),
    denied: () => "SAFE_DENIAL",
  });
  return renderToStaticMarkup(page as React.ReactElement);
}

test("Squad route preserves the hosted empty grid hierarchy", async () => {
  const html = await renderSquadRoute();

  for (const text of [
    "Tìm theo tên cầu thủ...",
    "Tất cả",
    "GK",
    "DEF",
    "MID",
    "ATT",
    "Bộ lọc",
    "Quân số",
    "Sẵn sàng",
    "Chấn thương",
    "Tuổi TB",
    "Chưa có cầu thủ",
    "Đăng ký thành viên mới",
  ]) {
    assert.match(html, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
  }

  assert.match(html, /class="[^"]*squad-toolbar/u);
  assert.match(html, /class="[^"]*squad-summary/u);
  assert.match(html, /class="[^"]*player-grid/u);
  assert.match(html, /class="[^"]*add-player-card/u);
  assert.match(html, /href="\/teams\/fc-spartans\/squad\?add=player"/u);
});

test("member Squad route hides every add-player control", async () => {
  const html = await renderSquadRoute({
    ...adminContext,
    userId: "member-1",
    membership: { roleId: "role-member", roleSlug: "member", roleName: "Thành viên" },
    permissions: ["team.read", "players.read", "matches.read", "tactics.read"],
  });

  assert.doesNotMatch(html, /Thêm cầu thủ|Đăng ký thành viên mới/u);
  assert.match(html, /class="[^"]*player-grid/u);
});

test("member route header omits the add-player CTA as well as the Squad grid card", () => {
  const html = renderToStaticMarkup(createElement(Pro7RouteHeader, {
    team: adminContext.team,
    permissions: ["team.read", "players.read", "matches.read", "tactics.read"],
    email: "member@example.com",
    pathname: "/teams/fc-spartans/squad",
    theme: "light",
    onThemeChange: () => {},
    onOpenMenu: () => {},
  }));

  assert.doesNotMatch(html, /header-cta|Thêm cầu thủ/u);
  assert.match(html, /Thông báo/u);
});
