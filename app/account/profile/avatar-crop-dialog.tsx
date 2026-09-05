"use client";

import { type PointerEvent, useEffect, useRef, useState } from "react";

import {
  AVATAR_CROP_MAX_ZOOM,
  AVATAR_CROP_MIN_ZOOM,
  avatarCropPreviewStyle,
  clampAvatarCropTransform,
  type AvatarCropTransform,
  type AvatarImageDimensions,
} from "../../../lib/account/avatar-crop";

type DragState = Readonly<{
  pointerId: number;
  clientX: number;
  clientY: number;
  transform: AvatarCropTransform;
}>;

export type AvatarCropDialogProps = Readonly<{
  previewUrl: string;
  fileName: string;
  pending?: boolean;
  error?: string;
  onCancel: () => void;
  onConfirm: (
    image: HTMLImageElement,
    dimensions: AvatarImageDimensions,
    transform: AvatarCropTransform,
  ) => void;
}>;

const INITIAL_TRANSFORM: AvatarCropTransform = { zoom: 1, panX: 0, panY: 0 };

export default function AvatarCropDialog({ previewUrl, fileName, pending = false, error: externalError = "", onCancel, onConfirm }: AvatarCropDialogProps) {
  const [dimensions, setDimensions] = useState<AvatarImageDimensions | null>(null);
  const [transform, setTransform] = useState<AvatarCropTransform>(INITIAL_TRANSFORM);
  const [error, setError] = useState("");
  const [rotatedUrl, setRotatedUrl] = useState<string | null>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const drag = useRef<DragState | null>(null);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onCancel]);

  function setSafeTransform(next: AvatarCropTransform) {
    setTransform(dimensions ? clampAvatarCropTransform(dimensions, next) : next);
  }

  function handleLoad() {
    const image = imageRef.current;
    if (!image || image.naturalWidth <= 0 || image.naturalHeight <= 0) {
      setError("Không thể đọc ảnh này. Hãy chọn một ảnh khác.");
      return;
    }
    const nextDimensions = { width: image.naturalWidth, height: image.naturalHeight };
    setDimensions(nextDimensions);
    setTransform(clampAvatarCropTransform(nextDimensions, INITIAL_TRANSFORM));
    setError("");
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!dimensions || pending) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, transform };
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const active = drag.current;
    const bounds = frameRef.current?.getBoundingClientRect();
    if (!dimensions || !active || active.pointerId !== event.pointerId || !bounds?.width || !bounds.height) return;
    setSafeTransform({
      ...active.transform,
      panX: active.transform.panX + (event.clientX - active.clientX) / bounds.width,
      panY: active.transform.panY + (event.clientY - active.clientY) / bounds.height,
    });
  }

  function finishDrag(event: PointerEvent<HTMLDivElement>) {
    if (drag.current?.pointerId !== event.pointerId) return;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  const previewStyle = dimensions ? avatarCropPreviewStyle(dimensions, transform) : undefined;
  const ready = Boolean(dimensions);
  const errorMessage = error || externalError;
  const panLimits = dimensions ? clampAvatarCropTransform(dimensions, { ...transform, panX: 100, panY: 100 }) : INITIAL_TRANSFORM;

  function rotateImage() {
    const image = imageRef.current;
    if (!image || !dimensions || pending) return;
    try {
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalHeight;
      canvas.height = image.naturalWidth;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas unavailable");
      context.translate(canvas.width, 0);
      context.rotate(Math.PI / 2);
      context.drawImage(image, 0, 0);
      const url = canvas.toDataURL("image/png");
      if (url === "data:,") throw new Error("Canvas too large");
      setDimensions(null);
      setRotatedUrl(url);
    } catch {
      setError("Không thể xoay ảnh này. Hãy chọn ảnh có kích thước nhỏ hơn.");
    }
  }

  return (
    <div className="account-avatar-crop-layer" role="presentation">
      <section className="account-avatar-crop-dialog" role="dialog" aria-modal="true" aria-labelledby="avatar-crop-title" aria-describedby="avatar-crop-help">
        <div className="account-avatar-crop-head">
          <div>
            <span>ẢNH ĐẠI DIỆN</span>
            <h2 id="avatar-crop-title">Căn chỉnh ảnh</h2>
          </div>
          <button className="account-avatar-crop-close" type="button" onClick={onCancel} disabled={pending} aria-label="Đóng căn chỉnh ảnh">×</button>
        </div>
        <p id="avatar-crop-help">Kéo ảnh hoặc dùng thanh căn ngang/dọc. Vòng tròn là vùng avatar hiển thị sau khi lưu. Phóng to để có thêm khoảng kéo ảnh.</p>
        <div
          ref={frameRef}
          className="account-avatar-crop-frame"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finishDrag}
          onPointerCancel={finishDrag}
          onLostPointerCapture={finishDrag}
          aria-label="Khu vực kéo ảnh để căn chỉnh"
        >
          {/* Object URLs are local previews; Next Image cannot optimize or safely retain them. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={imageRef}
            className="account-avatar-crop-image"
            src={rotatedUrl ?? previewUrl}
            alt="Ảnh đang được căn chỉnh"
            draggable={false}
            onLoad={handleLoad}
            onError={() => setError("Không thể đọc ảnh này. Hãy chọn một ảnh khác.")}
            style={previewStyle}
          />
          <span className="account-avatar-crop-mask" aria-hidden="true" />
        </div>
        <label className="account-avatar-crop-zoom">
          <span>Phóng to</span>
          <input
            name="avatarZoom"
            type="range"
            min={AVATAR_CROP_MIN_ZOOM}
            max={AVATAR_CROP_MAX_ZOOM}
            step="0.01"
            value={transform.zoom}
            disabled={!dimensions || pending}
            onChange={(event) => setSafeTransform({ ...transform, zoom: Number(event.target.value) })}
          />
          <output>{Math.round(transform.zoom * 100)}%</output>
        </label>
        {([['panX', 'Căn ngang', 'avatarPanX'], ['panY', 'Căn dọc', 'avatarPanY']] as const).map(([axis, label, name]) => (
          <label className="account-avatar-crop-zoom" key={axis}>
            <span>{label}</span>
            <input name={name} type="range" min={-panLimits[axis]} max={panLimits[axis]} step="0.01" value={transform[axis]} disabled={!dimensions || pending || panLimits[axis] === 0} onChange={event => setSafeTransform({ ...transform, [axis]: Number(event.target.value) })} />
            <output>{Math.round(transform[axis] * 100)}%</output>
          </label>
        ))}
        <button className="soft-button" type="button" onClick={rotateImage} disabled={!ready || pending}>Xoay 90°</button>
        <p className="account-avatar-crop-file">{fileName}</p>
        {errorMessage && <p className="account-avatar-crop-error" role="alert">{errorMessage}</p>}
        <div className="account-avatar-crop-actions">
          <button className="soft-button" type="button" onClick={() => { setSafeTransform(INITIAL_TRANSFORM); if (rotatedUrl) { setDimensions(null); setRotatedUrl(null); } }} disabled={!dimensions || pending}>Đặt lại</button>
          <button className="soft-button" type="button" onClick={onCancel} disabled={pending}>Hủy</button>
          <button
            className="primary-button"
            type="button"
            disabled={!ready || Boolean(errorMessage) || pending}
            onClick={() => {
              const image = imageRef.current;
              if (image && dimensions) onConfirm(image, dimensions, transform);
            }}
          >
            {pending ? "Đang lưu…" : "Lưu ảnh"}
          </button>
        </div>
      </section>
    </div>
  );
}
