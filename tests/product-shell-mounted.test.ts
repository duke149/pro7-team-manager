import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { Window } from "happy-dom";
import { build } from "vite";

type ProductShellProps = {
  children: React.ReactNode;
  team: { id: string; name: string; slug: string };
  roleName: string;
  permissions: readonly string[];
  email?: string;
};

type BrowserClient = {
  auth: {
    signOut: (options: { scope: "local" }) => Promise<{ error: unknown | null }>;
    getSession: () => Promise<{ data: { session: unknown | null }; error: unknown | null }>;
  };
};

type Root = { unmount: () => void };

let ProductShell: (props: ProductShellProps) => React.ReactNode;
let act: (callback: () => void | Promise<void>) => Promise<void>;
let createElement: typeof import("react").createElement;
let hydrateRoot: (
  container: Element,
  initialChildren: React.ReactNode,
  options: { onRecoverableError: (error: Error) => void },
) => Root;
let renderToString: (node: React.ReactNode) => string;
let browserWindow: Window & typeof globalThis;
const initialHandles = new Set(process._getActiveHandles());

const shellProps: Omit<ProductShellProps, "children"> = {
  team: { id: "team-1", name: "Đội Thật", slug: "đội thật" },
  roleName: "Thành viên",
  permissions: ["team.read", "players.read", "matches.read"],
  email: "member@example.com",
};

test.before(async () => {
  browserWindow = new Window({ url: "https://pro7.example/" }) as unknown as Window & typeof globalThis;
  for (const [key, value] of Object.entries({
    window: browserWindow,
    document: browserWindow.document,
    navigator: browserWindow.navigator,
    HTMLElement: browserWindow.HTMLElement,
    Node: browserWindow.Node,
    Event: browserWindow.Event,
    MouseEvent: browserWindow.MouseEvent,
    IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }

  const nodeEnvironment = process.env.NODE_ENV;
  const result = await build({
    configFile: false,
    plugins: [
      {
        name: "product-shell-browser-boundaries",
        enforce: "pre",
        resolveId(id) {
          if (id === "next/navigation") {
            return resolve("tests/fixtures/product-shell-navigation.ts");
          }
          if (id.includes("lib/supabase/client")) {
            return resolve("tests/fixtures/product-shell-browser-client.ts");
          }
          return null;
        },
      },
    ],
    build: {
      lib: {
        entry: resolve("tests/fixtures/product-shell-mounted-entry.ts"),
        formats: ["cjs"],
        fileName: "product-shell-mounted",
      },
      write: false,
    },
  });
  process.env.NODE_ENV = nodeEnvironment ?? "test";
  const bundledCode = (Array.isArray(result) ? result : [result])
    .flatMap((bundle) => bundle.output)
    .find((output) => output.type === "chunk")?.code;
  assert.ok(bundledCode, "the browser test bundle should contain an executable chunk");
  const bundleModule = { exports: {} as Record<string, unknown> };
  new Function("module", "exports", bundledCode)(bundleModule, bundleModule.exports);
  ({ ProductShell, act, createElement, hydrateRoot, renderToString } = bundleModule.exports as {
    ProductShell: typeof ProductShell;
    act: typeof act;
    createElement: typeof createElement;
    hydrateRoot: typeof hydrateRoot;
    renderToString: typeof renderToString;
  });
});

test.after(async () => {
  await browserWindow.happyDOM.abort();
  browserWindow.close();
  for (const handle of process._getActiveHandles()) {
    if (!initialHandles.has(handle) && handle.constructor.name === "MessagePort") {
      (handle as MessagePort).close();
    }
  }
});

function configureBrowser({
  storedTheme = null,
  prefersDark = false,
  client,
  eventLog,
}: {
  storedTheme?: string | null;
  prefersDark?: boolean;
  client: BrowserClient;
  eventLog?: string[];
}) {
  const values = new Map<string, string>();
  if (storedTheme !== null) values.set("pro7-theme", storedTheme);
  const writes: string[] = [];
  const replacements: string[] = [];
  let nextTimerId = 1;
  const timers = new Map<number, () => void>();
  Object.defineProperty(browserWindow, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        writes.push(`${key}:${value}`);
        values.set(key, value);
      },
    },
  });
  Object.defineProperty(browserWindow, "matchMedia", {
    configurable: true,
    value: () => ({ matches: prefersDark }),
  });
  Object.defineProperty(browserWindow, "setTimeout", {
    configurable: true,
    value: (callback: () => void) => {
      const timerId = nextTimerId;
      nextTimerId += 1;
      timers.set(timerId, callback);
      return timerId;
    },
  });
  Object.defineProperty(browserWindow, "clearTimeout", {
    configurable: true,
    value: (timerId: number) => timers.delete(timerId),
  });
  browserWindow.location.replace = (href: string) => {
    replacements.push(href);
    eventLog?.push(`replace:${href}`);
  };
  Object.assign(globalThis, {
    __productShellPathname: "/teams/%C4%91%E1%BB%99i%20th%E1%BA%ADt/matches",
    __productShellBrowserClient: client,
  });
  return {
    writes,
    replacements,
    flushThemeResolution() {
      assert.equal(timers.size, 1, "hydration should schedule exactly one theme resolution");
      const pendingTimers = [...timers.values()];
      timers.clear();
      for (const timer of pendingTimers) timer();
    },
  };
}

