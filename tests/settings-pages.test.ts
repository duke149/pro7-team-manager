import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Admin Settings is a real six-module data-driven page with concurrency-safe payment controls", async () => {
  const [page, view] = await Promise.all([
    readFile(new URL("../app/teams/[slug]/admin/settings/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/teams/[slug]/admin/settings/settings-view.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(page, /loadAdminSettings/u);
  assert.match(page, /settings\.read/u);
  for (const label of ["Hồ sơ đội", "Thành viên & vai trò", "Thông báo trận đấu", "Tài khoản nhận quỹ", "Nhật ký hoạt động", "Vùng nguy hiểm"]) assert.match(view, new RegExp(label, "u"));
  assert.match(view, /dirtyTeam/u);
  assert.match(view, /dirtyNotifications/u);
  assert.match(view, /dirtyPayments/u);
  assert.match(view, /expectedUpdatedAt: settingsUpdatedAt/u);
  assert.match(view, /setSettingsUpdatedAt/u);
  assert.match(view, /bankCode/u);
  assert.match(view, /accountNumber/u);
  assert.match(view, /accountHolder/u);
  assert.match(view, /transferPrefix/u);
  assert.match(view, /confirmation === team\.name/u);
  assert.match(view, /slugConfirmation === team\.slug/u);
});

test("Admin Settings has honest loading and error boundaries", async () => {
  const [loading, error] = await Promise.all([
    readFile(new URL("../app/teams/[slug]/admin/settings/loading.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/teams/[slug]/admin/settings/error.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(loading, /aria-busy="true"/u);
  assert.match(error, /Thử lại/u);
});

test("phone Settings presents every module tab without clipped labels", async () => {
  const responsive = await readFile(new URL("../app/responsive.css", import.meta.url), "utf8");
  const phoneSettings = responsive.slice(responsive.indexOf("@media (max-width: 767px)"));

  assert.match(phoneSettings, /\.settings-tabs\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\);gap:var\(--space-2\);overflow:visible/u);
  assert.match(phoneSettings, /\.settings-tabs a\{min-width:0;justify-content:center;white-space:normal;text-align:center/u);
});
