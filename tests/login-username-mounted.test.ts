import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { Window } from "happy-dom";
import { build } from "vite";

type Root = { unmount: () => void };
type LoginFormProps = { next: string; initialError?: string };

let LoginForm: (props: LoginFormProps) => React.ReactNode;
let act: (callback: () => void | Promise<void>) => Promise<void>;
let createElement: typeof import("react").createElement;
let createRoot: (container: Element) => { render: (node: React.ReactNode) => void; unmount: () => void };
let browserWindow: Window & typeof globalThis;
const initialHandles = new Set(process._getActiveHandles());

test.before(async () => {
  browserWindow = new Window({ url: "https://pro7.example/login" }) as unknown as Window & typeof globalThis;
  for (const [key, value] of Object.entries({
    window: browserWindow,
    document: browserWindow.document,
    navigator: browserWindow.navigator,
    HTMLElement: browserWindow.HTMLElement,
    HTMLInputElement: browserWindow.HTMLInputElement,
    Node: browserWindow.Node,
    Event: browserWindow.Event,
    IS_REACT_ACT_ENVIRONMENT: true,
  })) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });

  const nodeEnvironment = process.env.NODE_ENV;
  process.env.NODE_ENV = "test";
  const result = await build({
    configFile: false,
    plugins: [{
      name: "login-username-browser-boundary",
      enforce: "pre",
      resolveId(id) {
        return id.includes("lib/supabase/client")
          ? resolve("tests/fixtures/login-username-browser-client.ts")
          : null;
      },
    }],
    build: {
      lib: {
        entry: resolve("tests/fixtures/login-username-mounted-entry.ts"),
        formats: ["cjs"],
        fileName: "login-username-mounted",
      },
      write: false,
    },
  });
  process.env.NODE_ENV = nodeEnvironment;
  const code = (Array.isArray(result) ? result : [result])
    .flatMap((output) => output.output)
    .find((output) => output.type === "chunk" && output.isEntry)?.code;
  assert.ok(code);
  const bundleModule = { exports: {} as Record<string, unknown> };
  new Function("module", "exports", code)(bundleModule, bundleModule.exports);
  ({ LoginForm, act, createElement, createRoot } = bundleModule.exports as {
    LoginForm: typeof LoginForm;
    act: typeof act;
    createElement: typeof createElement;
    createRoot: typeof createRoot;
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

async function mounted() {
  browserWindow.document.body.innerHTML = '<div id="root"></div>';
  const container = browserWindow.document.getElementById("root");
  assert.ok(container);
  const root = createRoot(container);
  const calls: Array<{ email: string; password: string }> = [];
  globalThis.__loginUsernameClient = {
    auth: {
      signInWithPassword: async (payload: { email: string; password: string }) => {
        calls.push(payload);
        return { data: { user: null, session: null }, error: new Error("invalid") };
      },
    },
  };
  await act(async () => root.render(createElement(LoginForm, { next: "/" })));
  return { calls, container, root: root as Root };
}

function change(input: HTMLInputElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), "value");
  descriptor?.set?.call(input, value);
  input.dispatchEvent(new browserWindow.Event("input", { bubbles: true }));
  input.dispatchEvent(new browserWindow.Event("change", { bubbles: true }));
}

async function submit(container: Element, identifier: string, password = "unit-test-only-passphrase") {
  const identifierInput = container.querySelector('input[name="identifier"]') as HTMLInputElement | null;
  assert.ok(identifierInput);
  const passwordInput = container.querySelector('input[name="password"]') as HTMLInputElement | null;
  assert.ok(passwordInput);
  await act(async () => {
    change(identifierInput, identifier);
    change(passwordInput, password);
    (container.querySelector("form") as HTMLFormElement).dispatchEvent(
      new browserWindow.Event("submit", { bubbles: true, cancelable: true }),
    );
    await Promise.resolve();
  });
  return identifierInput;
}

test("Login submits a username through the internal email boundary while retaining visible input", async () => {
  const view = await mounted();
  const input = await submit(view.container, "DucLee");
  assert.deepEqual(view.calls, [{ email: "duclee@pro7.test", password: "unit-test-only-passphrase" }]);
  assert.equal(input.value, "DucLee");
  assert.equal(input.type, "text");
  assert.equal(input.autocomplete, "username");
  await act(async () => view.root.unmount());
});

test("Login preserves ordinary email auth and rejects malformed usernames before Supabase", async () => {
  const emailView = await mounted();
  await submit(emailView.container, "PRO7.DEMO.20260825@GMAIL.COM", "owner-pass");
  assert.deepEqual(emailView.calls, [{ email: "pro7.demo.20260825@gmail.com", password: "owner-pass" }]);
  await act(async () => emailView.root.unmount());

  const invalidView = await mounted();
  await submit(invalidView.container, "đức lee");
  assert.deepEqual(invalidView.calls, []);
  assert.match(invalidView.container.textContent ?? "", /Không thể đăng nhập/u);
  await act(async () => invalidView.root.unmount());
});

declare global {
  var __loginUsernameClient: unknown;
}
