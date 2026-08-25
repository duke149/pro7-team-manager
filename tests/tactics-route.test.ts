import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer, type ViteDevServer } from "vite";

import type { TeamAccessContext } from "../lib/teams/context";
import type { PermissionCode } from "../lib/teams/permissions";

type TacticsRouteModule = {
  renderTacticsPage: (args: {
    params: Promise<{ slug: string }>;
    requireTeamPermission: (slug: string, permission: PermissionCode) => Promise<TeamAccessContext | null>;
    denied: () => string;
  }) => Promise<unknown>;
};

const context: TeamAccessContext = {
  team: { id: "team-1", name: "Falcons", slug: "falcons" },
  userId: "member-1",
  membership: { roleId: "role-1", roleSlug: "member", roleName: "Thành viên" },
  permissions: ["tactics.read"],
};

let vite: ViteDevServer;
let tactics: TacticsRouteModule;

test.before(async () => {
  vite = await createServer({
    appType: "custom",
    configFile: false,
    plugins: [{
      name: "tactics-route-navigation-shim",
      resolveId(id) { return id === "next/navigation" ? "\0tactics-route-navigation" : null; },
      load(id) { return id === "\0tactics-route-navigation" ? "export function notFound() { return 'SAFE_DENIAL'; }" : null; },
    }],
    resolve: { alias: { "next/navigation": resolve("node_modules/vinext/dist/shims/navigation.js") } },
    server: { middlewareMode: true },
  });
  tactics = await vite.ssrLoadModule("/app/teams/[slug]/tactics/page.tsx") as TacticsRouteModule;
});

test.after(async () => vite.close());

test("tactics landing has an honest no-match state and enforces tactics.read", async () => {
  const checks: Array<{ slug: string; permission: PermissionCode }> = [];
  const page = await tactics.renderTacticsPage({
    params: Promise.resolve({ slug: "falcons" }),
    requireTeamPermission: async (slug, permission) => {
      checks.push({ slug, permission });
      return context;
    },
    denied: () => "SAFE_DENIAL",
  });

  assert.deepEqual(checks, [{ slug: "falcons", permission: "tactics.read" }]);
  const html = renderToStaticMarkup(page as React.ReactElement);
  assert.match(html, /Chưa có trận đấu để lập chiến thuật/u);
  assert.match(html, /trang trận đấu/u);
  assert.equal(await tactics.renderTacticsPage({
    params: Promise.resolve({ slug: "falcons" }),
    requireTeamPermission: async () => null,
    denied: () => "SAFE_DENIAL",
  }), "SAFE_DENIAL");
});
