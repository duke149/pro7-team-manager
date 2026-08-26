import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { Window } from "happy-dom";
import { build } from "vite";

import type { SquadFilters } from "../lib/squad/filters";

type ToolbarProps = { slug: string; filters: SquadFilters; disabled?: boolean };
type Root = { unmount: () => void };

let SquadToolbar: (props: ToolbarProps) => React.ReactNode;
let act: (callback: () => void | Promise<void>) => Promise<void>;
let createElement: typeof import("react").createElement;
let createRoot: (container: Element) => { render: (node: React.ReactNode) => void; unmount: () => void };
let browserWindow: Window & typeof globalThis;
const initialHandles = new Set(process._getActiveHandles());

const FILTERS: SquadFilters = Object.freeze({
  q: "",
  searchPattern: null,
  position: "GK",
  status: "active",
  sort: "name",
  direction: "asc",
});

test.before(async () => {
  browserWindow = new Window({ url: "https://pro7.example/teams/pro7-fc/squad" }) as unknown as Window & typeof globalThis;
  for (const [key, value] of Object.entries({
    window: browserWindow,
    document: browserWindow.document,
    navigator: browserWindow.navigator,
    HTMLElement: browserWindow.HTMLElement,
    HTMLInputElement: browserWindow.HTMLInputElement,
    HTMLSelectElement: browserWindow.HTMLSelectElement,
    Node: browserWindow.Node,
    Event: browserWindow.Event,
    FormData: browserWindow.FormData,
    IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }

  const nodeEnvironment = process.env.NODE_ENV;
  const result = await build({
    configFile: false,
    plugins: [{
      name: "squad-toolbar-navigation-boundary",
      enforce: "pre",
      resolveId(id) {
        return id === "next/navigation"
          ? resolve("tests/fixtures/squad-toolbar-navigation.ts")
          : null;
      },
    }],
    build: {
      lib: {
        entry: resolve("tests/fixtures/squad-toolbar-mounted-entry.ts"),
        formats: ["cjs"],
        fileName: "squad-toolbar-mounted",
      },
      write: false,
    },
  });
  process.env.NODE_ENV = nodeEnvironment ?? "test";
  const bundledCode = (Array.isArray(result) ? result : [result])
    .flatMap((bundle) => bundle.output)
    .find((output) => output.type === "chunk")?.code;
  assert.ok(bundledCode);
  const bundleModule = { exports: {} as Record<string, unknown> };
  new Function("module", "exports", bundledCode)(bundleModule, bundleModule.exports);
  ({ SquadToolbar, act, createElement, createRoot } = bundleModule.exports as {
    SquadToolbar: typeof SquadToolbar;
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
  globalThis.__squadToolbarPushes = [];
  await act(async () => root.render(createElement(SquadToolbar, { slug: "pro7-fc", filters: FILTERS })));
  return { container, root: root as Root };
}

function change(control: HTMLInputElement | HTMLSelectElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(control), "value");
  descriptor?.set?.call(control, value);
  control.dispatchEvent(new browserWindow.Event("input", { bubbles: true }));
  control.dispatchEvent(new browserWindow.Event("change", { bubbles: true }));
}

function submit(form: HTMLFormElement) {
  form.dispatchEvent(new browserWindow.Event("submit", { bubbles: true, cancelable: true }));
}

test("search submit uses client navigation and preserves every active filter", async () => {
  const view = await mounted();
  const form = view.container.querySelector("form.search-box") as HTMLFormElement;
  await act(async () => {
    change(form.elements.namedItem("q") as HTMLInputElement, "Nguyễn An");
    submit(form);
  });

  assert.deepEqual(globalThis.__squadToolbarPushes, [
    "/teams/pro7-fc/squad?q=Nguy%E1%BB%85n+An&position=GK&status=active&sort=name&direction=asc",
  ]);
  await act(async () => view.root.unmount());
});

test("filter submit uses client navigation and preserves search and position", async () => {
  const view = await mounted();
  const form = view.container.querySelector("details.squad-filter-panel form") as HTMLFormElement;
  await act(async () => {
    change(form.elements.namedItem("status") as HTMLSelectElement, "injured");
    change(form.elements.namedItem("sort") as HTMLSelectElement, "shirt_number");
    change(form.elements.namedItem("direction") as HTMLSelectElement, "desc");
    submit(form);
  });

  assert.deepEqual(globalThis.__squadToolbarPushes, [
    "/teams/pro7-fc/squad?q=&position=GK&status=injured&sort=shirt_number&direction=desc",
  ]);
  await act(async () => view.root.unmount());
});

declare global {
  var __squadToolbarPushes: string[] | undefined;
}