function shellElement(props = shellProps) {
  return createElement(ProductShell, props, createElement("p", null, "Nội dung thật"));
}

async function hydrateShell(markup: string) {
  browserWindow.document.body.innerHTML = `<div id="root">${markup}</div>`;
  const container = browserWindow.document.getElementById("root");
  assert.ok(container);
  const recoverableErrors: Error[] = [];
  const consoleErrors: unknown[][] = [];
  const originalConsoleError = console.error;
  console.error = (...args: unknown[]) => consoleErrors.push(args);
  let root: Root | undefined;
  await act(async () => {
    root = hydrateRoot(container, shellElement(), {
      onRecoverableError: (error) => recoverableErrors.push(error),
    });
    await Promise.resolve();
  });
  console.error = originalConsoleError;
  assert.ok(root);
  assert.deepEqual(recoverableErrors, [], "hydration must not recover from mismatched markup");
  assert.deepEqual(consoleErrors, [], "hydration must not emit a warning");
  return {
    container,
    root,
  };
}

function idleClient(): BrowserClient {
  return {
    auth: {
      signOut: async () => ({ error: null }),
      getSession: async () => ({ data: { session: null }, error: null }),
    },
  };
}

function themeButton(container: Element): HTMLButtonElement {
  const button = container.querySelector("button.theme-button");
  assert.ok(button);
  return button as HTMLButtonElement;
}

function logoutButton(container: Element): HTMLButtonElement {
  const button = container.querySelector("button.logout-button");
  assert.ok(button);
  return button as HTMLButtonElement;
}

function click(button: HTMLButtonElement) {
  button.click();
}

test("mounted ProductShell keeps SSR light, hydrates theme preferences, and persists queued toggles", async () => {
  const storedBrowser = configureBrowser({ storedTheme: "dark", client: idleClient() });
  assert.equal(window, browserWindow);
  assert.equal(window.localStorage.getItem("pro7-theme"), "dark");
  const ssr = renderToString(shellElement());
  assert.match(ssr, /pro7-shell product-shell light/u);
  assert.match(ssr, /aria-pressed="false"/u);
  assert.match(ssr, /aria-label="Bật giao diện tối"/u);

  const first = await hydrateShell(ssr);
  await act(async () => {
    storedBrowser.flushThemeResolution();
  });
  assert.match(first.container.innerHTML, /pro7-shell product-shell dark/u);
  assert.equal(themeButton(first.container).getAttribute("aria-pressed"), "true");
  assert.equal(themeButton(first.container).getAttribute("aria-label"), "Bật giao diện sáng");
  await act(async () => first.root.unmount());

  const systemBrowser = configureBrowser({ prefersDark: true, client: idleClient() });
  const systemSsr = renderToString(shellElement());
  assert.match(systemSsr, /pro7-shell product-shell light/u);
  const system = await hydrateShell(systemSsr);
  await act(async () => {
    systemBrowser.flushThemeResolution();
  });
  assert.match(system.container.innerHTML, /pro7-shell product-shell dark/u);

  const controls = configureBrowser({ storedTheme: "dark", client: idleClient() });
  await act(async () => {
    click(themeButton(system.container));
    click(themeButton(system.container));
  });
  assert.match(system.container.innerHTML, /pro7-shell product-shell dark/u);
  assert.equal(themeButton(system.container).getAttribute("aria-pressed"), "true");
  assert.deepEqual(controls.writes, ["pro7-theme:light", "pro7-theme:dark"]);
  await act(async () => system.root.unmount());
});

test("ProductShell brand and pathname fallback share the authorized landing resolver", () => {
  configureBrowser({ client: idleClient() });
  Object.assign(globalThis, { __productShellPathname: "" });
  const html = renderToString(
    shellElement({
      ...shellProps,
      permissions: ["finance.read"],
    }),
  );

  assert.match(
    html,
    /class="product-brand" href="\/teams\/%C4%91%E1%BB%99i%20th%E1%BA%ADt\/funds"/u,
  );
  assert.match(
    html,
    /href="\/teams\/%C4%91%E1%BB%99i%20th%E1%BA%ADt\/funds" aria-current="page"/u,
  );
});

