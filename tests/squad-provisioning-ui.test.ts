import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { Window } from "happy-dom";
import { build } from "vite";

import type { SquadFilters } from "../lib/squad/filters";
import type { SquadAssignableRole, SquadListResult } from "../lib/squad/model";
import type { TeamAccessContext } from "../lib/teams/context";

type SquadViewProps = {
  team: TeamAccessContext["team"];
  permissions: TeamAccessContext["permissions"];
  filters: SquadFilters;
  result: SquadListResult;
  assignableRoles?: readonly SquadAssignableRole[];
  showProvisioning?: boolean;
};
type Root = { render(node: React.ReactNode): void; unmount(): void };

let SquadView: (props: SquadViewProps) => React.ReactNode;
let act: (callback: () => void | Promise<void>) => Promise<void>;
let createElement: typeof import("react").createElement;
let createRoot: (container: Element) => Root;
let browserWindow: Window & typeof globalThis;
const initialHandles = new Set(process._getActiveHandles());

const TEAM = { id: "00000000-0000-4000-8000-000000000001", name: "PRO7 FC", slug: "pro7-fc" };
const ROLE: SquadAssignableRole = {
  id: "00000000-0000-4000-8000-000000000002",
  name: "Cầu thủ",
  slug: "member",
  isSystem: true,
};
const FILTERS: SquadFilters = Object.freeze({
  q: "",
  searchPattern: null,
  position: "all",
  status: "active",
  sort: "name",
  direction: "asc",
});

