import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { createServer, type ViteDevServer } from "vite";

import type { TeamAccessContext } from "../lib/teams/context";
import { hasPermission, PERMISSION_CODES, type PermissionCode } from "../lib/teams/permissions";

const DENIED = Symbol("denied");
const SLUG = "pro7-fc";

const memberPermissions = [
  "team.read", "members.read", "roles.read", "players.read", "matches.read",
  "matches.respond", "tactics.read", "news.read",
] satisfies readonly PermissionCode[];

const roles = {
  owner: PERMISSION_CODES,
  admin: PERMISSION_CODES.filter((permission) => permission !== "team.delete"),
  member: memberPermissions,
} satisfies Record<string, readonly PermissionCode[]>;

const expectedRoutes = {
  owner: ["overview", "squad", "matches", "tactics", "funds", "settings"],
  admin: ["overview", "squad", "matches", "tactics", "funds", "settings"],
  member: ["overview", "squad", "matches", "tactics"],
} as const;

const expectedMutations = {
  owner: ["squad", "matches", "attendance", "tactics", "funds", "settings"],
  admin: ["squad", "matches", "attendance", "tactics", "funds", "settings"],
  member: ["attendance"],
} as const;

type Render = (arguments_: Record<string, unknown>) => Promise<unknown>;
let vite: ViteDevServer;
let renderOverviewPage: Render;
let renderSquadPage: Render;
let renderMatchesPage: Render;
let renderTacticsPage: Render;
let renderFundsPage: Render;
let renderSettingsPage: Render;

test.before(async () => {
  vite = await createServer({
    appType: "custom",
    configFile: false,
    resolve: { alias: { "next/navigation": resolve("tests/fixtures/squad-page-navigation.ts") } },
    server: { middlewareMode: true },
  });
  const [overview, squad, matches, tactics, funds, settings] = await Promise.all([
    vite.ssrLoadModule("/app/teams/[slug]/overview/page.tsx"),
    vite.ssrLoadModule("/app/teams/[slug]/squad/page.tsx"),
    vite.ssrLoadModule("/app/teams/[slug]/matches/page.tsx"),
    vite.ssrLoadModule("/app/teams/[slug]/tactics/page.tsx"),
    vite.ssrLoadModule("/app/teams/[slug]/funds/page.tsx"),
    vite.ssrLoadModule("/app/teams/[slug]/admin/settings/page.tsx"),
  ]);
  ({ renderOverviewPage } = overview);
  ({ renderSquadPage } = squad);
  ({ renderMatchesPage } = matches);
  ({ renderTacticsPage } = tactics);
  ({ renderFundsPage } = funds);
  ({ renderSettingsPage } = settings);
});

test.after(async () => vite.close());

function context(role: keyof typeof roles): TeamAccessContext {
  return {
    team: { id: "team-1", name: "PRO7 FC", slug: SLUG },
    userId: `${role}-user`,
    membership: { roleId: `${role}-role`, roleSlug: role, roleName: role },
    permissions: roles[role],
  };
}

function guard(value: TeamAccessContext) {
  return async (slug: string, permission: PermissionCode) => {
    assert.equal(slug, SLUG);
    return hasPermission(value, permission) ? value : null;
  };
}

async function routeResults(role: keyof typeof roles) {
  const value = context(role);
  const requireTeamPermission = guard(value);
  const common = { params: Promise.resolve({ slug: SLUG }), requireTeamPermission, denied: () => DENIED };
  const entries = await Promise.all([
    renderOverviewPage(common),
    renderSquadPage({ ...common, searchParams: Promise.resolve({}), listSquadPlayers: async () => ({ ok: true, players: [] }) }),
    renderMatchesPage(common),
    renderTacticsPage(common),
    renderFundsPage({ ...common, periodStart: "2026-08-01" }),
    renderSettingsPage(common),
  ]);
  const names = ["overview", "squad", "matches", "tactics", "funds", "settings"];
  return names.filter((_, index) => entries[index] !== DENIED);
}

function mutationResults(role: keyof typeof roles) {
  const value = context(role);
  const matrix = [
    ["squad", ["players.manage", "members.manage"]],
    ["matches", ["matches.manage"]],
    ["attendance", ["matches.respond"]],
    ["tactics", ["tactics.manage"]],
    ["funds", ["finance.manage"]],
    ["settings", ["settings.update"]],
  ] satisfies readonly (readonly [string, readonly PermissionCode[]])[];
  return matrix
    .filter(([, permissions]) => permissions.every((permission) => hasPermission(value, permission)))
    .map(([surface]) => surface);
}

for (const role of Object.keys(roles) as (keyof typeof roles)[]) {
  test(`${role} full-MVP route matrix exposes only authorized reads and mutations`, async () => {
    assert.deepEqual(await routeResults(role), [...expectedRoutes[role]]);
    assert.deepEqual(mutationResults(role), [...expectedMutations[role]]);
  });
}
