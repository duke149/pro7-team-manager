import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer, type ViteDevServer } from "vite";

import { Pro7RouteHeader } from "../app/components/pro7-route-header";
import type { SquadFilters } from "../lib/squad/filters";
import type {
  SquadDetailResult,
  SquadAssignableRolesResult,
  SquadListResult,
  SquadPerformanceResult,
  SquadPlayerDetail,
  SquadPlayerSummary,
} from "../lib/squad/model";
import type { TeamAccessContext } from "../lib/teams/context";
import type { PermissionCode } from "../lib/teams/permissions";

type ListPageModule = {
  renderSquadPage(arguments_: {
    params: Promise<{ slug: string }>;
    searchParams: Promise<Record<string, string | string[] | undefined>>;
    requireTeamPermission: (
      slug: string,
      permission: PermissionCode,
    ) => Promise<TeamAccessContext | null>;
    listSquadPlayers: (teamId: string, filters: SquadFilters) => Promise<SquadListResult>;
    listSquadPerformance?: (teamId: string, userIds: readonly string[]) => Promise<SquadPerformanceResult>;
    denied: () => unknown;
  }): Promise<unknown>;
};

type DetailPageModule = {
  renderSquadPlayerPage(arguments_: {
    params: Promise<{ slug: string; userId: string }>;
    requireTeamPermission: (
      slug: string,
      permission: PermissionCode,
    ) => Promise<TeamAccessContext | null>;
    getSquadPlayer: (
      teamId: string,
      userId: string,
      includeAdminNotes: boolean,
    ) => Promise<SquadDetailResult>;
    listAssignableSquadRoles: (teamId: string, canReadRoles: boolean) => Promise<SquadAssignableRolesResult>;
    denied: () => unknown;
  }): Promise<unknown>;
};

type StateModule = { default: (props: { reset?: () => void }) => unknown };

type ApiModule = {
  mutatePlayerRoute(
    method: "PATCH" | "DELETE",
    request: Request,
    params: Promise<{ slug: string; userId: string }>,
    handlers: {
      updateTeamPlayer: (
        request: Request,
        target: { slug: string; userId: string },
      ) => Promise<Response>;
      deactivateTeamPlayer: (
        request: Request,
        target: { slug: string; userId: string },
      ) => Promise<Response>;
    },
  ): Promise<Response>;
};

const ADMIN_CONTEXT: TeamAccessContext = {
  team: { id: "team-1", name: "PRO7 FC", slug: "pro7-fc" },
  userId: "00000000-0000-4000-8000-000000000001",
  membership: {
    roleId: "00000000-0000-4000-8000-000000000002",
    roleSlug: "admin",
    roleName: "Quản lý đội",
  },
  permissions: [
    "team.read",
    "players.read",
    "players.manage",
    "members.manage",
    "roles.read",
  ],
};

const PLAYER: SquadPlayerSummary = {
  userId: "00000000-0000-4000-8000-000000000010",
  displayName: "Nguyễn An",
  avatarPath: null,
  avatarUrl: null,
  membershipStatus: "active",
  role: {
    id: "00000000-0000-4000-8000-000000000011",
    name: "Cầu thủ",
    slug: "member",
    isSystem: true,
  },
  shirtNumber: 8,
  officialPosition: "MID",
  playerStatus: "available",
  joinDate: "2026-01-02",
};

const DETAIL: SquadPlayerDetail = {
  ...PLAYER,
  phone: "0900000001",
  dateOfBirth: "2000-05-10",
  heightCm: 175,
  weightKg: 68.5,
  preferredPositions: ["MID", "ATT"],
};

let vite: ViteDevServer;
let listPage: ListPageModule;
let detailPage: DetailPageModule;
let loadingState: StateModule;
let errorState: StateModule;
let api: ApiModule;

