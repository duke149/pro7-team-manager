import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer, type ViteDevServer } from "vite";

import type { FundsResult } from "../lib/funds/model";
import type { TeamAccessContext } from "../lib/teams/context";
import type { PermissionCode } from "../lib/teams/permissions";

const ADMIN: TeamAccessContext = { team: { id: "team-1", name: "PRO7 FC", slug: "pro7-fc" }, userId: "user-1", membership: { roleId: "role-1", roleSlug: "admin", roleName: "Admin" }, permissions: ["finance.read", "finance.manage"] };
const RESULT: FundsResult = { ok: true, data: { periodStart: "2026-10-01", balanceVnd: 1_750_000, monthIncomeVnd: 500_000, monthIncomeCount: 1, monthExpenseVnd: 750_000, monthExpenseCount: 1, pendingDuesVnd: 500_000, pendingDuesCount: 1, paidDuesCount: 1, totalDuesCount: 2, dues: [{ id: "00000000-0000-4000-8000-000000000021", userId: "00000000-0000-4000-8000-000000000002", displayName: "Nguyễn An", periodStart: "2026-10-01", amountVnd: 500_000, dueDate: "2026-10-10", status: "pending", paidAt: null, financeEntryId: null, updatedAt: "2026-10-01T08:00:00.000Z" }], recentEntries: [{ id: "00000000-0000-4000-8000-000000000011", direction: "expense", amountVnd: 750_000, category: "equipment", occurredOn: "2026-10-24", description: "Mua bóng", createdAt: "2026-10-24T08:00:00.000Z", updatedAt: "2026-10-24T08:00:00.000Z" }] } };

type Page = { renderFundsPage(args: { params: Promise<{ slug: string }>; requireTeamPermission: (slug: string, permission: PermissionCode) => Promise<TeamAccessContext | null>; getFunds: (teamId: string, periodStart: string) => Promise<FundsResult>; denied: () => unknown; periodStart?: string }): Promise<unknown> };
type Route = { mutateFundsRoute(request: Request, params: Promise<{ slug: string }>, handler: (request: Request, target: { slug: string }) => Promise<Response>): Promise<Response> };
let vite: ViteDevServer; let page: Page; let entries: Route; let dues: Route;
test.before(async () => { vite = await createServer({ appType: "custom", configFile: false, resolve: { alias: { "next/navigation": resolve("tests/fixtures/squad-page-navigation.ts") } }, server: { middlewareMode: true } }); [page, entries, dues] = await Promise.all([vite.ssrLoadModule("/app/teams/[slug]/funds/page.tsx"), vite.ssrLoadModule("/app/api/teams/[slug]/funds/entries/route.ts"), vite.ssrLoadModule("/app/api/teams/[slug]/funds/dues/route.ts")]) as [Page, Route, Route]; });
test.after(async () => vite.close());

test("funds denies Member before querying and renders hosted live-data hierarchy for Admin", async () => {
  let queryCalls = 0;
  const denied = await page.renderFundsPage({ params: Promise.resolve({ slug: "pro7-fc" }), requireTeamPermission: async (_slug, permission) => { assert.equal(permission, "finance.read"); return null; }, getFunds: async () => { queryCalls += 1; return RESULT; }, denied: () => "SAFE_DENIAL", periodStart: "2026-10-01" });
  assert.equal(denied, "SAFE_DENIAL"); assert.equal(queryCalls, 0);
  const output = await page.renderFundsPage({ params: Promise.resolve({ slug: "pro7-fc" }), requireTeamPermission: async () => ADMIN, getFunds: async (teamId, periodStart) => { assert.deepEqual([teamId, periodStart], ["team-1", "2026-10-01"]); return RESULT; }, denied: () => "SAFE_DENIAL", periodStart: "2026-10-01" });
  const html = renderToStaticMarkup(output as React.ReactElement);
  assert.match(html, /funds-hero-grid[\s\S]*balance-card[\s\S]*fund-actions[\s\S]*fund-stats[\s\S]*dues-card[\s\S]*transactions-card/u);
  assert.match(html, /1\.750\.000[^<]*₫[\s\S]*Nguyễn An[\s\S]*Mua bóng/u);
  assert.match(html, /Thêm khoản chi[\s\S]*Ghi nhận đóng quỹ/u);
  assert.doesNotMatch(html, /31\.260\.000|Marcus J\.|Tommy P\.|Thuê sân Riverside/u);
});

test("funds renders honest empty and error states without exposing action controls in error", async () => {
  for (const [result, state, copy, controls] of [
    [{ ok: true, data: { ...RESULT.data, balanceVnd: 0, monthIncomeVnd: 0, monthIncomeCount: 0, monthExpenseVnd: 0, monthExpenseCount: 0, pendingDuesVnd: 0, pendingDuesCount: 0, paidDuesCount: 0, totalDuesCount: 0, dues: [], recentEntries: [] } }, "empty", "Chưa có dữ liệu quỹ", true],
    [{ ok: false, error: "server" }, "error", "Không thể tải quỹ đội", false],
  ] as const) {
    const output = await page.renderFundsPage({ params: Promise.resolve({ slug: "pro7-fc" }), requireTeamPermission: async () => ADMIN, getFunds: async () => result as FundsResult, denied: () => "SAFE_DENIAL", periodStart: "2026-10-01" });
    const html = renderToStaticMarkup(output as React.ReactElement);
    assert.match(html, new RegExp(`data-state="${state}"`, "u")); assert.match(html, new RegExp(copy, "u")); assert.equal(/Thêm khoản chi/u.test(html), controls);
  }
});

test("fund routes pass decoded params to their scoped handlers", async () => {
  for (const route of [entries, dues]) {
    const response = await route.mutateFundsRoute(new Request("https://pro7.example/api"), Promise.resolve({ slug: "đội-bóng" }), async (_request, target) => Response.json(target));
    assert.deepEqual(await response.json(), { slug: "đội-bóng" });
  }
});
