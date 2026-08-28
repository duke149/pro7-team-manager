import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer, type ViteDevServer } from "vite";

import type { MatchDetail, MatchDetailResult, MatchListResult, MatchSummary } from "../lib/matches/model";
import type { TeamAccessContext } from "../lib/teams/context";
import type { PermissionCode } from "../lib/teams/permissions";

const USER_ID = "00000000-0000-4000-8000-000000000010";
const MATCH_ID = "00000000-0000-4000-8000-000000000101";
const ADMIN: TeamAccessContext = {
  team: { id: "team-1", name: "PRO7 FC", slug: "pro7-fc" },
  userId: USER_ID,
  membership: { roleId: "role-admin", roleSlug: "admin", roleName: "Admin" },
  permissions: ["matches.read", "matches.manage", "matches.respond"],
};
const UPCOMING: MatchSummary = {
  id: MATCH_ID,
  opponent: "Metro City",
  startsAt: "2026-10-19T12:30:00.000Z",
  venue: "Riverside Turf",
  isHome: true,
  rsvpDeadline: "2026-10-18T12:30:00.000Z",
  status: "scheduled",
  teamScore: null,
  opponentScore: null,
  updatedAt: "2026-10-01T00:00:00.000Z",
  attendance: { invited: 15, available: 10, unavailable: 2, pending: 3 },
  ownAttendance: { status: "pending", updatedAt: "2026-10-02T00:00:00.000Z" },
};
const COMPLETED: MatchSummary = {
  ...UPCOMING,
  id: "00000000-0000-4000-8000-000000000100",
  opponent: "Rovers FC",
  startsAt: "2026-10-12T12:30:00.000Z",
  status: "completed",
  teamScore: 3,
  opponentScore: 1,
  ownAttendance: null,
};
const DETAIL: MatchDetail = {
  match: UPCOMING,
  attendance: [{ userId: USER_ID, displayName: "Nguyễn An", status: "pending", note: null, respondedAt: null, updatedAt: "2026-10-02T00:00:00.000Z" }],
  events: [],
  playerStats: [],
  teamMetrics: null,
  inviteCandidates: [
    { userId: USER_ID, displayName: "Nguyễn An", invited: true },
    { userId: "00000000-0000-4000-8000-000000000011", displayName: "Bình", invited: false },
  ],
  analysisCandidates: [],
};

type ListPage = { renderMatchesPage(args: {
  params: Promise<{ slug: string }>;
  requireTeamPermission: (slug: string, permission: PermissionCode) => Promise<TeamAccessContext | null>;
  listMatches: (teamId: string, userId: string) => Promise<MatchListResult>;
  denied: () => unknown;
  now?: string;
}): Promise<unknown> };
type DetailPage = { renderMatchDetailPage(args: {
  params: Promise<{ slug: string; matchId: string }>;
  requireTeamPermission: (slug: string, permission: PermissionCode) => Promise<TeamAccessContext | null>;
  getMatchDetail: (teamId: string, matchId: string, userId: string, includeInvites: boolean) => Promise<MatchDetailResult>;
  denied: () => unknown;
}): Promise<unknown> };
type StateModule = { default: (props: { reset?: () => void }) => unknown };
type CollectionRoute = { mutateMatchesRoute(request: Request, params: Promise<{ slug: string }>, handler: (request: Request, target: { slug: string }) => Promise<Response>): Promise<Response> };
type MatchRoute = { mutateMatchRoute(request: Request, params: Promise<{ slug: string; matchId: string }>, handler: (request: Request, target: { slug: string; matchId: string }) => Promise<Response>): Promise<Response> };

let vite: ViteDevServer;
let listPage: ListPage;
let detailPage: DetailPage;
let loading: StateModule;
let error: StateModule;
let collectionRoute: CollectionRoute;
let matchRoute: MatchRoute;
let attendanceRoute: MatchRoute;
let analysisRoute: MatchRoute;

test.before(async () => {
  vite = await createServer({
    appType: "custom",
    configFile: false,
    plugins: [{
      name: "matches-navigation-shim",
      resolveId(id) { return id === "next/navigation" ? "\0matches-navigation" : null; },
      load(id) { return id === "\0matches-navigation" ? "export function notFound(){return 'SAFE_DENIAL'}; export function useRouter(){return {refresh(){}}}" : null; },
    }],
    resolve: { alias: { "next/navigation": resolve("tests/fixtures/squad-page-navigation.ts") } },
    server: { middlewareMode: true },
  });
  [listPage, detailPage, loading, error, collectionRoute, matchRoute, attendanceRoute, analysisRoute] = await Promise.all([
    vite.ssrLoadModule("/app/teams/[slug]/matches/page.tsx"),
    vite.ssrLoadModule("/app/teams/[slug]/matches/[matchId]/page.tsx"),
    vite.ssrLoadModule("/app/teams/[slug]/matches/loading.tsx"),
    vite.ssrLoadModule("/app/teams/[slug]/matches/error.tsx"),
    vite.ssrLoadModule("/app/api/teams/[slug]/matches/route.ts"),
    vite.ssrLoadModule("/app/api/teams/[slug]/matches/[matchId]/route.ts"),
    vite.ssrLoadModule("/app/api/teams/[slug]/matches/[matchId]/attendance/route.ts"),
    vite.ssrLoadModule("/app/api/teams/[slug]/matches/[matchId]/analysis/route.ts"),
  ]) as [ListPage, DetailPage, StateModule, StateModule, CollectionRoute, MatchRoute, MatchRoute, MatchRoute];
});
test.after(async () => vite.close());
function html(value: unknown) { return renderToStaticMarkup(value as React.ReactElement); }

