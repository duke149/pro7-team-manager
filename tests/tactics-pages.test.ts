import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer, type ViteDevServer } from "vite";

import type { MatchSummary } from "../lib/matches/model";
import type { SquadListResult } from "../lib/squad/model";
import type { TeamAccessContext } from "../lib/teams/context";
import type { TacticsDetail, TacticsDetailResult, TacticsMatchesResult } from "../lib/tactics/model";
import { getTacticsDetail } from "../lib/tactics/queries";

const MATCH_ID = "00000000-0000-4000-8000-000000000101";
const USER_IDS = Array.from({ length: 9 }, (_, index) => `00000000-0000-4000-8000-${(index + 10).toString().padStart(12, "0")}`);
const MATCH: MatchSummary = {
  id: MATCH_ID, opponent: "Metro City", startsAt: "2026-10-19T12:30:00.000Z", venue: "Riverside",
  isHome: true, rsvpDeadline: "2026-10-18T12:30:00.000Z", status: "scheduled", teamScore: null,
  opponentScore: null, updatedAt: "2026-10-01T00:00:00.000Z",
  attendance: { invited: 0, available: 0, unavailable: 0, pending: 0 }, ownAttendance: null,
};
const PLAYERS = USER_IDS.map((userId, index) => ({
  userId, displayName: `Cầu thủ ${index + 1}`, shirtNumber: index + 1,
  officialPosition: index === 0 ? "GK" as const : index < 3 ? "DEF" as const : index < 6 ? "MID" as const : "ATT" as const,
}));
const DETAIL: TacticsDetail = {
  match: MATCH,
  players: PLAYERS,
  tactics: [{
    id: "00000000-0000-4000-8000-000000000201", mode: "balanced", formation: "2-3-1",
    instructions: "Giữ cự ly đội hình.", version: 2, pressing: "high", defensiveLine: "medium",
    status: "draft", updatedAt: "2026-10-02T00:00:00.000Z", appliedAt: null,
    slots: USER_IDS.map((userId, index) => ({ userId, slotKind: index < 7 ? "starter" as const : "bench" as const, slotKey: index < 7 ? `starter-${index + 1}` : `bench-${index - 6}`, roleLabel: index === 0 ? "GK" as const : index < 3 ? "DEF" as const : index < 6 ? "MID" as const : "ATT" as const, shirtNumber: index + 1, x: index === 0 ? 50 : 15 + index * 10, y: index === 0 ? 90 : 75 - index * 8 })),
  }],
};
const ADMIN: TeamAccessContext = { team: { id: "team-1", name: "PRO7 FC", slug: "pro7-fc" }, userId: "admin-1", membership: { roleId: "admin-role", roleSlug: "admin", roleName: "Admin" }, permissions: ["tactics.read", "tactics.manage", "matches.read", "players.read"] };
const MEMBER: TeamAccessContext = { ...ADMIN, userId: "member-1", membership: { roleId: "member-role", roleSlug: "member", roleName: "Member" }, permissions: ["tactics.read", "matches.read", "players.read"] };

type Landing = { renderTacticsPage(args: { params: Promise<{ slug: string }>; requireTeamPermission: () => Promise<TeamAccessContext | null>; listScheduledMatches: (teamId: string, userId: string) => Promise<TacticsMatchesResult>; denied: () => unknown }): Promise<unknown> };
type DetailPage = { renderTacticsMatchPage(args: { params: Promise<{ slug: string; matchId: string }>; requireTeamPermission: () => Promise<TeamAccessContext | null>; getTacticsDetail: (teamId: string, matchId: string, userId: string, canManage: boolean) => Promise<TacticsDetailResult>; denied: () => unknown }): Promise<unknown> };
let vite: ViteDevServer;
let landing: Landing;
let detailPage: DetailPage;

test.before(async () => {
  vite = await createServer({ appType: "custom", configFile: false, plugins: [{ name: "tactics-page-navigation", resolveId(id) { return id === "next/navigation" ? "\0tactics-navigation" : null; }, load(id) { return id === "\0tactics-navigation" ? "export function notFound(){return 'SAFE_DENIAL'}; export function useRouter(){return {refresh(){}}}" : null; } }], resolve: { alias: { "next/navigation": resolve("tests/fixtures/squad-page-navigation.ts") } }, server: { middlewareMode: true } });
  [landing, detailPage] = await Promise.all([vite.ssrLoadModule("/app/teams/[slug]/tactics/page.tsx"), vite.ssrLoadModule("/app/teams/[slug]/tactics/[matchId]/page.tsx")]) as [Landing, DetailPage];
});
test.after(async () => vite.close());
const html = (value: unknown) => renderToStaticMarkup(value as React.ReactElement);

test("tactics landing denies before reads and lists only live scheduled match links", async () => {
  let calls = 0;
  assert.equal(await landing.renderTacticsPage({ params: Promise.resolve({ slug: "pro7-fc" }), requireTeamPermission: async () => null, listScheduledMatches: async () => { calls += 1; return { ok: true, matches: [] }; }, denied: () => "SAFE_DENIAL" }), "SAFE_DENIAL");
  assert.equal(calls, 0);
  const output = await landing.renderTacticsPage({ params: Promise.resolve({ slug: "pro7-fc" }), requireTeamPermission: async () => ADMIN, listScheduledMatches: async (teamId, userId) => { assert.deepEqual([teamId, userId], ["team-1", "admin-1"]); return { ok: true, matches: [MATCH] }; }, denied: () => "SAFE_DENIAL" });
  const markup = html(output);
  assert.match(markup, /Metro City[\s\S]*Riverside/u);
  assert.match(markup, new RegExp(`/teams/pro7-fc/tactics/${MATCH_ID}`, "u"));
  assert.doesNotMatch(markup, /FC Spartans|J\. Smith|Marcus/u);
});

