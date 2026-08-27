import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { Window } from "happy-dom";
import { build } from "vite";

import type { SquadAssignableRole, SquadPlayerDetail } from "../lib/squad/model";

type PlayerDetailProps = {
  slug: string;
  player: SquadPlayerDetail;
  canManage: boolean;
  assignableRoles: readonly SquadAssignableRole[];
};

type Root = {
  render: (node: React.ReactNode) => void;
  unmount: () => void;
};

let PlayerDetail: (props: PlayerDetailProps) => React.ReactNode;
let act: (callback: () => void | Promise<void>) => Promise<void>;
let createElement: typeof import("react").createElement;
let createRoot: (container: Element) => Root;
let browserWindow: Window & typeof globalThis;
const initialHandles = new Set(process._getActiveHandles());

const MEMBER_ROLE: SquadAssignableRole = {
  id: "00000000-0000-4000-8000-000000000011",
  name: "Cầu thủ",
  slug: "member",
  isSystem: true,
};
const CAPTAIN_ROLE: SquadAssignableRole = {
  id: "00000000-0000-4000-8000-000000000013",
  name: "Đội trưởng",
  slug: "captain",
  isSystem: false,
};
const PLAYER: SquadPlayerDetail = {
  userId: "00000000-0000-4000-8000-000000000010",
  displayName: "Nguyễn An",
  avatarPath: null,
  avatarUrl: null,
  membershipStatus: "active",
  role: MEMBER_ROLE,
  shirtNumber: 8,
  officialPosition: "MID",
  playerStatus: "available",
  joinDate: "2026-01-02",
  phone: null,
  dateOfBirth: null,
  heightCm: null,
  weightKg: null,
  preferredPositions: ["MID"],
  adminNotes: "Theo dõi",
};
const ROLES = [MEMBER_ROLE, CAPTAIN_ROLE];

