"use client";

import {
  ChevronDown,
  LayoutDashboard,
  MoreHorizontal,
  Settings,
  Settings2,
  Trophy,
  Users,
  WalletCards,
} from "lucide-react";

import type { TeamAccessContext } from "../../lib/teams/context";
import { hasPermission, type PermissionCode } from "../../lib/teams/permissions";

type RouteNavigationProps = {
  team: TeamAccessContext["team"];
  roleName: string;
  email?: string;
  permissions: readonly PermissionCode[];
  currentPath: string;
  menuOpen?: boolean;
  onCloseMenu?: () => void;
  mobile?: boolean;
};

const navigationItems = [
  { label: "Tổng quan", short: "Tổng quan", path: "overview", permission: "team.read", icon: LayoutDashboard },
  { label: "Đội hình", short: "Đội hình", path: "squad", permission: "players.read", icon: Users },
  { label: "Trận đấu", short: "Trận", path: "matches", permission: "matches.read", icon: Trophy },
  { label: "Chiến thuật", short: "Sơ đồ", path: "tactics", permission: "tactics.read", icon: Settings2 },
  { label: "Quỹ đội", short: "Quỹ", path: "funds", permission: "finance.read", icon: WalletCards },
  { label: "Cài đặt đội", short: "Cài đặt", path: "admin/settings", permission: "settings.read", icon: Settings },
] as const satisfies readonly {
  label: string;
  short: string;
  path: string;
  permission: PermissionCode;
  icon: typeof LayoutDashboard;
}[];

function isCurrentPath(currentPath: string, href: string): boolean {
  const normalize = (value: string) => value.replace(/\/$/u, "").split(/[?#]/u, 1)[0];
  const current = normalize(currentPath);
  const destination = normalize(href);
  return current === destination || current.startsWith(`${destination}/`);
}

function initials(value?: string): string {
  return (value ?? "TA")
    .split(/[@._\s-]+/u)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "TA";
}

export function Pro7RouteNavigation({
  team,
  roleName,
  email,
  permissions,
  currentPath,
  menuOpen = false,
  onCloseMenu,
  mobile = false,
}: RouteNavigationProps) {
  const prefix = `/teams/${encodeURIComponent(team.slug)}`;
  const items = navigationItems.filter((item) => hasPermission({ permissions }, item.permission));

  if (mobile) {
    const mobileItems = items.filter((item) => item.path !== "admin/settings");
    const mobileColumnCount = Math.min(Math.max(mobileItems.length, 1), 5);
    return (
      <nav className={`mobile-nav mobile-nav--${mobileColumnCount}`} aria-label="Điều hướng đội trên thiết bị di động">
        {mobileItems.map(({ label, short, path, icon: Icon }) => {
          const href = `${prefix}/${path}`;
          return (
            <a key={path} href={href} className={isCurrentPath(currentPath, href) ? "active" : undefined}>
              <Icon size={20} />
              <span>{short}</span>
              <span className="sr-only">{label}</span>
            </a>
          );
        })}
      </nav>
    );
  }

  return (
    <>
      <button
        type="button"
        className={`nav-scrim ${menuOpen ? "show" : ""}`}
        aria-label="Đóng trình đơn"
        onClick={onCloseMenu}
      />
      <aside className={`sidebar ${menuOpen ? "open" : ""}`}>
        <button className="close-menu" type="button" aria-label="Đóng trình đơn" onClick={onCloseMenu}><span>×</span></button>
        <a className="logo" href={`${prefix}/overview`} onClick={onCloseMenu}>
          <span>7</span><div><b>PRO7</b><small>TEAM MANAGER</small></div>
        </a>
        <a className="team-picker" href={`${prefix}/overview`} onClick={onCloseMenu}>
          <span>ĐỘI BÓNG HIỆN TẠI</span>
          <strong><i>{initials(team.name)}</i>{team.name}</strong>
          <small>Đội hình 7 người</small><ChevronDown size={16} />
        </a>
        <nav className="main-nav" aria-label="Điều hướng đội">
          <span className="nav-label">QUẢN LÝ</span>
          {items.map(({ label, path, icon: Icon }) => {
            const href = `${prefix}/${path}`;
            return <a key={path} href={href} className={isCurrentPath(currentPath, href) ? "active" : undefined} onClick={onCloseMenu}><Icon size={19} /><span>{label}</span></a>;
          })}
        </nav>
        <div className="season-card"><Trophy size={17} /><div><b>Premier 7s</b><span>Hạng 2 • Vòng 8/18</span></div><strong>#2</strong></div>
        <div className="coach">
          <div className="initial-avatar lime-avatar">{initials(email)}</div>
          <div><b>{email ?? "Tài khoản đã xác minh"}</b><span>{roleName}</span></div><MoreHorizontal size={19} />
        </div>
      </aside>
    </>
  );
}
