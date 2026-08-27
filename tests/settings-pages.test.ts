import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Admin Settings is a real five-module data-driven page", async () => {
  const [page, view] = await Promise.all([
    readFile(new URL("../app/teams/[slug]/admin/settings/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/teams/[slug]/admin/settings/settings-view.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(page, /loadAdminSettings/u);
  assert.match(page, /settings\.read/u);
  for (const label of ["Hồ sơ đội", "Thành viên & vai trò", "Thông báo trận đấu", "Nhật ký hoạt động", "Vùng nguy hiểm"]) assert.match(view, new RegExp(label, "u"));
  assert.match(view, /dirtyTeam/u);
  assert.match(view, /dirtyNotifications/u);
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
