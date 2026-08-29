import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { Window } from "happy-dom";
import { build } from "vite";

type Root = { unmount: () => void };
type AvatarCropDialogProps = {
  previewUrl: string;
  fileName: string;
  onCancel: () => void;
  onConfirm: (image: HTMLImageElement, dimensions: { width: number; height: number }, transform: { zoom: number; panX: number; panY: number }) => void;
};

let AvatarCropDialog: (props: AvatarCropDialogProps) => React.ReactNode;
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
    HTMLImageElement: browserWindow.HTMLImageElement,
    HTMLInputElement: browserWindow.HTMLInputElement,
    Event: browserWindow.Event,
    IS_REACT_ACT_ENVIRONMENT: true,
  })) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });

  const output = await build({
    configFile: false,
    define: { "process.env.NODE_ENV": '"test"' },
    build: {
      lib: { entry: resolve("tests/fixtures/avatar-crop-dialog-mounted-entry.ts"), formats: ["cjs"], fileName: "avatar-crop-dialog-mounted" },
      write: false,
    },
  });
  const code = (Array.isArray(output) ? output : [output]).flatMap((item) => item.output)
    .find((item) => item.type === "chunk" && item.isEntry)?.code;
  assert.ok(code);
  const bundleModule = { exports: {} as Record<string, unknown> };
  new Function("module", "exports", code)(bundleModule, bundleModule.exports);
  ({ AvatarCropDialog, act, createElement, createRoot } = bundleModule.exports as {
    AvatarCropDialog: typeof AvatarCropDialog;
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
  const root = createRoot(container);
  const calls: Array<{ width: number; height: number; zoom: number }> = [];
  let cancelled = 0;
  await act(async () => root.render(createElement(AvatarCropDialog, {
    previewUrl: "blob:avatar-preview",
    fileName: "me.png",
    onCancel: () => { cancelled += 1; },
    onConfirm: (_image, dimensions, transform) => calls.push({ width: dimensions.width, height: dimensions.height, zoom: transform.zoom }),
  })));
  return { container, root, calls, cancelled: () => cancelled };
}

function setValue(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), "value")?.set?.call(input, value);
  input.dispatchEvent(new browserWindow.Event("input", { bubbles: true }));
  input.dispatchEvent(new browserWindow.Event("change", { bubbles: true }));
}

test("avatar crop dialog waits for a decoded source, then returns the chosen zoom with real source dimensions", async () => {
  const view = await mounted();
  const save = [...view.container.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.includes("Lưu ảnh"));
  assert.ok(save);
  assert.equal(save.disabled, true);
  const image = view.container.querySelector<HTMLImageElement>("img.account-avatar-crop-image");
  assert.ok(image);
  Object.defineProperties(image, { naturalWidth: { configurable: true, value: 1200 }, naturalHeight: { configurable: true, value: 800 } });
  await act(async () => image.dispatchEvent(new browserWindow.Event("load", { bubbles: true })));
  assert.equal(save.disabled, false);
  const zoom = view.container.querySelector<HTMLInputElement>('input[name="avatarZoom"]');
  assert.ok(zoom);
  await act(async () => setValue(zoom, "2"));
  await act(async () => save.click());
  assert.deepEqual(view.calls, [{ width: 1200, height: 800, zoom: 2 }]);
  await act(async () => view.root.unmount());
});

test("avatar crop dialog cancels without submitting an image", async () => {
  const view = await mounted();
  const cancel = [...view.container.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.trim() === "Hủy");
  assert.ok(cancel);
  await act(async () => cancel.click());
  assert.equal(view.cancelled(), 1);
  assert.deepEqual(view.calls, []);
  await act(async () => view.root.unmount());
});
