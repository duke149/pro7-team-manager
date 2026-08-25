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

type Root = { render: (node: React.ReactNode) => void; unmount: () => void };

let ProductShell: (props: ProductShellProps) => React.ReactNode;
let act: (callback: () => void | Promise<void>) => Promise<void>;
let createElement: typeof import("react").createElement;
let createRoot: (container: Element) => Root;
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
  ({ ProductShell, act, createElement, createRoot, renderToString } = bundleModule.exports as {
    ProductShell: typeof ProductShell;
    act: typeof act;
    createElement: typeof createElement;
    createRoot: typeof createRoot;
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
  browserWindow.location.replace = (href: string) => {
    replacements.push(href);
    eventLog?.push(`replace:${href}`);
  };
  Object.assign(globalThis, {
    __productShellPathname: "/teams/%C4%91%E1%BB%99i%20th%E1%BA%ADt/matches",
    __productShellBrowserClient: client,
  });
  return { writes, replacements };
}

function shellElement() {
  return createElement(ProductShell, shellProps, createElement("p", null, "Nội dung thật"));
}

async function mountShell() {
  browserWindow.document.body.innerHTML = '<div id="root"></div>';
  const container = browserWindow.document.getElementById("root");
  assert.ok(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(shellElement());
    await Promise.resolve();
  });
  return { container, root };
}

async function flushThemeEffect() {
  await act(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
  });
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
  configureBrowser({ storedTheme: "dark", client: idleClient() });
  assert.equal(window, browserWindow);
  assert.equal(window.localStorage.getItem("pro7-theme"), "dark");
  const ssr = renderToString(shellElement());
  assert.match(ssr, /pro7-shell product-shell light/u);
  assert.match(ssr, /aria-pressed="false"/u);
  assert.match(ssr, /aria-label="Bật giao diện tối"/u);

  const first = await mountShell();
  assert.match(first.container.innerHTML, /pro7-shell product-shell light/u);
  await flushThemeEffect();
  assert.match(first.container.innerHTML, /pro7-shell product-shell dark/u);
  assert.equal(themeButton(first.container).getAttribute("aria-pressed"), "true");
  assert.equal(themeButton(first.container).getAttribute("aria-label"), "Bật giao diện sáng");
  await act(async () => first.root.unmount());

  configureBrowser({ prefersDark: true, client: idleClient() });
  const system = await mountShell();
  await flushThemeEffect();
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
    const mounted = await mountShell();
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
  const mounted = await mountShell();
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
