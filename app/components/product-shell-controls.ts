import { createElement } from "react";

export const INITIAL_THEME = "light" as const;
export const THEME_STORAGE_KEY = "pro7-theme";

export type Theme = "light" | "dark";
export type LogoutPhase = "idle" | "pending" | "error";

type ThemeDependencies = {
  readStoredTheme: () => string | null;
  prefersDark: () => boolean;
};

type LogoutDependencies = {
  signOut: (options: { scope: "local" }) => Promise<{ error: unknown | null }>;
  getSession: () => Promise<{ data: { session: unknown | null }; error: unknown | null }>;
  replace: (href: string) => void;
};

const LOGOUT_ERROR = "Không thể đăng xuất. Vui lòng thử lại.";

export function nextTheme(theme: Theme): Theme {
  return theme === "light" ? "dark" : "light";
}

export function resolveHydratedTheme({ readStoredTheme, prefersDark }: ThemeDependencies): Theme {
  try {
    const storedTheme = readStoredTheme();
    if (storedTheme === "light" || storedTheme === "dark") return storedTheme;
  } catch {
    // Storage can be unavailable in privacy-restricted browser contexts.
  }

  try {
    return prefersDark() ? "dark" : "light";
  } catch {
    return INITIAL_THEME;
  }
}

export function persistTheme(theme: Theme, writeStoredTheme: (value: Theme) => void): void {
  try {
    writeStoredTheme(theme);
  } catch {
    // A preference that cannot be persisted must not break theme changes.
  }
}

export function resolveBrowserTheme(): Theme {
  return resolveHydratedTheme({
    readStoredTheme: () => window.localStorage.getItem(THEME_STORAGE_KEY),
    prefersDark: () => window.matchMedia("(prefers-color-scheme: dark)").matches,
  });
}

export function persistBrowserTheme(theme: Theme): void {
  persistTheme(theme, (value) => window.localStorage.setItem(THEME_STORAGE_KEY, value));
}

export function ThemeToggle({ theme, onToggle }: { theme: Theme; onToggle: () => void }) {
  const isDark = theme === "dark";
  return createElement(
    "button",
    {
      className: "theme-button",
      type: "button",
      "aria-pressed": isDark,
      "aria-label": isDark ? "Bật giao diện sáng" : "Bật giao diện tối",
      onClick: onToggle,
    },
    isDark ? "Sáng" : "Tối",
  );
}

export function getLogoutPresentation(phase: LogoutPhase): {
  disabled: boolean;
  label: string;
  ariaLabel: string;
  errorMessage: string;
} {
  if (phase === "pending") {
    return {
      disabled: true,
      label: "Đang đăng xuất…",
      ariaLabel: "Đang đăng xuất",
      errorMessage: "",
    };
  }

  return {
    disabled: false,
    label: "Đăng xuất",
    ariaLabel: "Đăng xuất",
    errorMessage: phase === "error" ? LOGOUT_ERROR : "",
  };
}

export async function requestLocalLogout({
  signOut,
  getSession,
  replace,
}: LogoutDependencies): Promise<boolean> {
  try {
    const { error } = await signOut({ scope: "local" });
    if (!error) {
      replace("/login");
      return true;
    }
  } catch {
    // Verify the local session after an upstream sign-out failure.
  }

  try {
    const { data, error } = await getSession();
    if (!error && !data.session) {
      replace("/login");
      return true;
    }
  } catch {
    // An indeterminate session must leave the user on the current page.
  }

  return false;
}