test.before(async () => {
  vite = await createServer({
    appType: "custom",
    configFile: false,
    plugins: [{
      name: "squad-page-navigation-shim",
      resolveId(id) {
        return id === "next/navigation" ? "\0squad-page-navigation" : null;
      },
      load(id) {
        return id === "\0squad-page-navigation"
          ? "export function notFound() { return 'SAFE_DENIAL'; } export function useRouter() { return { refresh() {} }; }"
          : null;
      },
    }],
    resolve: {
      alias: {
        "next/navigation": resolve("tests/fixtures/squad-page-navigation.ts"),
      },
    },
    server: { middlewareMode: true },
  });

  [listPage, detailPage, loadingState, errorState, api] = await Promise.all([
    vite.ssrLoadModule("/app/teams/[slug]/squad/page.tsx"),
    vite.ssrLoadModule("/app/teams/[slug]/squad/[userId]/page.tsx"),
    vite.ssrLoadModule("/app/teams/[slug]/squad/loading.tsx"),
    vite.ssrLoadModule("/app/teams/[slug]/squad/error.tsx"),
    vite.ssrLoadModule("/app/api/teams/[slug]/players/[userId]/route.ts"),
  ]) as [ListPageModule, DetailPageModule, StateModule, StateModule, ApiModule];
});

test.after(async () => vite.close());

function memberContext(
  permissions: readonly PermissionCode[] = ["team.read", "players.read"],
): TeamAccessContext {
  return {
    ...ADMIN_CONTEXT,
    userId: "00000000-0000-4000-8000-000000000020",
    membership: {
      roleId: "00000000-0000-4000-8000-000000000011",
      roleSlug: "member",
      roleName: "Thành viên",
    },
    permissions,
  };
}

function html(element: unknown): string {
  return renderToStaticMarkup(element as React.ReactElement);
}

test("Squad list denies players.read before parsing or querying roster data", async () => {
  let queryCalls = 0;
  const output = await listPage.renderSquadPage({
    params: Promise.resolve({ slug: "pro7-fc" }),
    searchParams: Promise.resolve({ q: "must-not-be-read" }),
    requireTeamPermission: async (_slug, permission) => {
      assert.equal(permission, "players.read");
      return null;
    },
    listSquadPlayers: async () => {
      queryCalls += 1;
      return { ok: true, players: [] };
    },
    denied: () => "SAFE_DENIAL",
  });

  assert.equal(output, "SAFE_DENIAL");
  assert.equal(queryCalls, 0);
});

test("Squad list parses unsafe URL values into bounded filters before its server query", async () => {
  let captured: { teamId: string; filters: SquadFilters } | undefined;
  await listPage.renderSquadPage({
    params: Promise.resolve({ slug: "pro7-fc" }),
    searchParams: Promise.resolve({
      q: ["An", "ignored"],
      position: "DROP TABLE",
      status: "anything",
      sort: "admin_notes",
      direction: "sideways",
    }),
    requireTeamPermission: async () => ADMIN_CONTEXT,
    listSquadPlayers: async (teamId, filters) => {
      captured = { teamId, filters };
      return { ok: true, players: [] };
    },
    denied: () => "SAFE_DENIAL",
  });

  assert.deepEqual(captured, {
    teamId: "team-1",
    filters: {
      q: "",
      searchPattern: null,
      position: "all",
      status: "active",
      sort: "name",
      direction: "asc",
    },
  });
});

