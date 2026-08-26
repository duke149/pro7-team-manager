import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { Window } from "happy-dom";
import { build } from "vite";

type RouteShellProps = {
  children: React.ReactNode;
  team: { id: string; name: string; slug: string };
  roleName: string;
  permissions: readonly string[];
  email?: string;
};

type Root = { unmount: () => void };

let Pro7RouteShell: (props: RouteShellProps) => React.ReactNode;
let act: (callback: () => void | Promise<void>) => Promise<void>;
let createElement: typeof import("react").createElement;
let hydrateRoot: (container: Element, initialChildren: React.ReactNode, options: { onRecoverableError: (error: Error) => void }) => Root;
let renderToString: (node: React.ReactNode) => string;
let browserWindow: Window & typeof globalThis;
const initialHandles = new Set(process._getActiveHandles());

const props: Omit<RouteShellProps, "children"> = {
  team: { id: "team-1", name: "Đội Thật", slug: "đội thật" },
  roleName: "Thành viên",
  permissions: ["team.read", "players.read", "matches.read", "tactics.read"],
  email: "member@example.com",
};

test.before(async () => {
  browserWindow = new Window({ url: "https://pro7.example/teams/%C4%91%E1%BB%99i%20th%E1%BA%ADt/squad" }) as unknown as Window & typeof globalThis;
  for (const [key, value] of Object.entries({
    window: browserWindow,
    document: browserWindow.document,
    navigator: browserWindow.navigator,
    HTMLElement: browserWindow.HTMLElement,
    Node: browserWindow.Node,
    Event: browserWindow.Event,
    KeyboardEvent: browserWindow.KeyboardEvent,
    MouseEvent: browserWindow.MouseEvent,
    IS_REACT_ACT_ENVIRONMENT: true,
  })) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });

  const nodeEnvironment = process.env.NODE_ENV;
  const bundle = await build({
    configFile: false,
    plugins: [{
      name: "pro7-route-shell-browser-boundaries",
      enforce: "pre",
      resolveId(id) {
        if (id === "next/navigation") return resolve("tests/fixtures/product-shell-navigation.ts");
        if (id.includes("lib/supabase/client")) return resolve("tests/fixtures/product-shell-browser-client.ts");
        return null;
      },
    }],
    build: { lib: { entry: resolve("tests/fixtures/pro7-route-shell-mounted-entry.ts"), formats: ["cjs"], fileName: "pro7-route-shell-mounted" }, write: false },
  });
  process.env.NODE_ENV = nodeEnvironment ?? "test";
  const code = (Array.isArray(bundle) ? bundle : [bundle])
    .flatMap((output) => output.output)
    .find((output) => output.type === "chunk" && output.isEntry)?.code;
  assert.ok(code);
  const bundleModule = { exports: {} as Record<string, unknown> };
  new Function("module", "exports", code)(bundleModule, bundleModule.exports);
  ({ Pro7RouteShell, act, createElement, hydrateRoot, renderToString } = bundleModule.exports as {
    Pro7RouteShell: typeof Pro7RouteShell;
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

function routeShell(overrides: Partial<Omit<RouteShellProps, "children">> = {}) {
  return createElement(Pro7RouteShell, { ...props, ...overrides }, createElement("p", null, "Nội dung thật"));
}

test("persisted dark theme survives a fresh route-shell hydration without a mismatch", async () => {
  Object.defineProperty(browserWindow, "localStorage", {
    configurable: true,
    value: { getItem: (key: string) => key === "pro7-theme" ? "dark" : null, setItem: () => {} },
  });
  Object.defineProperty(browserWindow, "matchMedia", { configurable: true, value: () => ({ matches: false }) });
  let nextTimerId = 1;
  const timers = new Map<number, () => void>();
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
  Object.assign(globalThis, {
    __productShellPathname: "/teams/%C4%91%E1%BB%99i%20th%E1%BA%ADt/squad",
    __productShellBrowserClient: { auth: { signOut: async () => ({ error: null }), getSession: async () => ({ data: { session: null }, error: null }) } },
  });
  const ssr = renderToString(routeShell());
  assert.match(ssr, /pro7-shell light/u);
  browserWindow.document.body.innerHTML = `<div id="root">${ssr}</div>`;
  const container = browserWindow.document.getElementById("root");
  assert.ok(container);
  const recoverableErrors: Error[] = [];
  let root: Root | undefined;
  try {
    await act(async () => {
      root = hydrateRoot(container, routeShell(), { onRecoverableError: (error) => recoverableErrors.push(error) });
      await Promise.resolve();
    });
    assert.equal(timers.size, 1, "hydration should schedule one persisted-theme resolution");
    await act(async () => {
      for (const callback of timers.values()) callback();
      timers.clear();
    });
    assert.deepEqual(recoverableErrors, []);
    assert.match(container.innerHTML, /pro7-shell dark/u);
  } finally {
    await act(async () => root?.unmount());
  }
});

test("compact account menu exposes authorized destinations and returns focus after Escape", async () => {
  Object.defineProperty(browserWindow, "localStorage", {
    configurable: true,
    value: { getItem: () => null, setItem: () => {} },
  });
  Object.defineProperty(browserWindow, "matchMedia", { configurable: true, value: () => ({ matches: false }) });
  Object.assign(globalThis, {
    __productShellPathname: "/teams/%C4%91%E1%BB%99i%20th%E1%BA%ADt/squad",
    __productShellBrowserClient: { auth: { signOut: async () => ({ error: null }), getSession: async () => ({ data: { session: null }, error: null }) } },
  });
  const withSettings = {
    ...props,
    permissions: [...props.permissions, "settings.read"] as RouteShellProps["permissions"],
  };
  const element = routeShell(withSettings);
  const ssr = renderToString(element);
  browserWindow.document.body.innerHTML = `<div id="root">${ssr}</div>`;
  const container = browserWindow.document.getElementById("root");
  assert.ok(container);
  const recoverableErrors: Error[] = [];
  let root: Root | undefined;
  try {
    await act(async () => {
      root = hydrateRoot(container, element, { onRecoverableError: (error) => recoverableErrors.push(error) });
      await Promise.resolve();
    });
    assert.deepEqual(recoverableErrors, []);
    const trigger = container.querySelector<HTMLButtonElement>(".account-menu-trigger");
    assert.ok(trigger, "phone and tablet need one compact account-menu trigger");
    assert.equal(trigger.getAttribute("aria-expanded"), "false");

    await act(async () => trigger.click());
    assert.equal(trigger.getAttribute("aria-expanded"), "true");
    const menu = container.querySelector<HTMLElement>(".account-menu-popover");
    assert.ok(menu);
    assert.match(menu.textContent ?? "", /Hồ sơ/u);
    assert.match(menu.textContent ?? "", /Cài đặt đội/u);
    assert.match(menu.textContent ?? "", /Đăng xuất/u);

    await act(async () => {
      container.ownerDocument.dispatchEvent(new browserWindow.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    assert.equal(container.querySelector(".account-menu-popover"), null);
    assert.equal(container.ownerDocument.activeElement, trigger);

    await act(async () => trigger.click());
    assert.ok(container.querySelector(".account-menu-popover"));
    await act(async () => {
      container.ownerDocument.body.dispatchEvent(new browserWindow.Event("pointerdown", { bubbles: true }));
      await Promise.resolve();
    });
    assert.equal(container.querySelector(".account-menu-popover") === null, true);
  } finally {
    await act(async () => root?.unmount());
  }
});