test("matches list denies before querying and renders hosted hierarchy from live props without demo values", async () => {
  let calls = 0;
  const denied = await listPage.renderMatchesPage({
    params: Promise.resolve({ slug: "pro7-fc" }),
    requireTeamPermission: async (_slug, permission) => { assert.equal(permission, "matches.read"); return null; },
    listMatches: async () => { calls += 1; return { ok: true, matches: [] }; },
    denied: () => "SAFE_DENIAL",
  });
  assert.equal(denied, "SAFE_DENIAL");
  assert.equal(calls, 0);

  const rendered = await listPage.renderMatchesPage({
    params: Promise.resolve({ slug: "pro7-fc" }),
    requireTeamPermission: async () => ADMIN,
    listMatches: async (teamId, userId) => { assert.deepEqual([teamId, userId], ["team-1", USER_ID]); return { ok: true, matches: [COMPLETED, UPCOMING] }; },
    denied: () => "SAFE_DENIAL",
    now: "2026-10-10T00:00:00.000Z",
  });
  const markup = html(rendered);
  assert.match(markup, /match-center/u);
  assert.match(markup, /confirmed-card[\s\S]*rsvp-card[\s\S]*analysis-card[\s\S]*fixtures-card/u);
  assert.match(markup, /PRO7 FC[\s\S]*Metro City[\s\S]*Riverside Turf/u);
  assert.match(markup, /10<\/strong>\/15 đã xác nhận/u);
  assert.match(markup, /3[\s\S]*–[\s\S]*1[\s\S]*Rovers FC/u);
  assert.match(markup, /analysis-outcome win[^>]*>THẮNG</u);
  assert.match(markup, /score-board win/u);
  assert.match(markup, /match-history-score-pill win[^>]*>3 – 1<\/span>[\s\S]*match-result-pill win[^>]*>THẮNG/u);
  assert.match(markup, new RegExp(`/teams/pro7-fc/matches/${MATCH_ID}`, "u"));
  assert.doesNotMatch(markup, /FC Spartans|J\. Smith|Northside FC|Có thể/u);
});

test("matches list exposes Admin create controls, Member own RSVP only, and honest empty/error/loading states", async () => {
  for (const fixture of [
    { context: ADMIN, result: { ok: true, matches: [] } as MatchListResult, label: "Chưa có trận đấu", state: "empty", showsAdminControls: true },
    { context: { ...ADMIN, permissions: ["matches.read", "matches.respond"] as const }, result: { ok: true, matches: [UPCOMING] } as MatchListResult, label: "Bạn có tham gia?", state: "ready", showsAdminControls: false },
    { context: ADMIN, result: { ok: false, error: "server" } as MatchListResult, label: "Không thể tải trận đấu", state: "error", showsAdminControls: false },
  ]) {
    const output = await listPage.renderMatchesPage({ params: Promise.resolve({ slug: "pro7-fc" }), requireTeamPermission: async () => fixture.context, listMatches: async () => fixture.result, denied: () => "SAFE_DENIAL", now: "2026-10-10T00:00:00.000Z" });
    const markup = html(output);
    assert.match(markup, new RegExp(`match-center[^>]*data-state="${fixture.state}"`, "u"));
    assert.match(markup, new RegExp(fixture.label, "u"));
    assert.equal(/Xếp lịch trận đấu/u.test(markup), fixture.showsAdminControls);
    if (!fixture.showsAdminControls) assert.doesNotMatch(markup, /Chỉnh sửa trận|Hủy trận|Hoàn tất trận|Mời thành viên/u);
  }
  assert.match(html(loading.default({})), /data-state="loading"[\s\S]*Đang tải trận đấu/u);
  assert.match(html(error.default({ reset() {} })), /data-state="error"[\s\S]*Không thể tải trận đấu[\s\S]*Thử lại/u);
});