test("Squad list renders live counts, server-backed query links, and player detail targets", async () => {
  const output = await listPage.renderSquadPage({
    params: Promise.resolve({ slug: "pro7-fc" }),
    searchParams: Promise.resolve({ q: " An ", status: "active" }),
    requireTeamPermission: async () => ADMIN_CONTEXT,
    listSquadPlayers: async () => ({
      ok: true,
      players: [PLAYER, { ...PLAYER, userId: "00000000-0000-4000-8000-000000000012", displayName: "Bình", shirtNumber: 4, officialPosition: "DEF", playerStatus: "injured" }],
    }),
    listSquadPerformance: async (_teamId, userIds) => ({
      ok: true,
      players: userIds.map((userId) => ({ userId, recorded: false, appearances: 0, recentForm: [], minutes: 0, goals: 0, assists: 0, mvpCount: 0, averageRating: null })),
    }),
    denied: () => "SAFE_DENIAL",
  });
  const markup = html(output);

  assert.match(markup, /name="q"[^>]*value="An"/u);
  assert.match(markup, /href="\/teams\/pro7-fc\/squad\?q=An&amp;position=GK&amp;status=active/u);
  assert.match(markup, /name="sort"/u);
  assert.match(markup, /name="direction"/u);
  assert.match(markup, /Quân số<strong>2<\/strong>/u);
  assert.match(markup, /Sẵn sàng<strong>1<\/strong>/u);
  assert.match(markup, /Chấn thương<strong[^>]*>1<\/strong>/u);
  assert.match(markup, /href="\/teams\/pro7-fc\/squad\/00000000-0000-4000-8000-000000000010"/u);
  assert.match(markup, /Nguyễn An/u);
  assert.match(markup, /add-player-card/u);
  assert.doesNotMatch(markup, /Marcus Trent|David Silva|Liam Kompany|15 cầu thủ/u);
});

test("Squad list loads authoritative performance on the server and never substitutes zero for enrichment failure", async () => {
  let captured: { teamId: string; userIds: readonly string[] } | undefined;
  const output = await listPage.renderSquadPage({
    params: Promise.resolve({ slug: "pro7-fc" }),
    searchParams: Promise.resolve({}),
    requireTeamPermission: async () => ADMIN_CONTEXT,
    listSquadPlayers: async () => ({ ok: true, players: [PLAYER] }),
    listSquadPerformance: async (teamId, userIds) => {
      captured = { teamId, userIds };
      return {
        ok: true,
        players: [{ userId: PLAYER.userId, recorded: true, appearances: 2, recentForm: ["W", "L"], minutes: 135, goals: 2, assists: 1, mvpCount: 1, averageRating: 8 }],
      };
    },
    denied: () => "SAFE_DENIAL",
  });
  assert.deepEqual(captured, { teamId: "team-1", userIds: [PLAYER.userId] });
  const markup = html(output);
  assert.match(markup, /Phong độ \(2 trận\)/u);
  assert.match(markup, />W<|>W<\/span>/u);
  assert.match(markup, />L<|>L<\/span>/u);
  assert.match(markup, /135 phút/u);
  assert.match(markup, /2 bàn/u);
  assert.match(markup, /1 kiến tạo/u);
  assert.match(markup, /1 MVP/u);
  assert.match(markup, /8 điểm TB/u);

  const failed = await listPage.renderSquadPage({
    params: Promise.resolve({ slug: "pro7-fc" }),
    searchParams: Promise.resolve({}),
    requireTeamPermission: async () => ADMIN_CONTEXT,
    listSquadPlayers: async () => ({ ok: true, players: [PLAYER] }),
    listSquadPerformance: async () => ({ ok: false, error: "server" }),
    denied: () => "SAFE_DENIAL",
  });
  const failedMarkup = html(failed);
  assert.match(failedMarkup, /Không thể tải phong độ/u);
  assert.doesNotMatch(failedMarkup, /Chưa ra sân \(0 trận\)/u);
});

test("Squad page skips performance work when roster loading fails or has no visible players", async () => {
  for (const result of [
    { ok: false, error: "server" } as SquadListResult,
    { ok: true, players: [] } as SquadListResult,
  ]) {
    let performanceCalls = 0;
    await listPage.renderSquadPage({
      params: Promise.resolve({ slug: "pro7-fc" }),
      searchParams: Promise.resolve({}),
      requireTeamPermission: async () => ADMIN_CONTEXT,
      listSquadPlayers: async () => result,
      listSquadPerformance: async () => {
        performanceCalls += 1;
        return { ok: true, players: [] };
      },
      denied: () => "SAFE_DENIAL",
    });
    assert.equal(performanceCalls, 0);
  }
});

test("Squad list keeps honest empty and database-error states inside the player grid", async () => {
  for (const fixture of [
    { result: { ok: true, players: [] } as SquadListResult, label: "Chưa có cầu thủ", state: "empty" },
    { result: { ok: false, error: "server" } as SquadListResult, label: "Không thể tải đội hình", state: "error" },
  ]) {
    const output = await listPage.renderSquadPage({
      params: Promise.resolve({ slug: "pro7-fc" }),
      searchParams: Promise.resolve({}),
      requireTeamPermission: async () => ADMIN_CONTEXT,
      listSquadPlayers: async () => fixture.result,
      denied: () => "SAFE_DENIAL",
    });
    const markup = html(output);
    assert.match(markup, /squad-toolbar/u);
    assert.match(markup, new RegExp(`player-grid[^>]*data-state="${fixture.state}"`, "u"));
    assert.match(markup, new RegExp(fixture.label, "u"));
  }
});

test("Squad manager controls require both manage permissions", async () => {
  const onePermission = await listPage.renderSquadPage({
    params: Promise.resolve({ slug: "pro7-fc" }),
    searchParams: Promise.resolve({}),
    requireTeamPermission: async () => memberContext(["players.read", "players.manage"]),
    listSquadPlayers: async () => ({ ok: true, players: [PLAYER] }),
    listSquadPerformance: async () => ({ ok: true, players: [{ userId: PLAYER.userId, recorded: false, appearances: 0, recentForm: [], minutes: 0, goals: 0, assists: 0, mvpCount: 0, averageRating: null }] }),
    denied: () => "SAFE_DENIAL",
  });
  assert.doesNotMatch(html(onePermission), /add-player-card/u);

  const bothPermissions = await listPage.renderSquadPage({
    params: Promise.resolve({ slug: "pro7-fc" }),
    searchParams: Promise.resolve({}),
    requireTeamPermission: async () => ADMIN_CONTEXT,
    listSquadPlayers: async () => ({ ok: true, players: [PLAYER] }),
    listSquadPerformance: async () => ({ ok: true, players: [{ userId: PLAYER.userId, recorded: false, appearances: 0, recentForm: [], minutes: 0, goals: 0, assists: 0, mvpCount: 0, averageRating: null }] }),
    denied: () => "SAFE_DENIAL",
  });
  assert.match(html(bothPermissions), /add-player-card/u);

  const header = renderToStaticMarkup(createElement(Pro7RouteHeader, {
    team: ADMIN_CONTEXT.team,
    permissions: ["players.read", "players.manage"],
    pathname: "/teams/pro7-fc/squad",
    theme: "light",
    onThemeChange: () => {},
    onOpenMenu: () => {},
  }));
  assert.doesNotMatch(header, /header-cta|Thêm cầu thủ/u);
});

test("Squad detail denies missing read access and requests admin notes only for dual managers", async () => {
  let deniedQueries = 0;
  const denied = await detailPage.renderSquadPlayerPage({
    params: Promise.resolve({ slug: "pro7-fc", userId: PLAYER.userId }),
    requireTeamPermission: async () => null,
    getSquadPlayer: async () => {
      deniedQueries += 1;
      return { ok: true, player: DETAIL };
    },
    listAssignableSquadRoles: async () => { throw new Error("must not query roles"); },
    denied: () => "SAFE_DENIAL",
  });
  assert.equal(denied, "SAFE_DENIAL");
  assert.equal(deniedQueries, 0);

  for (const fixture of [
    { context: memberContext(), includeAdminNotes: false },
    { context: memberContext(["players.read", "players.manage"]), includeAdminNotes: false },
    { context: ADMIN_CONTEXT, includeAdminNotes: true },
  ]) {
    let captured: boolean | undefined;
    await detailPage.renderSquadPlayerPage({
      params: Promise.resolve({ slug: "pro7-fc", userId: PLAYER.userId }),
      requireTeamPermission: async () => fixture.context,
      getSquadPlayer: async (_teamId, _userId, includeAdminNotes) => {
        captured = includeAdminNotes;
        return { ok: true, player: DETAIL };
      },
      listAssignableSquadRoles: async () => ({ ok: true, roles: [DETAIL.role] }),
      denied: () => "SAFE_DENIAL",
    });
    assert.equal(captured, fixture.includeAdminNotes);
  }
});

test("Member detail renders safe profile fields without mutation controls or admin notes", async () => {
  const output = await detailPage.renderSquadPlayerPage({
    params: Promise.resolve({ slug: "pro7-fc", userId: PLAYER.userId }),
    requireTeamPermission: async () => memberContext(),
    getSquadPlayer: async () => ({
      ok: true,
      player: { ...DETAIL, adminNotes: "Không được lộ cho thành viên" },
    }),
    listAssignableSquadRoles: async () => { throw new Error("members must not query roles"); },
    denied: () => "SAFE_DENIAL",
  });
  const markup = html(output);

  for (const value of ["Nguyễn An", "0900000001", "10/05/2000", "175 cm", "68,5 kg", "MID", "ATT"]) {
    assert.match(markup, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
  }
  assert.doesNotMatch(markup, /Chỉnh sửa thông tin đội|Ghi chú quản trị|Ngừng hoạt động|adminNotes|Không được lộ cho thành viên/u);
});

test("Dual manager detail renders official edit and non-owner deactivate controls", async () => {
  const output = await detailPage.renderSquadPlayerPage({
    params: Promise.resolve({ slug: "pro7-fc", userId: PLAYER.userId }),
    requireTeamPermission: async () => ADMIN_CONTEXT,
    getSquadPlayer: async () => ({
      ok: true,
      player: { ...DETAIL, adminNotes: "Chỉ quản lý được xem" },
    }),
    listAssignableSquadRoles: async () => ({
      ok: true,
      roles: [
        DETAIL.role,
        { id: "00000000-0000-4000-8000-000000000013", name: "Đội trưởng", slug: "captain", isSystem: false },
      ],
    }),
    denied: () => "SAFE_DENIAL",
  });
  const markup = html(output);

  assert.match(markup, /Chỉnh sửa thông tin đội/u);
  assert.match(markup, /name="shirtNumber"/u);
  assert.match(markup, /name="roleId"/u);
  assert.match(markup, /value="00000000-0000-4000-8000-000000000011"[^>]*>Cầu thủ/u);
  assert.match(markup, /value="00000000-0000-4000-8000-000000000013"[^>]*>Đội trưởng/u);
  assert.match(markup, /name="officialPosition"/u);
  assert.match(markup, /name="playerStatus"/u);
  assert.match(markup, /name="joinDate"/u);
  assert.match(markup, /name="adminNotes"/u);
  assert.match(markup, /Chỉ quản lý được xem/u);
  assert.match(markup, /Ngừng hoạt động/u);
  assert.match(markup, /Nhập DEACTIVATE để xác nhận/u);
});

test("Owner target remains readable but never renders manager mutation controls", async () => {
  const output = await detailPage.renderSquadPlayerPage({
    params: Promise.resolve({ slug: "pro7-fc", userId: PLAYER.userId }),
    requireTeamPermission: async () => ADMIN_CONTEXT,
    getSquadPlayer: async () => ({
      ok: true,
      player: {
        ...DETAIL,
        role: { ...DETAIL.role, slug: "owner", name: "Chủ sở hữu" },
        adminNotes: "Không được lộ qua form",
      },
    }),
    listAssignableSquadRoles: async () => { throw new Error("owner role list must not be queried"); },
    denied: () => "SAFE_DENIAL",
  });
  const markup = html(output);

  assert.match(markup, /Chủ sở hữu/u);
  assert.doesNotMatch(markup, /Chỉnh sửa thông tin đội|Ngừng hoạt động|Không được lộ qua form/u);
});

test("Dual manager keeps official mutations but omits role change when assignable roles fail", async () => {
  const output = await detailPage.renderSquadPlayerPage({
    params: Promise.resolve({ slug: "pro7-fc", userId: PLAYER.userId }),
    requireTeamPermission: async () => ADMIN_CONTEXT,
    getSquadPlayer: async () => ({
      ok: true,
      player: { ...DETAIL, adminNotes: "Không được đưa vào form khi role query lỗi" },
    }),
    listAssignableSquadRoles: async () => ({ ok: false, error: "server" }),
    denied: () => "SAFE_DENIAL",
  });
  const markup = html(output);

  assert.match(markup, /Chỉnh sửa thông tin đội|name="shirtNumber"|Ngừng hoạt động/u);
  assert.match(markup, /Không được đưa vào form khi role query lỗi/u);
  assert.doesNotMatch(markup, /name="roleId"|Không thể tải quyền quản trị cầu thủ/u);
});

test("Dual manager without roles.read keeps official mutations with the current role ID", async () => {
  let canReadRoles: boolean | undefined;
  const output = await detailPage.renderSquadPlayerPage({
    params: Promise.resolve({ slug: "pro7-fc", userId: PLAYER.userId }),
    requireTeamPermission: async () => memberContext([
      "players.read",
      "players.manage",
      "members.manage",
    ]),
    getSquadPlayer: async () => ({
      ok: true,
      player: {
        ...DETAIL,
        role: {
          id: DETAIL.role.id,
          name: "Không có quyền xem vai trò",
          slug: "",
          isSystem: false,
          isVisible: false,
        },
        adminNotes: "Dual manager note",
      },
    }),
    listAssignableSquadRoles: async (_teamId, canRead) => {
      canReadRoles = canRead;
      return { ok: false, error: "server" };
    },
    denied: () => "SAFE_DENIAL",
  });

  assert.equal(canReadRoles, false);
  const markup = html(output);
  assert.match(markup, /Chỉnh sửa thông tin đội|name="shirtNumber"|Dual manager note|Ngừng hoạt động/u);
  assert.doesNotMatch(markup, /name="roleId"|Không thể tải quyền quản trị cầu thủ/u);
});

test("Squad loading and error boundaries preserve the roster surface with honest text", () => {
  const loadingMarkup = html(createElement(loadingState.default));
  assert.match(loadingMarkup, /squad-toolbar/u);
  assert.match(loadingMarkup, /player-grid[^>]*data-state="loading"/u);
  assert.match(loadingMarkup, /Đang tải đội hình/u);

  const errorMarkup = html(createElement(errorState.default, { reset: () => {} }));
  assert.match(errorMarkup, /squad-toolbar/u);
  assert.match(errorMarkup, /player-grid[^>]*data-state="error"/u);
  assert.match(errorMarkup, /Không thể tải đội hình/u);
  assert.match(errorMarkup, /Thử lại/u);
});

test("Player mutation route forwards only the URL target to the matching Task 3 action", async () => {
  const calls: Array<{ kind: string; target: { slug: string; userId: string } }> = [];
  const handlers = {
    async updateTeamPlayer(_request: Request, target: { slug: string; userId: string }) {
      calls.push({ kind: "update", target });
      return Response.json({ ok: true });
    },
    async deactivateTeamPlayer(_request: Request, target: { slug: string; userId: string }) {
      calls.push({ kind: "deactivate", target });
      return Response.json({ ok: true });
    },
  };
  const request = new Request("https://pro7.example/api/teams/pro7-fc/players/user-1", {
    method: "PATCH",
  });

  assert.equal((await api.mutatePlayerRoute("PATCH", request, Promise.resolve({ slug: "pro7-fc", userId: PLAYER.userId }), handlers)).status, 200);
  assert.equal((await api.mutatePlayerRoute("DELETE", request, Promise.resolve({ slug: "pro7-fc", userId: PLAYER.userId }), handlers)).status, 200);
  assert.deepEqual(calls, [
    { kind: "update", target: { slug: "pro7-fc", userId: PLAYER.userId } },
    { kind: "deactivate", target: { slug: "pro7-fc", userId: PLAYER.userId } },
  ]);
});
