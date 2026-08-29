import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { Window } from "happy-dom";
import { build } from "vite";

import type { ProfileRecord } from "../lib/account/profile";

const USER_ID = "00000000-0000-4000-8000-000000000001";
const PROFILE: ProfileRecord = {
  id: USER_ID,
  displayName: "Nguyễn An",
  phone: null,
  dateOfBirth: null,
  heightCm: null,
  weightKg: null,
  preferredPositions: [],
  avatarPath: `${USER_ID}/avatar.png`,
};

type Root = { unmount: () => void };
type ProfileFormProps = { profile: ProfileRecord; email: string; avatarUrl: string | null; initials: string };
let ProfileForm: (props: ProfileFormProps) => React.ReactNode;
let act: (callback: () => void | Promise<void>) => Promise<void>;
let createElement: typeof import("react").createElement;
let createRoot: (container: Element) => Root;
let browserWindow: Window & typeof globalThis;
const initialHandles = new Set(process._getActiveHandles());

test.before(async () => {
  browserWindow = new Window({ url: "https://pro7.example/account/profile" }) as Window & typeof globalThis;
  for (const [key, value] of Object.entries({
    window: browserWindow,
    document: browserWindow.document,
    navigator: browserWindow.navigator,
    HTMLElement: browserWindow.HTMLElement,
    HTMLInputElement: browserWindow.HTMLInputElement,
    HTMLImageElement: browserWindow.HTMLImageElement,
    HTMLCanvasElement: browserWindow.HTMLCanvasElement,
    Event: browserWindow.Event,
    File: browserWindow.File,
    Blob: browserWindow.Blob,
    URL: browserWindow.URL,
    IS_REACT_ACT_ENVIRONMENT: true,
  })) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });

  const output = await build({
    configFile: false,
    define: { "process.env.NODE_ENV": '"test"' },
    plugins: [{
      name: "profile-avatar-crop-browser-client",
      enforce: "pre",
      resolveId(id) { return id.includes("lib/supabase/client") ? resolve("tests/fixtures/product-shell-browser-client.ts") : null; },
    }],
    build: {
      lib: { entry: resolve("tests/fixtures/profile-form-mounted-entry.ts"), formats: ["cjs"], fileName: "profile-form-mounted" },
      write: false,
    },
  });
  const code = (Array.isArray(output) ? output : [output]).flatMap((item) => item.output)
    .find((item) => item.type === "chunk" && item.isEntry)?.code;
  assert.ok(code);
  const bundleModule = { exports: {} as Record<string, unknown> };
  new Function("module", "exports", code)(bundleModule, bundleModule.exports);
  ({ ProfileForm, act, createElement, createRoot } = bundleModule.exports as {
    ProfileForm: typeof ProfileForm;
    act: typeof act;
    createElement: typeof createElement;
    createRoot: typeof createRoot;
  });
});

test.after(async () => {
  await browserWindow.happyDOM.abort();
  browserWindow.close();
  for (const handle of process._getActiveHandles()) {
    if (!initialHandles.has(handle) && handle.constructor.name === "MessagePort") (handle as MessagePort).close();
  }
});

async function mounted() {
  browserWindow.document.body.innerHTML = '<div id="root"></div>';
  const container = browserWindow.document.getElementById("root");
  assert.ok(container);
  const uploads: Array<{ path: string; type: string; size: number }> = [];
  const removed: string[][] = [];
  const persistence: unknown[] = [];
  const revoked: string[] = [];
  Object.defineProperties(browserWindow.URL, {
    createObjectURL: { configurable: true, value: () => "blob:avatar-preview" },
    revokeObjectURL: { configurable: true, value: (value: string) => revoked.push(value) },
  });
  Object.defineProperties(browserWindow.HTMLCanvasElement.prototype, {
    getContext: { configurable: true, value: () => ({ drawImage: () => undefined }) },
    toBlob: { configurable: true, value: (callback: (blob: Blob | null) => void, type?: string) => callback(new browserWindow.Blob(["cropped"], { type })) },
  });
  Object.assign(globalThis, {
    __productShellBrowserClient: {
      auth: { getUser: async () => ({ data: { user: { id: USER_ID } }, error: null }) },
      storage: { from: () => ({
        upload: async (path: string, file: File) => {
          uploads.push({ path, type: file.type, size: file.size });
          return { error: null };
        },
        remove: async (paths: string[]) => { removed.push(paths); return { error: null }; },
      }) },
    },
    fetch: async (_input: string | URL | Request, init?: RequestInit) => {
      persistence.push(JSON.parse(String(init?.body)));
      return Response.json({ ok: true });
    },
  });
  Object.defineProperty(browserWindow.location, "reload", { configurable: true, value: () => undefined });
  const root = createRoot(container);
  await act(async () => root.render(createElement(ProfileForm, { profile: PROFILE, email: "an@example.com", avatarUrl: null, initials: "NA" })));
  return { container, root, uploads, removed, persistence, revoked };
}

function selectFile(input: HTMLInputElement, file: File) {
  Object.defineProperty(input, "files", { configurable: true, value: [file] });
  input.dispatchEvent(new browserWindow.Event("change", { bubbles: true }));
}

test("profile avatar selection crops a local preview into a canonical WebP upload and releases the temporary URL", async () => {
  const view = await mounted();
  const input = view.container.querySelector<HTMLInputElement>('input[type="file"]');
  assert.ok(input);
  await act(async () => selectFile(input, new browserWindow.File(["original"], "portrait.png", { type: "image/png" })));
  const image = view.container.querySelector<HTMLImageElement>("img.account-avatar-crop-image");
  assert.ok(image);
  Object.defineProperties(image, { naturalWidth: { configurable: true, value: 1200 }, naturalHeight: { configurable: true, value: 800 } });
  await act(async () => image.dispatchEvent(new browserWindow.Event("load", { bubbles: true })));
  const save = [...view.container.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.includes("Lưu ảnh"));
  assert.ok(save);
  await act(async () => { save.click(); await new Promise((resolvePromise) => setTimeout(resolvePromise, 0)); });
  assert.deepEqual(view.uploads, [{ path: `${USER_ID}/avatar.webp`, type: "image/webp", size: 7 }]);
  assert.deepEqual(view.persistence, [{ avatarPath: `${USER_ID}/avatar.webp` }]);
  assert.deepEqual(view.removed, [[`${USER_ID}/avatar.png`]]);
  assert.deepEqual(view.revoked, ["blob:avatar-preview"]);
  await act(async () => view.root.unmount());
});

test("profile avatar crop cancel performs no upload and releases its temporary local preview", async () => {
  const view = await mounted();
  const input = view.container.querySelector<HTMLInputElement>('input[type="file"]');
  assert.ok(input);
  await act(async () => selectFile(input, new browserWindow.File(["original"], "portrait.png", { type: "image/png" })));
  const cancel = [...view.container.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.trim() === "Hủy");
  assert.ok(cancel);
  await act(async () => cancel.click());
  assert.deepEqual(view.uploads, []);
  assert.deepEqual(view.persistence, []);
  assert.deepEqual(view.revoked, ["blob:avatar-preview"]);
  await act(async () => view.root.unmount());
});