test("match detail gates read access and keeps Admin lifecycle/invite controls off Member pages", async () => {
  for (const fixture of [
    { context: ADMIN, canManage: true },
    { context: { ...ADMIN, permissions: ["matches.read", "matches.respond"] as const }, canManage: false },
  ]) {
    let includeInvites: boolean | undefined;
    const output = await detailPage.renderMatchDetailPage({
      params: Promise.resolve({ slug: "pro7-fc", matchId: MATCH_ID }),
      requireTeamPermission: async () => fixture.context,
      getMatchDetail: async (_teamId, _matchId, _userId, include) => { includeInvites = include; return { ok: true, detail: DETAIL }; },
      denied: () => "SAFE_DENIAL",
    });
    const markup = html(output);
    assert.equal(includeInvites, fixture.canManage);
    assert.match(markup, /Metro City[\s\S]*Nguyễn An/u);
    for (const label of ["Chỉnh sửa trận", "Hủy trận", "Hoàn tất trận", "Mời thành viên"]) {
      assert.equal(markup.includes(label), fixture.canManage, label);
    }
    if (fixture.canManage) {
      assert.equal(markup.match(/type="checkbox" checked=""/gu)?.length, 2);
    } else {
      assert.match(markup, /Có[\s\S]*Không/u);
    }
  }
});

test("completed detail shows the analysis editor only to Admin and never fabricates missing metrics", async () => {
  const completedDetail: MatchDetail = {
    ...DETAIL,
    match: COMPLETED,
    analysisCandidates: [{ userId: USER_ID, displayName: "Nguyễn An" }],
  };
  for (const fixture of [
    { context: ADMIN, editor: true },
    { context: { ...ADMIN, permissions: ["matches.read", "matches.respond"] as const }, editor: false },
  ]) {
    const output = await detailPage.renderMatchDetailPage({
      params: Promise.resolve({ slug: "pro7-fc", matchId: COMPLETED.id }),
      requireTeamPermission: async () => fixture.context,
      getMatchDetail: async () => ({ ok: true, detail: completedDetail }),
      denied: () => "SAFE_DENIAL",
    });
    const markup = html(output);
    assert.match(markup, /analysis-outcome win[^>]*>THẮNG/u);
    assert.match(markup, /score-board win/u);
    assert.match(markup, /match-detail-result match-result-pill win[^>]*>THẮNG · 3 – 1/u);
    assert.equal(markup.includes("Ghi nhận diễn biến &amp; thống kê"), fixture.editor);
    assert.match(markup, /Chưa ghi nhận chỉ số hai đội/u);
    assert.doesNotMatch(markup, />58%<|>42%<|>14<\/b>/u);
  }
});

test("Admin attendance reconciliation distinguishes tentative players from the confirmed seven", async () => {
  const tentativeDetail: MatchDetail = {
    ...DETAIL,
    match: { ...DETAIL.match, attendance: { invited: 4, available: 2, unavailable: 1, pending: 1 } },
    attendance: [
      { userId: USER_ID, displayName: "Nguyễn An", status: "available", note: null, respondedAt: "2026-10-03T00:00:00.000Z", updatedAt: "2026-10-03T00:00:00.000Z" },
      { userId: "00000000-0000-4000-8000-000000000011", displayName: "Bình", status: "available", note: "Có thể tham gia — chưa chắc chắn.", respondedAt: "2026-10-03T00:00:00.000Z", updatedAt: "2026-10-03T00:00:00.000Z" },
      { userId: "00000000-0000-4000-8000-000000000012", displayName: "Cường", status: "unavailable", note: null, respondedAt: "2026-10-03T00:00:00.000Z", updatedAt: "2026-10-03T00:00:00.000Z" },
      { userId: "00000000-0000-4000-8000-000000000013", displayName: "Dũng", status: "pending", note: null, respondedAt: null, updatedAt: "2026-10-03T00:00:00.000Z" },
    ],
  };
  const output = await detailPage.renderMatchDetailPage({ params: Promise.resolve({ slug: "pro7-fc", matchId: MATCH_ID }), requireTeamPermission: async () => ADMIN, getMatchDetail: async () => ({ ok: true, detail: tentativeDetail }), denied: () => "SAFE_DENIAL" });
  const markup = html(output);
  assert.match(markup, /Đội hình chính \(7 người\)[\s\S]*1\/7/u);
  assert.equal(markup.match(/>Đội chính</gu)?.length, 1);
  assert.match(markup, /Chưa chắc chắn[\s\S]*Bình[\s\S]*Có thể/u);
  assert.match(markup, /Vắng mặt &amp; Đang chờ[\s\S]*Cường[\s\S]*Vắng[\s\S]*Dũng[\s\S]*Đang chờ/u);
});

test("match API routes forward decoded targets to their server authority handlers", async () => {
  const request = new Request("https://pro7.example/api", { method: "POST" });
  const response = new Response("OK");
  assert.equal(await collectionRoute.mutateMatchesRoute(request, Promise.resolve({ slug: "pro7-fc" }), async (actualRequest, target) => { assert.equal(actualRequest, request); assert.deepEqual(target, { slug: "pro7-fc" }); return response; }), response);
  for (const route of [matchRoute, attendanceRoute, analysisRoute]) {
    assert.equal(await route.mutateMatchRoute(request, Promise.resolve({ slug: "pro7-fc", matchId: MATCH_ID }), async (actualRequest, target) => { assert.equal(actualRequest, request); assert.deepEqual(target, { slug: "pro7-fc", matchId: MATCH_ID }); return response; }), response);
  }
});
