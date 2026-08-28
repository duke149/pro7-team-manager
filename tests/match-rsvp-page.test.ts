import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer, type ViteDevServer } from "vite";

import type { MatchDetail, MatchDetailResult } from "../lib/matches/model";
import type { TeamAccessContext } from "../lib/teams/context";
import type { PermissionCode } from "../lib/teams/permissions";

const USER_ID = "00000000-0000-4000-8000-000000000010";
const MATCH_ID = "00000000-0000-4000-8000-000000000101";
const CONTEXT: TeamAccessContext = { team: { id: "team-1", name: "FC NÁT", slug: "nat-fc" }, userId: USER_ID, membership: { roleId: "role-member", roleSlug: "member", roleName: "Member" }, permissions: ["matches.read", "matches.respond"] };
const DETAIL: MatchDetail = { match: { id: MATCH_ID, opponent: "FC NAT", startsAt: "2026-09-06T02:00:00.000Z", venue: "Sân CK2", isHome: true, rsvpDeadline: "2026-09-05T12:00:00.000Z", status: "scheduled", teamScore: null, opponentScore: null, updatedAt: "2026-08-28T00:00:00.000Z", attendance: { invited: 1, available: 0, unavailable: 0, pending: 1 }, ownAttendance: { status: "pending", updatedAt: "2026-08-28T00:00:00.000Z" } }, attendance: [{ userId: USER_ID, status: "pending", note: null, respondedAt: null, updatedAt: "2026-08-28T00:00:00.000Z", displayName: "Nguyễn Hùng" }], events: [], playerStats: [], teamMetrics: null, inviteCandidates: [], analysisCandidates: [] };
type PageModule = { renderMatchRsvpPage(args: { params: Promise<{ slug: string; matchId: string }>; requireTeamPermission: (slug: string, permission: PermissionCode) => Promise<TeamAccessContext | null>; getMatchDetail: (teamId: string, matchId: string, userId: string, includeInvites: boolean) => Promise<MatchDetailResult>; denied: () => unknown; now?: string }): Promise<unknown> };
type StateModule = { default(props: { reset?: () => void }): unknown };
let vite: ViteDevServer; let page: PageModule; let loading: StateModule; let error: StateModule;

test.before(async () => {
  vite = await createServer({ appType: "custom", configFile: false, resolve: { alias: { "next/navigation": resolve("tests/fixtures/squad-page-navigation.ts") } }, server: { middlewareMode: true } });
  [page, loading, error] = await Promise.all([vite.ssrLoadModule("/app/teams/[slug]/matches/[matchId]/rsvp/page.tsx"), vite.ssrLoadModule("/app/teams/[slug]/matches/[matchId]/rsvp/loading.tsx"), vite.ssrLoadModule("/app/teams/[slug]/matches/[matchId]/rsvp/error.tsx")]) as [PageModule, StateModule, StateModule];
});
test.after(async () => vite.close());
const html = (value: unknown) => renderToStaticMarkup(value as React.ReactElement);

test("RSVP page denies before query and binds the verified account to its own invite", async () => {
  let calls = 0;
  const denied = await page.renderMatchRsvpPage({ params: Promise.resolve({ slug: "nat-fc", matchId: MATCH_ID }), requireTeamPermission: async (_slug, permission) => { assert.equal(permission, "matches.read"); return null; }, getMatchDetail: async () => { calls += 1; return { ok: true, detail: DETAIL }; }, denied: () => "SAFE_DENIAL" });
  assert.equal(denied, "SAFE_DENIAL"); assert.equal(calls, 0);
  const output = await page.renderMatchRsvpPage({ params: Promise.resolve({ slug: "nat-fc", matchId: MATCH_ID }), requireTeamPermission: async () => CONTEXT, getMatchDetail: async (teamId, matchId, userId, includeInvites) => { assert.deepEqual([teamId, matchId, userId, includeInvites], ["team-1", MATCH_ID, USER_ID, false]); return { ok: true, detail: DETAIL }; }, denied: () => "SAFE_DENIAL", now: "2026-08-28T00:00:00.000Z" });
  const markup = html(output);
  assert.match(markup, /Xác nhận tham gia[\s\S]*FC NÁT[\s\S]*FC NAT/u);
  for (const choice of ["Có", "Có thể", "Không"]) assert.match(markup, new RegExp(`>${choice}<`, "u"));
  assert.doesNotMatch(markup, new RegExp(USER_ID, "u"));
});

test("RSVP page renders honest non-invitee and closed states", async () => {
  const nonInvitee = { ...DETAIL, match: { ...DETAIL.match, ownAttendance: null }, attendance: [] };
  const output = await page.renderMatchRsvpPage({ params: Promise.resolve({ slug: "nat-fc", matchId: MATCH_ID }), requireTeamPermission: async () => CONTEXT, getMatchDetail: async () => ({ ok: true, detail: nonInvitee }), denied: () => "SAFE_DENIAL", now: "2026-08-28T00:00:00.000Z" });
  const markup = html(output);
  assert.match(markup, /Bạn chưa được mời/u);
  assert.doesNotMatch(markup, /data-rsvp-choice/u);

  const completed = { ...DETAIL, match: { ...DETAIL.match, status: "completed" as const, teamScore: 2, opponentScore: 1 } };
  const closed = await page.renderMatchRsvpPage({ params: Promise.resolve({ slug: "nat-fc", matchId: MATCH_ID }), requireTeamPermission: async () => CONTEXT, getMatchDetail: async () => ({ ok: true, detail: completed }), denied: () => "SAFE_DENIAL", now: "2026-08-28T00:00:00.000Z" });
  assert.match(html(closed), /Trận đấu đã đóng xác nhận/u);
  assert.doesNotMatch(html(closed), /data-rsvp-choice/u);
  assert.match(html(loading.default({})), /Đang tải lời mời/u);
  assert.match(html(error.default({ reset() {} })), /Không thể tải lời mời[\s\S]*Thử lại/u);
});
