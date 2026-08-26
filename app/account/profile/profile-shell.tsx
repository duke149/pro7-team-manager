"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import { AccountMenu } from "../../components/account-menu";
import {
  INITIAL_THEME,
  nextTheme,
  persistBrowserTheme,
  resolveBrowserTheme,
  ThemeToggle,
  type Theme,
} from "../../components/product-shell-controls";

export function ProfileShell({ children, email }: { children: ReactNode; email?: string }) {
  const [theme, setTheme] = useState<Theme>(INITIAL_THEME);
  const currentTheme = useRef<Theme>(INITIAL_THEME);
  const themeResolutionTimer = useRef<number | null>(null);

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

  function toggleTheme() {
    if (themeResolutionTimer.current !== null) {
      window.clearTimeout(themeResolutionTimer.current);
      themeResolutionTimer.current = null;
    }
    const next = nextTheme(currentTheme.current);
    currentTheme.current = next;
    setTheme(next);
    persistBrowserTheme(next);
  }

  return (
    <main className={`account-profile-shell ${theme}`}>
      <header className="account-profile-header">
        {/* Route shell uses native links so Vinext can own full-page auth redirects. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a className="account-profile-brand" href="/" aria-label="PRO7 Team Manager">
          <span aria-hidden="true">7</span><strong>PRO7</strong><small>TEAM MANAGER</small>
        </a>
        <div className="account-profile-header-actions">
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
          <AccountMenu email={email} />
        </div>
      </header>
      {children}
    </main>
  );
}
