"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";

import type { TeamAccessContext } from "../../lib/teams/context";
import type { PermissionCode } from "../../lib/teams/permissions";
import { AccountMenu } from "./account-menu";
import { ProductNav } from "./product-nav";
import {
  INITIAL_THEME,
  nextTheme,
  persistBrowserTheme,
  resolveBrowserTheme,
  ThemeToggle,
  type Theme,
} from "./product-shell-controls";

export function ProductShell({
  children,
  team,
  roleName,
  permissions,
  email,
}: {
  children: ReactNode;
  team: TeamAccessContext["team"];
  roleName: string;
  permissions: readonly PermissionCode[];
  email?: string;
}) {
  const pathname = usePathname() || `/teams/${encodeURIComponent(team.slug)}/overview`;
  const [theme, setTheme] = useState<Theme>(INITIAL_THEME);

  useEffect(() => {
    const resolvedTheme = resolveBrowserTheme();
    if (resolvedTheme === INITIAL_THEME) return;

    const timer = window.setTimeout(() => setTheme(resolvedTheme), 0);
    return () => window.clearTimeout(timer);
  }, []);

  function toggleTheme() {
    const next = nextTheme(theme);
    setTheme(next);
    persistBrowserTheme(next);
  }

  return (
    <div className={`pro7-shell product-shell ${theme}`}>
      <aside className="product-sidebar">
        <a className="product-brand" href={`/teams/${encodeURIComponent(team.slug)}/overview`}>
          <span aria-hidden="true">7</span>
          <strong>PRO7</strong>
        </a>
        <ProductNav
          team={team}
          roleName={roleName}
          permissions={permissions}
          currentPath={pathname}
        />
      </aside>
      <div className="product-main">
        <header className="product-header">
          <div>
            <span className="product-header-kicker">{team.name}</span>
            <p>{roleName}</p>
          </div>
          <div className="product-header-actions">
            <ThemeToggle theme={theme} onToggle={toggleTheme} />
            <AccountMenu email={email} />
          </div>
        </header>
        <div className="product-page-content">{children}</div>
      </div>
      <ProductNav
        team={team}
        roleName={roleName}
        permissions={permissions}
        currentPath={pathname}
        mobile
      />
    </div>
  );
}