test.before(async () => {
  browserWindow = new Window({ url: "http://localhost:3000/teams/pro7-fc/squad?add=player" }) as unknown as Window & typeof globalThis;
  for (const [key, value] of Object.entries({
    window: browserWindow,
    document: browserWindow.document,
    navigator: browserWindow.navigator,
    HTMLElement: browserWindow.HTMLElement,
    HTMLInputElement: browserWindow.HTMLInputElement,
    HTMLSelectElement: browserWindow.HTMLSelectElement,
    Node: browserWindow.Node,
    Event: browserWindow.Event,
    MouseEvent: browserWindow.MouseEvent,
    FormData: browserWindow.FormData,
    IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }

  const nodeEnvironment = process.env.NODE_ENV;
  const clientFixture = resolve("tests/fixtures/squad-provisioning-browser-client.ts");
  const result = await build({
    configFile: false,
    plugins: [{
      name: "squad-provisioning-browser-client",
      enforce: "pre",
      resolveId(id) {
        if (id === "next/navigation") {
          return resolve("tests/fixtures/squad-toolbar-navigation.ts");
        }
        return id.endsWith("lib/supabase/client") ? clientFixture : null;
      },
    }],
    build: {
      lib: {
        entry: resolve("tests/fixtures/squad-view-mounted-entry.ts"),
        formats: ["cjs"],
        fileName: "squad-view-mounted",
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
  ({ SquadView, act, createElement, createRoot } = bundleModule.exports as {
    SquadView: typeof SquadView;
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

async function mounted(overrides: Partial<SquadViewProps> = {}) {
  browserWindow.document.body.innerHTML = '<div id="root"></div>';
  const container = browserWindow.document.getElementById("root");
  assert.ok(container);
  const root = createRoot(container);
  const props: SquadViewProps = {
    team: TEAM,
    permissions: ["players.read", "players.manage", "members.manage", "roles.read"],
    filters: FILTERS,
    result: { ok: true, players: [] },
    assignableRoles: [ROLE],
    showProvisioning: true,
    ...overrides,
  };
  await act(async () => root.render(createElement(SquadView, props)));
  return { container, root };
}

function change(control: HTMLInputElement | HTMLSelectElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(control), "value");
  descriptor?.set?.call(control, value);
  control.dispatchEvent(new browserWindow.Event("input", { bubbles: true }));
  control.dispatchEvent(new browserWindow.Event("change", { bubbles: true }));
}

test("authorized add-player route reuses the PRO7 modal and keeps the hosted Squad hierarchy", async () => {
  const view = await mounted();
  assert.ok(view.container.querySelector(".squad-toolbar"));
  assert.ok(view.container.querySelector(".squad-summary"));
  assert.ok(view.container.querySelector(".player-grid"));
  assert.ok(view.container.querySelector(".modal-layer .modal"));
  assert.equal(view.container.querySelector(".modal-head h2")?.textContent, "Thêm cầu thủ");
  assert.match(view.container.textContent ?? "", /Tạo hồ sơ thành viên mới/u);
  for (const name of ["displayName", "email", "roleId", "shirtNumber", "officialPosition", "joinDate"]) {
    assert.ok(view.container.querySelector(`[name="${name}"]`), name);
  }

  const hidden = await mounted({
    permissions: ["players.read", "players.manage"],
    showProvisioning: true,
  });
  assert.equal(hidden.container.querySelector(".modal-layer"), null);
  assert.doesNotMatch(hidden.container.textContent ?? "", /Đăng ký thành viên mới/u);
  await act(async () => view.root.unmount());
  await act(async () => hidden.root.unmount());
});

test("provisioning form invokes the authenticated function and holds a new password only in the one-time dialog", async () => {
  const calls: Array<{ name: string; options: Record<string, unknown> }> = [];
  const storageWrites: string[] = [];
  browserWindow.localStorage.setItem = (key) => storageWrites.push(`local:${key}`);
  browserWindow.sessionStorage.setItem = (key) => storageWrites.push(`session:${key}`);
  globalThis.__provisioningClient = {
    auth: {
      async getSession() {
        return { data: { session: { access_token: "browser-token" } } };
      },
    },
    functions: {
      async invoke(name: string, options: Record<string, unknown>) {
        calls.push({ name, options });
        return {
          data: {
            ok: true,
            account: "created",
            userId: "00000000-0000-4000-8000-000000000004",
            temporaryPassword: "Temp-Account-7!Secure#9",
          },
          error: null,
        };
      },
    },
  };
  const view = await mounted();
  const form = view.container.querySelector("form.provision-member-form") as HTMLFormElement;
  await act(async () => {
    change(form.elements.namedItem("displayName") as HTMLInputElement, "  Nguyễn Minh Anh  ");
    change(form.elements.namedItem("email") as HTMLInputElement, "  PLAYER@Example.COM ");
    change(form.elements.namedItem("roleId") as HTMLSelectElement, ROLE.id);
    change(form.elements.namedItem("shirtNumber") as HTMLInputElement, "17");
    change(form.elements.namedItem("officialPosition") as HTMLSelectElement, "MID");
    change(form.elements.namedItem("joinDate") as HTMLInputElement, "2026-08-25");
    form.dispatchEvent(new browserWindow.Event("submit", { bubbles: true, cancelable: true }));
    await Promise.resolve();
    await Promise.resolve();
  });

  assert.deepEqual(calls, [{
    name: "provision-team-member",
    options: {
      headers: { Authorization: "Bearer browser-token" },
      body: {
        teamId: TEAM.id,
        email: "player@example.com",
        displayName: "Nguyễn Minh Anh",
        roleId: ROLE.id,
        shirtNumber: 17,
        officialPosition: "MID",
        joinDate: "2026-08-25",
      },
    },
  }]);
  assert.equal(view.container.querySelector(".one-time-password")?.textContent, "Temp-Account-7!Secure#9");
  assert.match(view.container.textContent ?? "", /chỉ hiển thị một lần/u);
  assert.ok(view.container.querySelector('button[type="button"] svg'));
  assert.deepEqual(storageWrites, []);
  assert.equal(browserWindow.location.href.includes("Temp-Account"), false);
  await act(async () => view.root.unmount());
});

declare global {
  var __provisioningClient: unknown;
}
