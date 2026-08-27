import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  INITIAL_THEME,
  THEME_STORAGE_KEY,
  ThemeToggle,
  getLogoutPresentation,
  nextTheme,
  persistTheme,
  requestLocalLogout,
  resolveHydratedTheme,
} from "../app/components/product-shell-controls";

function memoryStorage(initial: string | null = null) {
  let value = initial;
  const writes: string[] = [];
  return {
    writes,
    read: () => value,
    write: (next: string) => {
      writes.push(next);
      value = next;
    },
  };
}

test("theme always starts light before hydration", () => {
  assert.equal(INITIAL_THEME, "light");
  assert.equal(THEME_STORAGE_KEY, "pro7-theme");
});

test("initial theme control markup is light and stays identical through first hydration render", () => {
  const renderInitialTheme = () =>
    renderToStaticMarkup(createElement(ThemeToggle, { theme: INITIAL_THEME, onToggle: () => {} }));
  const serverMarkup = renderInitialTheme();
  const firstClientMarkup = renderInitialTheme();

  assert.equal(serverMarkup, firstClientMarkup);
  assert.match(serverMarkup, /aria-pressed="false"/u);
  assert.match(serverMarkup, /aria-label="Bật giao diện tối"/u);
  assert.match(serverMarkup, />Tối<\/button>/u);
});

test("theme resolves stored dark after hydration", () => {
  assert.equal(
    resolveHydratedTheme({ readStoredTheme: () => "dark", prefersDark: () => false }),
    "dark",
  );
});

test("theme falls back to a dark system preference when storage is empty", () => {
  assert.equal(
    resolveHydratedTheme({ readStoredTheme: () => null, prefersDark: () => true }),
    "dark",
  );
});

test("theme toggle persists and resolves the same selection on reload", () => {
  const storage = memoryStorage();
  const toggled = nextTheme("light");

  persistTheme(toggled, storage.write);
  assert.equal(toggled, "dark");
  assert.deepEqual(storage.writes, ["dark"]);
  assert.equal(
    resolveHydratedTheme({ readStoredTheme: storage.read, prefersDark: () => false }),
    "dark",
  );
});

test("malformed storage and unavailable browser capabilities fail safely to light", () => {
  assert.equal(
    resolveHydratedTheme({
      readStoredTheme: () => "neon",
      prefersDark: () => {
        throw new Error("media unavailable");
      },
    }),
    "light",
  );
  assert.doesNotThrow(() => persistTheme("dark", () => { throw new Error("storage unavailable"); }));
});

function logoutDependencies({
  signOut,
  getSession,
}: {
  signOut: () => Promise<{ error: unknown | null }>;
  getSession: () => Promise<{ data: { session: unknown | null }; error: unknown | null }>;
}) {
  const calls: string[] = [];
  return {
    calls,
    dependencies: {
      signOut: async (options: { scope: "local" }) => {
        calls.push(`signOut:${options.scope}`);
        return signOut();
      },
      getSession: async () => {
        calls.push("getSession");
        return getSession();
      },
      replace: (href: string) => calls.push(`replace:${href}`),
    },
  };
}

test("local logout redirects after a successful scoped sign-out", async () => {
  const fixture = logoutDependencies({
    signOut: async () => ({ error: null }),
    getSession: async () => ({ data: { session: {} }, error: null }),
  });

  assert.equal(await requestLocalLogout(fixture.dependencies), true);
  assert.deepEqual(fixture.calls, ["signOut:local", "replace:/login"]);
});

test("a sign-out error still redirects when session verification confirms local clearance", async () => {
  const fixture = logoutDependencies({
    signOut: async () => ({ error: new Error("upstream error") }),
    getSession: async () => ({ data: { session: null }, error: null }),
  });

  assert.equal(await requestLocalLogout(fixture.dependencies), true);
  assert.deepEqual(fixture.calls, ["signOut:local", "getSession", "replace:/login"]);
});

test("logout remains on-page when the session remains after a sign-out error", async () => {
  const fixture = logoutDependencies({
    signOut: async () => ({ error: new Error("upstream error") }),
    getSession: async () => ({ data: { session: {} }, error: null }),
  });

  assert.equal(await requestLocalLogout(fixture.dependencies), false);
  assert.deepEqual(fixture.calls, ["signOut:local", "getSession"]);
});

test("a thrown sign-out failure can still redirect after an absent-session check", async () => {
  const fixture = logoutDependencies({
    signOut: async () => Promise.reject(new Error("network failure")),
    getSession: async () => ({ data: { session: null }, error: null }),
  });

  assert.equal(await requestLocalLogout(fixture.dependencies), true);
  assert.deepEqual(fixture.calls, ["signOut:local", "getSession", "replace:/login"]);
});

test("logout stays on-page when session verification fails", async () => {
  const fixture = logoutDependencies({
    signOut: async () => ({ error: new Error("upstream error") }),
    getSession: async () => ({ data: { session: null }, error: new Error("session unavailable") }),
  });

  assert.equal(await requestLocalLogout(fixture.dependencies), false);
  assert.deepEqual(fixture.calls, ["signOut:local", "getSession"]);
});

test("logout button presentation covers disabled loading and bounded error states", () => {
  assert.deepEqual(getLogoutPresentation("pending"), {
    disabled: true,
    label: "Đang đăng xuất…",
    ariaLabel: "Đang đăng xuất",
    errorMessage: "",
  });
  assert.deepEqual(getLogoutPresentation("error"), {
    disabled: false,
    label: "Đăng xuất",
    ariaLabel: "Đăng xuất",
    errorMessage: "Không thể đăng xuất. Vui lòng thử lại.",
  });
});
