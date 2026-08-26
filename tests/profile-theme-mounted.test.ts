import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { Window } from "happy-dom";
import { build } from "vite";

type Root = { unmount: () => void };
type ProfileShellProps = { children: React.ReactNode; email?: string };

let ProfileShell: (props: ProfileShellProps) => React.ReactNode;
let act: (callback: () => void | Promise<void>) => Promise<void>;
let createElement: typeof import("react").createElement;
let hydrateRoot: (
  container: Element,
  children: React.ReactNode,
  options: { onRecoverableError: (error: Error) => void },
) => Root;
let renderToString: (node: React.ReactNode) => string;
let browserWindow: Window & typeof globalThis;
const initialHandles = new Set(process._getActiveHandles());

test.before(async () => {
  browserWindow = new Window({ url: "https://pro7.example/account/profile" }) as unknown as Window & typeof globalThis;
  for (const [key, value] of Object.entries({
    window: browserWindow,
    document: browserWindow.document,
    navigator: browserWindow.navigator,
    HTMLElement: browserWindow.HTMLElement,
    Node: browserWindow.Node,
    Event: browserWindow.Event,
    MouseEvent: browserWindow.MouseEvent,
    IS_REACT_ACT_ENVIRONMENT: true,
  })) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });

  const nodeEnvironment = process.env.NODE_ENV;
  const result = await build({
    configFile: false,
    plugins: [{
      name: "profile-shell-browser-boundaries",
      enforce: "pre",
      resolveId(id) {
        if (id.includes("lib/supabase/client")) {
          return resolve("tests/fixtures/product-shell-browser-client.ts");
        }
        return null;
      },
    }],
    build: {
      lib: {
        entry: resolve("tests/fixtures/profile-shell-mounted-entry.ts"),
        formats: ["cjs"],
        fileName: "profile-shell-mounted",
      },
      write: false,
    },
  });
  process.env.NODE_ENV = nodeEnvironment ?? "test";
  const code = (Array.isArray(result) ? result : [result])
    .flatMap((output) => output.output)
    .find((output) => output.type === "chunk" && output.isEntry)?.code;
  assert.ok(code);
  const bundleModule = { exports: {} as Record<string, unknown> };
  new Function("module", "exports", code)(bundleModule, bundleModule.exports);
  ({ ProfileShell, act, createElement, hydrateRoot, renderToString } = bundleModule.exports as {
    ProfileShell: typeof ProfileShell;
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

function configureBrowser(storedTheme: "light" | "dark", prefersDark: boolean) {
  const values = new Map([["pro7-theme", storedTheme]]);
  const writes: string[] = [];
  let nextTimerId = 1;
  const timers = new Map<number, () => void>();
  Object.defineProperty(browserWindow, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        writes.push(`${key}:${value}`);
        values.set(key, value as "light" | "dark");
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
  Object.assign(globalThis, {
    __productShellBrowserClient: {
      auth: {
        signOut: async () => ({ error: null }),
        getSession: async () => ({ data: { session: null }, error: null }),
      },
    },
  });
  return { timers, writes };
}

function shellElement() {
  return createElement(
    ProfileShell,
    { email: "member@example.com" },
    createElement("section", null, "Hồ sơ thật"),
  );
}

async function hydrate(markup: string) {
  browserWindow.document.body.innerHTML = `<div id="root">${markup}</div>`;
  const container = browserWindow.document.getElementById("root");
  assert.ok(container);
  const recoverableErrors: Error[] = [];
  let root: Root | undefined;
  await act(async () => {
    root = hydrateRoot(container, shellElement(), {
      onRecoverableError: (error) => recoverableErrors.push(error),
    });
    await Promise.resolve();
  });
  assert.ok(root);
  assert.deepEqual(recoverableErrors, []);
  return { container, root };
}

function themeButton(container: Element): HTMLButtonElement {
  const button = container.querySelector("button.theme-button");
  assert.ok(button);
  return button as HTMLButtonElement;
}

test("profile shell hydrates persisted dark while persisted light overrides a dark OS preference", async () => {
  const darkBrowser = configureBrowser("dark", false);
  const darkSsr = renderToString(shellElement());
  assert.match(darkSsr, /account-profile-shell light/u);
  const dark = await hydrate(darkSsr);
  assert.equal(darkBrowser.timers.size, 1);
  await act(async () => {
    for (const callback of darkBrowser.timers.values()) callback();
    darkBrowser.timers.clear();
  });
  assert.match(dark.container.innerHTML, /account-profile-shell dark/u);
  assert.equal(themeButton(dark.container).getAttribute("aria-pressed"), "true");
  assert.equal(themeButton(dark.container).getAttribute("aria-label"), "Bật giao diện sáng");
  await act(async () => dark.root.unmount());

  const lightBrowser = configureBrowser("light", true);
  const lightSsr = renderToString(shellElement());
  const light = await hydrate(lightSsr);
  assert.equal(lightBrowser.timers.size, 0);
  assert.match(light.container.innerHTML, /account-profile-shell light/u);
  assert.equal(themeButton(light.container).getAttribute("aria-pressed"), "false");
  await act(async () => light.root.unmount());
});

test("profile theme toggle cancels pending hydration resolution and persists the latest choice", async () => {
  const browser = configureBrowser("dark", false);
  const mounted = await hydrate(renderToString(shellElement()));
  assert.equal(browser.timers.size, 1);

  await act(async () => themeButton(mounted.container).click());
  assert.match(mounted.container.innerHTML, /account-profile-shell dark/u);
  assert.equal(browser.timers.size, 0);
  await act(async () => themeButton(mounted.container).click());

  assert.match(mounted.container.innerHTML, /account-profile-shell light/u);
  assert.deepEqual(browser.writes, ["pro7-theme:dark", "pro7-theme:light"]);
  await act(async () => mounted.root.unmount());
});
