import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ProductNav } from "../app/components/product-nav";
import { AccountMenu } from "../app/components/account-menu";
import type { TeamAccessContext } from "../lib/teams/context";

const member: TeamAccessContext = {
  team: { id: "team-1", name: "Đội Bóng Số 7", slug: "đội bóng" },
  userId: "member-1",
  membership: { roleId: "role-member", roleSlug: "member", roleName: "Thành viên" },
  permissions: ["team.read", "members.read", "players.read", "matches.read", "matches.respond", "tactics.read", "news.read", "roles.read"],
};

const admin: TeamAccessContext = {
  ...member,
  userId: "admin-1",
  membership: { roleId: "role-admin", roleSlug: "admin", roleName: "Quản trị viên" },
  permissions: ["team.read", "members.read", "players.read", "matches.read", "matches.manage", "matches.respond", "tactics.read", "tactics.manage", "news.read", "news.manage", "roles.read", "roles.manage", "settings.read", "settings.update", "finance.read", "finance.manage"],
};

function renderNav(
  context: TeamAccessContext,
  mobile = false,
  currentPath = "/teams/%C4%91%E1%BB%99i%20b%C3%B3ng/matches",
): string {
  return renderToStaticMarkup(
    createElement(ProductNav, {
      team: context.team,
      roleName: context.membership.roleName,
      permissions: context.permissions,
      currentPath,
      mobile,
    }),
  );
}

function destinations(html: string): string[] {
  return [...html.matchAll(/href="([^"]+)"/gu)].map((match) => match[1]);
}

test("member navigation exposes only the three authorized team destinations", () => {
  const html = renderNav(member);

  assert.deepEqual(destinations(html), [
    "/teams/%C4%91%E1%BB%99i%20b%C3%B3ng/overview",
    "/teams/%C4%91%E1%BB%99i%20b%C3%B3ng/squad",
    "/teams/%C4%91%E1%BB%99i%20b%C3%B3ng/matches",
  ]);
  assert.match(html, /href="\/teams\/%C4%91%E1%BB%99i%20b%C3%B3ng\/matches" aria-current="page"/u);
  assert.doesNotMatch(html, /Quỹ đội|Cài đặt đội|Chiến thuật/u);
});

test("admin navigation adds only finance and settings destinations", () => {
  const html = renderNav(admin);

  assert.deepEqual(destinations(html), [
    "/teams/%C4%91%E1%BB%99i%20b%C3%B3ng/overview",
    "/teams/%C4%91%E1%BB%99i%20b%C3%B3ng/squad",
    "/teams/%C4%91%E1%BB%99i%20b%C3%B3ng/matches",
    "/teams/%C4%91%E1%BB%99i%20b%C3%B3ng/funds",
    "/teams/%C4%91%E1%BB%99i%20b%C3%B3ng/admin/settings",
  ]);
  assert.doesNotMatch(html, /Chiến thuật/u);
});

test("mobile navigation keeps the identical authorized destinations and active route", () => {
  const desktop = renderNav(admin);
  const mobile = renderNav(admin, true);

  assert.deepEqual(destinations(mobile), destinations(desktop));
  assert.match(mobile, /aria-label="Điều hướng đội trên thiết bị di động"/u);
  assert.match(mobile, /href="\/teams\/%C4%91%E1%BB%99i%20b%C3%B3ng\/matches" aria-current="page"/u);
});

test("navigation recognizes the browser pathname when its team slug is decoded", () => {
  const html = renderNav(admin, false, "/teams/đội bóng/matches");

  assert.match(html, /href="\/teams\/%C4%91%E1%BB%99i%20b%C3%B3ng\/matches" aria-current="page"/u);
});

test("account menu renders the signed-in address and an accessible logout control", () => {
  const html = renderToStaticMarkup(createElement(AccountMenu, { email: "member@example.com" }));

  assert.match(html, /member@example\.com/u);
  assert.match(html, /aria-label="Đăng xuất"/u);
  assert.match(html, /Đăng xuất/u);
});
