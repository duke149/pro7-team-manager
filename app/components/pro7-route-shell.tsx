"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";

import type { TeamAccessContext } from "../../lib/teams/context";
import type { PermissionCode } from "../../lib/teams/permissions";
import { INITIAL_THEME, Pro7RouteHeader } from "./pro7-route-header";
import { Pro7RouteNavigation } from "./pro7-route-navigation";
import { resolveBrowserTheme, type Theme } from "./product-shell-controls";

export function Pro7RouteShell({
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
  const currentTheme = useRef<Theme>(INITIAL_THEME);
  const themeResolutionTimer = useRef<number | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const resolvedTheme = resolveBrowserTheme();
    if (resolvedTheme === INITIAL_THEME) return;

    const timer = window.setTimeout(() => {
      themeResolutionTimer.current = null;
      currentTheme.current = resolvedTheme;
      setTheme(resolvedTheme);
    }, 0);
    themeResolutionTimer.current = timer;
    return () => {
      window.clearTimeout(timer);
      if (themeResolutionTimer.current === timer) themeResolutionTimer.current = null;
    };
  }, []);

  return (
    <div className={`pro7-shell ${theme}`}>
      <Pro7RouteNavigation
        team={team}
        roleName={roleName}
        email={email}
        permissions={permissions}
        currentPath={pathname}
        menuOpen={menuOpen}
        onCloseMenu={() => setMenuOpen(false)}
      />
      <div className="app-main">
        <Pro7RouteHeader
          team={team}
          permissions={permissions}
          email={email}
          pathname={pathname}
          theme={theme}
          onThemeChange={(nextTheme) => {
            if (themeResolutionTimer.current !== null) {
              window.clearTimeout(themeResolutionTimer.current);
              themeResolutionTimer.current = null;
            }
            currentTheme.current = nextTheme;
            setTheme(nextTheme);
          }}
          onOpenMenu={() => setMenuOpen(true)}
        />
        <div className="page-content">{children}</div>
      </div>
      <Pro7RouteNavigation
        team={team}
        roleName={roleName}
        email={email}
        permissions={permissions}
        currentPath={pathname}
        mobile
      />
    </div>
  );
}