test.before(async () => {
  browserWindow = new Window({ url: "https://pro7.example/teams/pro7-fc/squad/player" }) as unknown as Window & typeof globalThis;
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
    IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }

  const nodeEnvironment = process.env.NODE_ENV;
  const result = await build({
    configFile: false,
    plugins: [{
      name: "player-detail-navigation-boundary",
      enforce: "pre",
      resolveId(id) {
        return id === "next/navigation"
          ? resolve("tests/fixtures/player-detail-navigation.ts")
          : null;
      },
    }],
    build: {
      lib: {
        entry: resolve("tests/fixtures/player-detail-mounted-entry.ts"),
        formats: ["cjs"],
        fileName: "player-detail-mounted",
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
  ({ PlayerDetail, act, createElement, createRoot } = bundleModule.exports as {
    PlayerDetail: typeof PlayerDetail;
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

function element(player: SquadPlayerDetail, assignableRoles: readonly SquadAssignableRole[] = ROLES) {
  return createElement(PlayerDetail, {
    key: JSON.stringify([player.role.id, player.membershipStatus, player.shirtNumber, player.officialPosition, player.playerStatus, player.joinDate, player.adminNotes]),
    slug: "pro7-fc",
    player,
    canManage: true,
    assignableRoles,
  });
}

async function mounted(player: SquadPlayerDetail = PLAYER, assignableRoles: readonly SquadAssignableRole[] = ROLES) {
  browserWindow.document.body.innerHTML = '<div id="root"></div>';
  const container = browserWindow.document.getElementById("root");
  assert.ok(container);
  const root = createRoot(container);
  globalThis.__playerDetailRefresh = undefined;
  await act(async () => root.render(element(player, assignableRoles)));
  return { container, root };
}

function change(control: HTMLInputElement | HTMLSelectElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(control), "value");
  descriptor?.set?.call(control, value);
  control.dispatchEvent(new browserWindow.Event("input", { bubbles: true }));
  control.dispatchEvent(new browserWindow.Event("change", { bubbles: true }));
}

test("successful update refreshes authoritative hero role, position, and shirt number", async () => {
  const view = await mounted();
  const requests: Array<{ method: string; body: Record<string, unknown> }> = [];
  globalThis.fetch = async (_input, init) => {
    requests.push({ method: String(init?.method), body: JSON.parse(String(init?.body)) as Record<string, unknown> });
    return Response.json({ ok: true });
  };
  globalThis.__playerDetailRefresh = () => {
    view.root.render(element({
      ...PLAYER,
      role: CAPTAIN_ROLE,
      shirtNumber: 12,
      officialPosition: "DEF",
    }));
  };

  await act(async () => {
    change(view.container.querySelector('[name="roleId"]') as HTMLSelectElement, CAPTAIN_ROLE.id);
    change(view.container.querySelector('[name="shirtNumber"]') as HTMLInputElement, "12");
    change(view.container.querySelector('[name="officialPosition"]') as HTMLSelectElement, "DEF");
  });
  const form = view.container.querySelector("form.player-admin-form") as HTMLFormElement;
  await act(async () => {
    form.dispatchEvent(new browserWindow.Event("submit", { bubbles: true, cancelable: true }));
    await Promise.resolve();
    await Promise.resolve();
  });

  assert.deepEqual(requests, [{
    method: "PATCH",
    body: {
      roleId: CAPTAIN_ROLE.id,
      shirtNumber: 12,
      officialPosition: "DEF",
      playerStatus: "available",
      joinDate: "2026-01-02",
      adminNotes: "Theo dõi",
    },
  }]);
  assert.equal(view.container.querySelector(".player-profile-hero > strong")?.textContent, "#12");
  assert.equal(view.container.querySelector(".position-chip")?.textContent, "DEF");
  assert.equal(view.container.querySelector(".role-chip")?.textContent, "Đội trưởng");
  await act(async () => view.root.unmount());
});

test("successful deactivation refreshes authoritative status and removes manager controls", async () => {
  const view = await mounted();
  globalThis.fetch = async () => Response.json({ ok: true });
  globalThis.__playerDetailRefresh = () => {
    view.root.render(element({ ...PLAYER, membershipStatus: "inactive" }));
  };

  const confirmation = view.container.querySelector('input[placeholder="DEACTIVATE"]') as HTMLInputElement;
  await act(async () => change(confirmation, "DEACTIVATE"));
  const deactivate = view.container.querySelector("button.danger-button") as HTMLButtonElement;
  await act(async () => {
    deactivate.click();
    await Promise.resolve();
    await Promise.resolve();
  });

  assert.equal(view.container.querySelector(".membership-chip")?.textContent, "Ngừng hoạt động");
  assert.equal(view.container.querySelector("form.player-admin-form"), null);
  assert.equal(view.container.querySelector("button.danger-button"), null);
  await act(async () => view.root.unmount());
});

test("tampered role values are rejected before fetch and identify the invalid field", async () => {
  const view = await mounted();
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    return Response.json({ ok: true });
  };
  const role = view.container.querySelector('[name="roleId"]') as HTMLSelectElement;
  const forged = browserWindow.document.createElement("option");
  forged.value = "00000000-0000-4000-8000-000000000099";
  forged.textContent = "Forged role";
  role.append(forged);
  await act(async () => change(role, forged.value));

  const form = view.container.querySelector("form.player-admin-form") as HTMLFormElement;
  await act(async () => {
    form.dispatchEvent(new browserWindow.Event("submit", { bubbles: true, cancelable: true }));
  });

  assert.equal(fetchCalls, 0);
  assert.equal(role.getAttribute("aria-invalid"), "true");
  assert.equal(role.getAttribute("aria-describedby"), "player-error-roleId");
  assert.equal(view.container.querySelector("#player-error-roleId")?.textContent, "Chọn một vai trò hợp lệ của đội.");
  await act(async () => view.root.unmount());
});

test("restricted-role dual manager keeps official mutations with the unchanged role ID", async () => {
  const restrictedPlayer: SquadPlayerDetail = {
    ...PLAYER,
    role: {
      id: MEMBER_ROLE.id,
      name: "Không có quyền xem vai trò",
      slug: "",
      isSystem: false,
      isVisible: false,
    },
  };
  const view = await mounted(restrictedPlayer, []);
  const bodies: Array<Record<string, unknown>> = [];
  globalThis.fetch = async (_input, init) => {
    bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    return Response.json({ ok: true });
  };
  globalThis.__playerDetailRefresh = () => {};

  assert.equal(view.container.querySelector('[name="roleId"]'), null);
  assert.ok(view.container.querySelector('[name="shirtNumber"]'));
  assert.ok(view.container.querySelector("button.danger-button"));
  const form = view.container.querySelector("form.player-admin-form") as HTMLFormElement;
  await act(async () => {
    form.dispatchEvent(new browserWindow.Event("submit", { bubbles: true, cancelable: true }));
    await Promise.resolve();
    await Promise.resolve();
  });

  assert.equal(bodies[0]?.roleId, MEMBER_ROLE.id);
  await act(async () => view.root.unmount());
});

declare global {
  var __playerDetailRefresh: (() => void) | undefined;
}
