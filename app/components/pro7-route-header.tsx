"use client";

import { Menu, Moon, Plus, Sun } from "lucide-react";

import type { TeamNotification } from "../../lib/notifications/model";
import type { TeamAccessContext } from "../../lib/teams/context";
import { hasPermission, type PermissionCode } from "../../lib/teams/permissions";
import { AccountMenu } from "./account-menu";
import { NotificationCenter } from "./notification-center";
import { INITIAL_THEME, nextTheme, persistBrowserTheme, type Theme } from "./product-shell-controls";

export type Pro7RouteHeaderProps = {
  team: TeamAccessContext["team"];
  permissions: readonly PermissionCode[];
  email?: string;
  notifications?: readonly TeamNotification[];
  pathname: string;
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  onOpenMenu: () => void;
};

function isTeamRoute(pathname: string, slug: string, route: string) {
  const normalized = pathname.replace(/\/$/u, "").split(/[?#]/u, 1)[0];
  const encoded = `/teams/${encodeURIComponent(slug)}/${route}`;
  const decoded = `/teams/${slug}/${route}`;
  return normalized === encoded || normalized === decoded || normalized.startsWith(`${encoded}/`) || normalized.startsWith(`${decoded}/`);
}

function squadHeading(teamName: string) {
  return {
    eyebrow: `${teamName.toLocaleUpperCase("vi-VN")} • ĐỘI HÌNH`,
    title: "Đội hình chính",
    description: "Theo dõi nhân sự, phong độ và vai trò thi đấu.",
  };
}

export function Pro7RouteHeader({
  team,
  permissions,
  email,
  notifications = [],
  pathname,
  theme,
  onThemeChange,
  onOpenMenu,
}: Pro7RouteHeaderProps) {
  const onSquad = isTeamRoute(pathname, team.slug, "squad");
  const onFunds = isTeamRoute(pathname, team.slug, "funds");
  const heading = onSquad
    ? squadHeading(team.name)
    : { eyebrow: team.name.toLocaleUpperCase("vi-VN"), title: team.name, description: "PRO7 Team Manager" };
  const canManagePlayers = hasPermission({ permissions }, "players.manage")
    && hasPermission({ permissions }, "members.manage");
  const squadHref = `/teams/${encodeURIComponent(team.slug)}/squad?add=player`;
  const fundsHref = `/teams/${encodeURIComponent(team.slug)}/funds?add=expense`;
  const contextualAction = onFunds && hasPermission({ permissions }, "finance.manage")
    ? { href: fundsHref, label: "Thêm khoản chi" }
    : canManagePlayers
      ? { href: squadHref, label: "Thêm cầu thủ" }
      : null;

  return (
    <header className="app-header">
      <button className="menu-button" type="button" onClick={onOpenMenu} aria-label="Mở trình đơn"><Menu size={22} /></button>
      <div className="page-heading"><span>{heading.eyebrow}</span><h1>{heading.title}</h1><p>{heading.description}</p></div>
      <div className="header-actions">
        <button
          className="icon-button theme-button"
          type="button"
          aria-label={theme === "light" ? "Bật giao diện tối" : "Bật giao diện sáng"}
          aria-pressed={theme === "dark"}
          onClick={() => {
            const next = nextTheme(theme);
            onThemeChange(next);
            persistBrowserTheme(next);
          }}
        >
          {theme === "light" ? <Moon size={19} /> : <Sun size={19} />}
        </button>
        <NotificationCenter initialNotifications={notifications} />
        {contextualAction && <a className="primary-button header-cta" href={contextualAction.href}><Plus size={18} />{contextualAction.label}</a>}
        <AccountMenu
          email={email}
          settingsHref={hasPermission({ permissions }, "settings.read")
            ? `/teams/${encodeURIComponent(team.slug)}/admin/settings`
            : undefined}
        />
      </div>
    </header>
  );
}

export { INITIAL_THEME };