test("mounted AccountMenu applies verified local logout outcomes to the actual button DOM", async () => {
  type Case = {
    name: string;
    signOut: () => Promise<{ error: unknown | null }>;
    getSession: () => Promise<{ data: { session: unknown | null }; error: unknown | null }>;
    expectedCalls: string[];
    replacement: boolean;
    error: boolean;
  };
  const cases: Case[] = [
    {
      name: "resolved sign-out error with absent session",
      signOut: async () => ({ error: new Error("upstream") }),
      getSession: async () => ({ data: { session: null }, error: null }),
      expectedCalls: ["signOut:local", "getSession", "replace:/login"],
      replacement: true,
      error: false,
    },
    {
      name: "resolved sign-out error with remaining session",
      signOut: async () => ({ error: new Error("upstream") }),
      getSession: async () => ({ data: { session: {} }, error: null }),
      expectedCalls: ["signOut:local", "getSession"],
      replacement: false,
      error: true,
    },
    {
      name: "thrown sign-out with absent session",
      signOut: async () => Promise.reject(new Error("network")),
      getSession: async () => ({ data: { session: null }, error: null }),
      expectedCalls: ["signOut:local", "getSession", "replace:/login"],
      replacement: true,
      error: false,
    },
    {
      name: "thrown sign-out with remaining session",
      signOut: async () => Promise.reject(new Error("network")),
      getSession: async () => ({ data: { session: {} }, error: null }),
      expectedCalls: ["signOut:local", "getSession"],
      replacement: false,
      error: true,
    },
    {
      name: "getSession resolved error",
      signOut: async () => ({ error: new Error("upstream") }),
      getSession: async () => ({ data: { session: null }, error: new Error("session") }),
      expectedCalls: ["signOut:local", "getSession"],
      replacement: false,
      error: true,
    },
    {
      name: "getSession rejection",
      signOut: async () => ({ error: new Error("upstream") }),
      getSession: async () => Promise.reject(new Error("session")),
      expectedCalls: ["signOut:local", "getSession"],
      replacement: false,
      error: true,
    },
  ];

  for (const scenario of cases) {
    const calls: string[] = [];
    const client: BrowserClient = {
      auth: {
        signOut: async (options) => {
          calls.push(`signOut:${options.scope}`);
          return scenario.signOut();
        },
        getSession: async () => {
          calls.push("getSession");
          return scenario.getSession();
        },
      },
    };
    const browser = configureBrowser({ client, eventLog: calls });
    const ssr = renderToString(shellElement());
    const mounted = await hydrateShell(ssr);
    await act(async () => {
      click(logoutButton(mounted.container));
      await Promise.resolve();
      await Promise.resolve();
    });

    assert.deepEqual(calls, scenario.expectedCalls, scenario.name);
    assert.deepEqual(browser.replacements, scenario.replacement ? ["/login"] : [], scenario.name);
    assert.equal(mounted.container.textContent?.includes("Không thể đăng xuất. Vui lòng thử lại."), scenario.error);
    if (!scenario.replacement) {
      assert.equal(logoutButton(mounted.container).disabled, false, scenario.name);
    }
    await act(async () => mounted.root.unmount());
  }
});

test("mounted AccountMenu disables during a successful local sign-out and safely replaces login", async () => {
  let resolveSignOut: ((result: { error: unknown | null }) => void) | undefined;
  const calls: string[] = [];
  const client: BrowserClient = {
    auth: {
      signOut: async (options) => {
        calls.push(`signOut:${options.scope}`);
        return new Promise((resolve) => {
          resolveSignOut = resolve;
        });
      },
      getSession: async () => {
        calls.push("getSession");
        return { data: { session: null }, error: null };
      },
    },
  };
  const browser = configureBrowser({ client, eventLog: calls });
  const ssr = renderToString(shellElement());
  const mounted = await hydrateShell(ssr);
  await act(async () => {
    click(logoutButton(mounted.container));
    await Promise.resolve();
  });
  assert.equal(logoutButton(mounted.container).disabled, true);
  assert.equal(logoutButton(mounted.container).getAttribute("aria-busy"), "true");
  assert.match(logoutButton(mounted.container).textContent ?? "", /Đang đăng xuất/u);

  assert.ok(resolveSignOut);
  await act(async () => {
    resolveSignOut?.({ error: null });
    await Promise.resolve();
  });
  assert.deepEqual(calls, ["signOut:local", "replace:/login"]);
  assert.deepEqual(browser.replacements, ["/login"]);
  await act(async () => mounted.root.unmount());
});
