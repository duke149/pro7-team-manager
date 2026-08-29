import assert from "node:assert/strict";
import test from "node:test";

import {
  AVATAR_CROP_MAX_ZOOM,
  clampAvatarCropTransform,
  createAvatarCropDrawPlan,
  renderAvatarCropBlob,
  type AvatarCropTransform,
} from "../lib/account/avatar-crop";

test("avatar crop starts centered and covers a square output without stretching a landscape source", () => {
  const plan = createAvatarCropDrawPlan(
    { width: 1200, height: 800 },
    { zoom: 1, panX: 0, panY: 0 },
  );

  assert.deepEqual(plan, {
    sourceX: 200,
    sourceY: 0,
    sourceWidth: 800,
    sourceHeight: 800,
    outputSize: 512,
  });
});

test("avatar crop clamps zoom and pan so a drag never leaves an empty edge", () => {
  const transform: AvatarCropTransform = {
    zoom: AVATAR_CROP_MAX_ZOOM + 9,
    panX: 4,
    panY: -4,
  };

  assert.deepEqual(
    clampAvatarCropTransform({ width: 800, height: 1200 }, transform),
    { zoom: AVATAR_CROP_MAX_ZOOM, panX: 1.5, panY: -2.5 },
  );
});

test("avatar crop uses the clamped transform for the exported source rectangle", () => {
  const plan = createAvatarCropDrawPlan(
    { width: 1200, height: 800 },
    { zoom: 1, panX: 4, panY: -4 },
  );

  assert.deepEqual(plan, {
    sourceX: 0,
    sourceY: 0,
    sourceWidth: 800,
    sourceHeight: 800,
    outputSize: 512,
  });
});

test("avatar crop refuses malformed image dimensions instead of producing an invalid canvas plan", () => {
  for (const dimensions of [
    { width: 0, height: 800 },
    { width: 800, height: Number.NaN },
    { width: -2, height: 800 },
  ]) {
    assert.throws(
      () => createAvatarCropDrawPlan(dimensions, { zoom: 1, panX: 0, panY: 0 }),
      /Invalid avatar image dimensions/u,
    );
  }
});

test("avatar crop rasterizer exports the selected square as WebP without ever uploading the original source", async () => {
  const source = {} as CanvasImageSource;
  const drawCalls: unknown[][] = [];
  const encoded: Array<{ type: string | undefined; quality: number | undefined }> = [];
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({ drawImage: (...args: unknown[]) => drawCalls.push(args) }),
    toBlob: (callback: (blob: Blob | null) => void, type?: string, quality?: number) => {
      encoded.push({ type, quality });
      callback(new Blob(["cropped"], { type: "image/webp" }));
    },
  };

  const result = await renderAvatarCropBlob(
    source,
    { width: 1200, height: 800 },
    { zoom: 1, panX: 0, panY: 0 },
    () => canvas,
  );

  assert.equal(canvas.width, 512);
  assert.equal(canvas.height, 512);
  assert.deepEqual(drawCalls, [[source, 200, 0, 800, 800, 0, 0, 512, 512]]);
  assert.deepEqual(encoded, [{ type: "image/webp", quality: 0.9 }]);
  assert.equal(result.type, "image/webp");
});
