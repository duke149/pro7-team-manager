export const AVATAR_CROP_OUTPUT_SIZE = 512;
export const AVATAR_CROP_MIN_ZOOM = 1;
export const AVATAR_CROP_MAX_ZOOM = 4;

export type AvatarImageDimensions = Readonly<{ width: number; height: number }>;

/**
 * panX/panY are the rendered image centre offsets in units of the crop frame.
 * A positive value moves the image right/down, matching direct pointer dragging.
 */
export type AvatarCropTransform = Readonly<{
  zoom: number;
  panX: number;
  panY: number;
}>;

export type AvatarCropDrawPlan = Readonly<{
  sourceX: number;
  sourceY: number;
  sourceWidth: number;
  sourceHeight: number;
  outputSize: number;
}>;

export type AvatarCropCanvas = {
  width: number;
  height: number;
  getContext: () => { drawImage: (...args: unknown[]) => void } | null;
  toBlob: (callback: (blob: Blob | null) => void, type?: string, quality?: number) => void;
};

function assertDimensions({ width, height }: AvatarImageDimensions) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error("Invalid avatar image dimensions.");
  }
}

function clamp(value: number, lower: number, upper: number): number {
  return Math.min(upper, Math.max(lower, value));
}

export function clampAvatarCropTransform(
  dimensions: AvatarImageDimensions,
  transform: AvatarCropTransform,
): AvatarCropTransform {
  assertDimensions(dimensions);
  const zoom = clamp(
    Number.isFinite(transform.zoom) ? transform.zoom : AVATAR_CROP_MIN_ZOOM,
    AVATAR_CROP_MIN_ZOOM,
    AVATAR_CROP_MAX_ZOOM,
  );
  const baseScale = Math.max(1 / dimensions.width, 1 / dimensions.height);
  const renderedWidth = dimensions.width * baseScale * zoom;
  const renderedHeight = dimensions.height * baseScale * zoom;
  const maxPanX = Math.max(0, (renderedWidth - 1) / 2);
  const maxPanY = Math.max(0, (renderedHeight - 1) / 2);
  return {
    zoom,
    panX: clamp(Number.isFinite(transform.panX) ? transform.panX : 0, -maxPanX, maxPanX),
    panY: clamp(Number.isFinite(transform.panY) ? transform.panY : 0, -maxPanY, maxPanY),
  };
}

export function createAvatarCropDrawPlan(
  dimensions: AvatarImageDimensions,
  transform: AvatarCropTransform,
  outputSize = AVATAR_CROP_OUTPUT_SIZE,
): AvatarCropDrawPlan {
  assertDimensions(dimensions);
  if (!Number.isInteger(outputSize) || outputSize <= 0) throw new Error("Invalid avatar crop output size.");

  const safe = clampAvatarCropTransform(dimensions, transform);
  const scale = Math.max(1 / dimensions.width, 1 / dimensions.height) * safe.zoom;
  const sourceWidth = 1 / scale;
  const sourceHeight = 1 / scale;
  const unclampedX = dimensions.width / 2 - (0.5 + safe.panX) / scale;
  const unclampedY = dimensions.height / 2 - (0.5 + safe.panY) / scale;
  return {
    sourceX: clamp(unclampedX, 0, dimensions.width - sourceWidth),
    sourceY: clamp(unclampedY, 0, dimensions.height - sourceHeight),
    sourceWidth,
    sourceHeight,
    outputSize,
  };
}

export function avatarCropPreviewStyle(
  dimensions: AvatarImageDimensions,
  transform: AvatarCropTransform,
): Readonly<{ width: string; height: string; left: string; top: string }> {
  assertDimensions(dimensions);
  const safe = clampAvatarCropTransform(dimensions, transform);
  const baseScale = Math.max(1 / dimensions.width, 1 / dimensions.height);
  return {
    width: `${dimensions.width * baseScale * safe.zoom * 100}%`,
    height: `${dimensions.height * baseScale * safe.zoom * 100}%`,
    left: `${50 + safe.panX * 100}%`,
    top: `${50 + safe.panY * 100}%`,
  };
}

function createBrowserCanvas(): AvatarCropCanvas {
  return document.createElement("canvas") as unknown as AvatarCropCanvas;
}

/** Render only the square crop. The caller keeps responsibility for Storage upload and auth. */
export async function renderAvatarCropBlob(
  source: CanvasImageSource,
  dimensions: AvatarImageDimensions,
  transform: AvatarCropTransform,
  createCanvas: () => AvatarCropCanvas = createBrowserCanvas,
): Promise<Blob> {
  const plan = createAvatarCropDrawPlan(dimensions, transform);
  const canvas = createCanvas();
  canvas.width = plan.outputSize;
  canvas.height = plan.outputSize;
  const context = canvas.getContext();
  if (!context) throw new Error("Không thể xử lý ảnh trên thiết bị này.");
  context.drawImage(
    source,
    plan.sourceX,
    plan.sourceY,
    plan.sourceWidth,
    plan.sourceHeight,
    0,
    0,
    plan.outputSize,
    plan.outputSize,
  );
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Không thể tạo ảnh đã căn chỉnh."));
    }, "image/webp", 0.9);
  });
}
