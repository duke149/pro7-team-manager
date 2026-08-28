import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer, type ViteDevServer } from "vite";

import type { MatchSummary } from "../lib/matches/model";
import type { OverviewResult } from "../lib/overview/model";
import type { TeamAccessContext } from "../lib/teams/context";
import type { PermissionCode } from "../lib/teams/permissions";

const USER_ID = "00000000-0000-4000-8000-000000000010";
const MATCH_ID = "00000000-0000-4000-8000-000000000101";
const ADMIN: TeamAccessContext = {
  team: { id: "team-1", name: "PRO7 FC", slug: "pro7-fc" },
  userId: USER_ID,
  membership: { roleId: "role-admin", roleSlug: "admin", roleName: "Admin" },
  permissions: ["team.read", "matches.read", "matches.manage", "matches.respond", "tactics.read", "news.read"],
};
const MEMBER: TeamAccessContext = {
  ...ADMIN,
  membership: { roleId: "role-member", roleSlug: "member", roleName: "Thành viên" },
  permissions: ["team.read", "matches.read", "matches.respond", "tactics.read", "news.read"],
};
const NEXT_MATCH: MatchSummary = {
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
const READY: OverviewResult = {
  ok: true,
  data: {
    nextMatch: NEXT_MATCH,
    countdown: { days: 9, hours: 12, minutes: 30 },
    attendance: { invited: 15, available: 10, unavailable: 2, pending: 3, confirmedPercent: 67 },
    statistics: {
      completedMatches: 6,
      wins: 3,
      draws: 2,
      losses: 1,
      winRate: 50,
      recentForm: ["W", "D", "W", "L", "D"],
      recentPoints: 8,
      topScorer: { userId: "00000000-0000-4000-8000-000000000020", displayName: "Nguyễn An", goals: 7 },
    },
    news: [
      { id: "00000000-0000-4000-8000-000000000204", title: "Họp chiến thuật", body: "Toàn đội tập trung trước trận.", publishedAt: "2026-10-09T09:00:00.000Z" },
      { id: "00000000-0000-4000-8000-000000000203", title: "Tin đội hai", body: "Nội dung hai.", publishedAt: "2026-10-08T09:00:00.000Z" },
      { id: "00000000-0000-4000-8000-000000000202", title: "Tin đội ba", body: "Nội dung ba.", publishedAt: "2026-10-07T09:00:00.000Z" },
      { id: "00000000-0000-4000-8000-000000000201", title: "Tin đội bốn", body: "Nội dung bốn.", publishedAt: "2026-10-06T09:00:00.000Z" },
    ],
    managedNews: null,
    calendar: [NEXT_MATCH],
  },
};
const EMPTY: OverviewResult = {
  ok: true,
  data: {
    nextMatch: null,
    countdown: null,
    attendance: null,
    statistics: { completedMatches: 0, wins: 0, draws: 0, losses: 0, winRate: null, recentForm: [], recentPoints: 0, topScorer: null },
    news: [],
    managedNews: null,
    calendar: [],
  },
};

type OverviewPageModule = {
  renderOverviewPage(arguments_: {
    params: Promise<{ slug: string }>;
    requireTeamPermission: (slug: string, permission: PermissionCode) => Promise<TeamAccessContext | null>;
    loadOverview: (teamId: string, userId: string, now: string, access: { matches: boolean; news: boolean; manageNews: boolean }) => Promise<OverviewResult>;
    denied: () => unknown;
    now?: string;
  }): Promise<unknown>;
};

let vite: ViteDevServer;
let overview: OverviewPageModule;

test.before(async () => {
  vite = await createServer({
    appType: "custom",
    configFile: false,
    plugins: [{
      name: "overview-navigation-shim",
      resolveId(id) { return id === "next/navigation" ? "\0overview-navigation" : null; },
      load(id) { return id === "\0overview-navigation" ? "export function notFound(){return 'SAFE_DENIAL'}" : null; },
    }],
    resolve: { alias: { "next/navigation": resolve("tests/fixtures/squad-page-navigation.ts") } },
    server: { middlewareMode: true },
  });
  overview = await vite.ssrLoadModule("/app/teams/[slug]/overview/page.tsx") as OverviewPageModule;
});

test.after(async () => vite.close());

function html(value: unknown): string {
  return renderToStaticMarkup(value as React.ReactElement);
}

async function render(context: TeamAccessContext, result: OverviewResult, expectedNow = "2026-10-10T00:00:00.000Z") {
  return overview.renderOverviewPage({
    params: Promise.resolve({ slug: "pro7-fc" }),
    requireTeamPermission: async () => context,
    loadOverview: async (teamId, userId, actualNow, access) => {
      assert.deepEqual([teamId, userId, actualNow], ["team-1", USER_ID, expectedNow]);
      assert.deepEqual(access, {
        matches: context.permissions.includes("matches.read"),
        news: context.permissions.includes("news.read"),
        manageNews: context.permissions.includes("news.manage"),
      });
      return result;
    },
    denied: () => "SAFE_DENIAL",
    now: expectedNow,
  });
}

test("Overview denies team.read before loading protected aggregates", async () => {
  let queryCalls = 0;
  const output = await overview.renderOverviewPage({
    params: Promise.resolve({ slug: "pro7-fc" }),
    requireTeamPermission: async (_slug, permission) => {
      assert.equal(permission, "team.read");
      return null;
    },
    loadOverview: async () => { queryCalls += 1; return READY; },
    denied: () => "SAFE_DENIAL",
  });

  assert.equal(output, "SAFE_DENIAL");
  assert.equal(queryCalls, 0);
});

test("Overview preserves hosted card/control order with live data and real entity links", async () => {
  const markup = html(await render(ADMIN, READY));

  assert.match(markup, /dashboard-view[^>]*data-state="ready"/u);
  assert.match(markup, /match-hero[\s\S]*availability-card[\s\S]*stats-grid[\s\S]*TỈ LỆ THẮNG[\s\S]*PHONG ĐỘ GẦN ĐÂY[\s\S]*VUA PHÁ LƯỚI[\s\S]*THỨ HẠNG[\s\S]*Tin mới[\s\S]*Xem tất cả[\s\S]*Sắp diễn ra[\s\S]*Mở lịch/u);
  assert.match(markup, /PRO7 FC[\s\S]*Metro City[\s\S]*Riverside Turf/u);
  assert.match(markup, /10\/15[\s\S]*10[\s\S]*Sẵn sàng[\s\S]*3[\s\S]*Chờ trả lời[\s\S]*2[\s\S]*Vắng mặt/u);
  assert.match(markup, /conic-gradient\(var\(--accent\) 0 67%/u);
  assert.doesNotMatch(markup, /var\(--lime\)/u);
  assert.match(markup, /50%[\s\S]*3 thắng • 2 hòa • 1 thua/u);
  assert.match(markup, /Nguyễn An[\s\S]*7[\s\S]*BÀN/u);
  assert.match(markup, /Họp chiến thuật[\s\S]*Toàn đội tập trung trước trận/u);
  assert.match(markup, new RegExp(`href="/teams/pro7-fc/tactics/${MATCH_ID}"[^>]*>[\\s\\S]*Chốt đội hình`, "u"));
  assert.match(markup, new RegExp(`href="/teams/pro7-fc/matches/${MATCH_ID}"[^>]*>Chi tiết trận`, "u"));
  assert.match(markup, /<button[^>]*>[\s\S]*Nhắc người chưa trả lời<\/button>/u);
  assert.match(markup, new RegExp(`<time[^>]*dateTime="${NEXT_MATCH.startsAt}"`, "u"));
  assert.doesNotMatch(markup, /Tin đội bốn/u);
  assert.doesNotMatch(markup, /FC Spartans|J\. Davis|Northside FC|68%|12 thắng/u);
});

test("Overview never exposes reminder/manage controls to members", async () => {
  const markup = html(await render(MEMBER, READY));

  assert.doesNotMatch(markup, /Nhắc người chưa trả lời/u);
  assert.match(markup, new RegExp(`href="/teams/pro7-fc/matches/${MATCH_ID}"[^>]*>[\\s\\S]*Xác nhận tham gia`, "u"));

  const closedMarkup = html(await render(MEMBER, READY, "2026-10-18T12:30:00.001Z"));
  assert.doesNotMatch(closedMarkup, /Xác nhận tham gia/u);
  assert.match(closedMarkup, /Đã hết hạn xác nhận/u);
});

test("Overview renders denied match and tactics destinations as non-interactive content", async () => {
  const context: TeamAccessContext = {
    ...MEMBER,
    permissions: ["team.read", "news.read"],
  };
  const markup = html(await render(context, READY));

  assert.match(markup, /Chốt đội hình[\s\S]*Chi tiết trận/u);
  assert.doesNotMatch(markup, /href="\/teams\/pro7-fc\/(?:matches|tactics)/u);
  assert.match(markup, /Mở lịch/u);
  assert.match(markup, /PHONG ĐỘ GẦN ĐÂY/u);
  assert.match(markup, /stat-card-interactive[\s\S]*overview-disabled-control/u);
});

test("Overview empty and error states do not invent statistics, news, opponents, or counts", async () => {
  const emptyMarkup = html(await render(ADMIN, EMPTY));
  assert.match(emptyMarkup, /data-state="empty"[\s\S]*Chưa có trận sắp tới/u);
  assert.match(emptyMarkup, /Chưa có kết quả hoàn tất[\s\S]*Chưa có phong độ[\s\S]*Chưa có dữ liệu ghi bàn[\s\S]*Chưa có dữ liệu xếp hạng/u);
  assert.match(emptyMarkup, /Chưa có tin mới[\s\S]*Chưa có lịch sắp tới/u);
  assert.doesNotMatch(emptyMarkup, /\d+%|thắng •|BÀN|Nhắc người/u);

  const errorMarkup = html(await render(ADMIN, { ok: false, error: "server" }));
  assert.match(errorMarkup, /data-state="error"[\s\S]*Không thể tải tổng quan/u);
  assert.doesNotMatch(errorMarkup, /Metro City|Nguyễn An|Nhắc người|Chốt đội hình/u);
});
