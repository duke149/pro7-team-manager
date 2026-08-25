import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ProductNav } from "../app/components/product-nav";
import { Pro7RouteNavigation } from "../app/components/pro7-route-navigation";
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

test("navigation keeps the squad item active for an encoded player-detail pathname", () => {
  const html = renderNav(member, false, "/teams/%C4%91%E1%BB%99i%20b%C3%B3ng/squad/player-12");

  assert.match(html, /href="\/teams\/%C4%91%E1%BB%99i%20b%C3%B3ng\/squad" aria-current="page"/u);
});

test("navigation keeps the matches item active for a decoded match-detail pathname", () => {
  const html = renderNav(member, false, "/teams/đội bóng/matches/match-12");

  assert.match(html, /href="\/teams\/%C4%91%E1%BB%99i%20b%C3%B3ng\/matches" aria-current="page"/u);
});

test("navigation accepts an encoded slug and trailing slash as the current route", () => {
  const html = renderNav(member, false, "/teams/%C4%91%E1%BB%99i%20b%C3%B3ng/matches/");

  assert.match(html, /href="\/teams\/%C4%91%E1%BB%99i%20b%C3%B3ng\/matches" aria-current="page"/u);
});

test("navigation does not mark a false-prefix sibling active", () => {
  const html = renderNav(member, false, "/teams/đội bóng/matches-archive");

  assert.doesNotMatch(html, /aria-current="page"/u);
});

test("account menu renders the signed-in address and an accessible logout control", () => {
  const html = renderToStaticMarkup(createElement(AccountMenu, { email: "member@example.com" }));

  assert.match(html, /member@example\.com/u);
  assert.match(html, /aria-label="Đăng xuất"/u);
  assert.match(html, /Đăng xuất/u);
});

test("hosted route navigation preserves the five-slot Squad order with route links", () => {
  const html = renderToStaticMarkup(
    createElement(Pro7RouteNavigation, {
      team: admin.team,
      roleName: admin.membership.roleName,
      email: "admin@example.com",
      permissions: [...admin.permissions, "players.manage", "tactics.read"],
      currentPath: "/teams/%C4%91%E1%BB%99i%20b%C3%B3ng/squad",
    }),
  );

  assert.deepEqual(destinations(html).slice(0, 7), [
    "/teams/%C4%91%E1%BB%99i%20b%C3%B3ng/overview",
    "/teams/%C4%91%E1%BB%99i%20b%C3%B3ng/overview",
    "/teams/%C4%91%E1%BB%99i%20b%C3%B3ng/overview",
    "/teams/%C4%91%E1%BB%99i%20b%C3%B3ng/squad",
    "/teams/%C4%91%E1%BB%99i%20b%C3%B3ng/matches",
    "/teams/%C4%91%E1%BB%99i%20b%C3%B3ng/tactics",
    "/teams/%C4%91%E1%BB%99i%20b%C3%B3ng/funds",
  ]);
  assert.match(html, /TEAM MANAGER/u);
  assert.match(html, /href="\/teams\/%C4%91%E1%BB%99i%20b%C3%B3ng\/squad" class="active"/u);
  assert.doesNotMatch(html, /href="\/account\/profile"/u);
});

test("hosted route navigation hides only unauthorized Funds without changing the mobile link order", () => {
  const permissions = ["team.read", "players.read", "matches.read", "tactics.read"] as const;
  const desktop = renderToStaticMarkup(
    createElement(Pro7RouteNavigation, {
      team: member.team,
      roleName: member.membership.roleName,
      permissions,
      currentPath: "/teams/%C4%91%E1%BB%99i%20b%C3%B3ng/squad",
    }),
  );
  const mobile = renderToStaticMarkup(
    createElement(Pro7RouteNavigation, {
      team: member.team,
      roleName: member.membership.roleName,
      permissions,
      currentPath: "/teams/%C4%91%E1%BB%99i%20b%C3%B3ng/squad",
      mobile: true,
    }),
  );

  assert.doesNotMatch(desktop, /Quỹ đội/u);
  assert.deepEqual(destinations(mobile), [
    "/teams/%C4%91%E1%BB%99i%20b%C3%B3ng/overview",
    "/teams/%C4%91%E1%BB%99i%20b%C3%B3ng/squad",
    "/teams/%C4%91%E1%BB%99i%20b%C3%B3ng/matches",
    "/teams/%C4%91%E1%BB%99i%20b%C3%B3ng/tactics",
  ]);
});
