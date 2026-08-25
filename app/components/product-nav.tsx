import type { TeamAccessContext } from "../../lib/teams/context";
import { hasPermission, type PermissionCode } from "../../lib/teams/permissions";

export type ProductNavProps = {
  team: TeamAccessContext["team"];
  roleName: string;
  permissions: readonly PermissionCode[];
  currentPath: string;
  mobile?: boolean;
};

type NavigationItem = {
  label: string;
  path: string;
  permission: PermissionCode;
};

const navigationItems: readonly NavigationItem[] = [
  { label: "Tổng quan", path: "overview", permission: "team.read" },
  { label: "Đội hình", path: "squad", permission: "players.read" },
  { label: "Trận đấu", path: "matches", permission: "matches.read" },
  { label: "Quỹ đội", path: "funds", permission: "finance.read" },
  { label: "Cài đặt đội", path: "admin/settings", permission: "settings.read" },
];

function isCurrentPath(currentPath: string, href: string): boolean {
  try {
    return decodeURIComponent(currentPath) === decodeURIComponent(href);
  } catch {
    return currentPath === href;
  }
}

export function ProductNav({
  team,
  roleName,
  permissions,
  currentPath,
  mobile = false,
}: ProductNavProps) {
  const prefix = `/teams/${encodeURIComponent(team.slug)}`;
  const items = navigationItems.filter((item) => hasPermission({ permissions }, item.permission));

  return (
    <nav
      className={mobile ? "product-nav product-nav-mobile" : "product-nav product-nav-desktop"}
      aria-label={mobile ? "Điều hướng đội trên thiết bị di động" : "Điều hướng đội"}
    >
      {!mobile && (
        <div className="product-nav-team">
          <span>Đội hiện tại</span>
          <strong>{team.name}</strong>
          <small>{roleName}</small>
        </div>
      )}
      <ul>
        {items.map((item) => {
          const href = `${prefix}/${item.path}`;
          return (
            <li key={item.path}>
              <a href={href} aria-current={isCurrentPath(currentPath, href) ? "page" : undefined}>
                {item.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