test("tactics landing and detail expose honest empty and error states", async () => {
  for (const [result, text, state] of [
    [{ ok: true, matches: [] }, "Chưa có trận đấu để lập chiến thuật", "empty"],
    [{ ok: false, error: "server" }, "Không thể tải chiến thuật", "error"],
  ] as const) {
    const output = await landing.renderTacticsPage({ params: Promise.resolve({ slug: "pro7-fc" }), requireTeamPermission: async () => ADMIN, listScheduledMatches: async () => result, denied: () => "SAFE_DENIAL" });
    assert.match(html(output), new RegExp(`data-state="${state}"[\\s\\S]*${text}`, "u"));
  }
  const memberEmpty = await detailPage.renderTacticsMatchPage({ params: Promise.resolve({ slug: "pro7-fc", matchId: MATCH_ID }), requireTeamPermission: async () => MEMBER, getTacticsDetail: async () => ({ ok: true, detail: { ...DETAIL, tactics: [] } }), denied: () => "SAFE_DENIAL" });
  assert.match(html(memberEmpty), /Chưa có chiến thuật đã áp dụng/u);
  const failed = await detailPage.renderTacticsMatchPage({ params: Promise.resolve({ slug: "pro7-fc", matchId: MATCH_ID }), requireTeamPermission: async () => ADMIN, getTacticsDetail: async () => ({ ok: false, error: "server" }), denied: () => "SAFE_DENIAL" });
  assert.match(html(failed), /data-state="error"[\s\S]*Không thể tải chiến thuật/u);
});

test("detail page preserves hosted tactics hierarchy for Admin and removes every mutation control for Member", async () => {
  for (const [context, canManage] of [[ADMIN, true], [MEMBER, false]] as const) {
    let queryCanManage: boolean | undefined;
    const model = canManage ? DETAIL : { ...DETAIL, tactics: DETAIL.tactics.map((tactic) => ({ ...tactic, status: "applied" as const, appliedAt: "2026-10-03T00:00:00.000Z" })) };
    const output = await detailPage.renderTacticsMatchPage({ params: Promise.resolve({ slug: "pro7-fc", matchId: MATCH_ID }), requireTeamPermission: async () => context, getTacticsDetail: async (_teamId, _matchId, _userId, requestedCanManage) => { queryCanManage = requestedCanManage; return { ok: true, detail: model }; }, denied: () => "SAFE_DENIAL" });
    const markup = html(output);
    assert.equal(queryCanManage, canManage);
    assert.match(markup, /tactics-toolbar[\s\S]*mode-toggle[\s\S]*tactics-layout[\s\S]*pitch-card[\s\S]*pitch[\s\S]*instruction-card[\s\S]*bench-card/u);
    assert.match(markup, /SƠ ĐỒ[\s\S]*Cân bằng[\s\S]*Tấn công[\s\S]*Phòng ngự/u);
    assert.match(markup, /Cầu thủ 1[\s\S]*Cầu thủ 8/u);
    assert.equal(markup.includes("Lưu bản nháp"), canManage);
    assert.equal(markup.includes("Áp dụng cho đội"), canManage);
    if (!canManage) assert.match(markup, /Chỉ đọc[\s\S]*Đã áp dụng/u);
  }
});

test("Member tactics query explicitly requests applied rows and maps only scheduled matches plus active squad records", async () => {
  const calls: Array<{ method: string; value: unknown }> = [];
  const row = {
    id: "00000000-0000-4000-8000-000000000201", mode: "balanced", formation: "2-3-1", instructions: null,
    version: 2, pressing: "high", defensive_line: "medium", status: "applied", updated_at: "2026-10-02T00:00:00.000Z",
    applied_at: "2026-10-03T00:00:00.000Z", slots: DETAIL.tactics[0].slots.map((slot) => ({ user_id: slot.userId, slot_kind: slot.slotKind, slot_key: slot.slotKey, role_label: slot.roleLabel, shirt_number: slot.shirtNumber, x: slot.x, y: slot.y })),
  };
  const query = { select(value: string) { calls.push({ method: "select", value }); return this; }, eq(column: string, value: unknown) { calls.push({ method: "eq", value: { column, value } }); return this; }, order(column: string, value: unknown) { calls.push({ method: "order", value: { column, value } }); return this; }, async limit(value: number) { calls.push({ method: "limit", value }); return { data: [row], error: null }; } };
  const squad: SquadListResult = { ok: true, players: PLAYERS.map((player) => ({ ...player, avatarPath: null, avatarUrl: null, membershipStatus: "active", role: { id: "role", name: "Member", slug: "member", isSystem: true }, playerStatus: "available", joinDate: "2026-01-01" })) };
  const result = await getTacticsDetail("team-1", MATCH_ID, "member-1", false, {
    listMatches: async () => ({ ok: true, matches: [MATCH] }),
    listSquadPlayers: async (_teamId, filters) => { assert.deepEqual(filters, { q: "", searchPattern: null, position: "all", status: "active", sort: "name", direction: "asc" }); return squad; },
    supabase: { from(table: string) { assert.equal(table, "match_tactics"); return query; } } as never,
  });
  assert.equal(result.ok, true);
  assert.ok(calls.some((call) => call.method === "eq" && JSON.stringify(call.value) === JSON.stringify({ column: "status", value: "applied" })));
  if (result.ok) assert.equal(result.detail.tactics.every((tactic) => tactic.status === "applied"), true);
});
