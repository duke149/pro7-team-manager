"use client";

import { BellRing, Download, X } from "lucide-react";
import { useEffect, useState } from "react";

const DISMISS_KEY = "pro7-push-permission-dismissed:v1";
const VAPID_PATTERN = /^[A-Za-z0-9_-]{40,200}$/u;

type GateState =
  | "checking"
  | "prompt"
  | "install"
  | "denied"
  | "unsupported-ios"
  | "unsupported"
  | "busy"
  | "error"
  | "hidden";

function iosDevice(): boolean {
  const agent = navigator.userAgent;
  return /iPad|iPhone|iPod/u.test(agent) ||
    (/Macintosh/u.test(agent) && navigator.maxTouchPoints > 1);
}

function standaloneDisplay(): boolean {
  return (navigator as Navigator & { standalone?: boolean }).standalone === true ||
    window.matchMedia?.("(display-mode: standalone)").matches === true;
}

function supported(): boolean {
  return "Notification" in window && "serviceWorker" in navigator && "PushManager" in window;
}

function applicationServerKey(value: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/gu, "+").replace(/_/gu, "/");
  const raw = window.atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
  return bytes;
}

async function persistSubscription(subscription: PushSubscription): Promise<boolean> {
  const value = subscription.toJSON();
  if (!value.endpoint || !value.keys?.p256dh || !value.keys.auth) return false;
  const response = await fetch("/api/push/subscriptions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      endpoint: value.endpoint,
      expirationTime: value.expirationTime ?? null,
      keys: { p256dh: value.keys.p256dh, auth: value.keys.auth },
    }),
  });
  if (!response.ok) return false;
  const body: unknown = await response.json().catch(() => null);
  return typeof body === "object" && body !== null && !Array.isArray(body) &&
    Object.keys(body).sort().join(",") === "ok,subscriptionId" &&
    (body as { ok?: unknown }).ok === true;
}

async function registration(): Promise<ServiceWorkerRegistration> {
  return navigator.serviceWorker.register("/pro7-sw.js", {
    scope: "/",
    updateViaCache: "none",
  });
}

export function PushPermissionGate({ vapidPublicKey }: { vapidPublicKey?: string }) {
  const [state, setState] = useState<GateState>("checking");

  useEffect(() => {
    let active = true;
    async function inspect() {
      if (window.localStorage.getItem(DISMISS_KEY) === "1") {
        if (active) setState("hidden");
        return;
      }
      const ios = iosDevice();
      if (ios && !standaloneDisplay()) {
        if (active) setState("install");
        return;
      }
      if (!vapidPublicKey || !VAPID_PATTERN.test(vapidPublicKey)) {
        if (active) setState("unsupported");
        return;
      }
      if (!supported()) {
        if (active) setState(ios ? "unsupported-ios" : "unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        if (active) setState("denied");
        return;
      }
      if (Notification.permission === "granted") {
        try {
          const existing = await (await registration()).pushManager.getSubscription();
          if (existing && await persistSubscription(existing)) {
            if (active) setState("hidden");
            return;
          }
        } catch {
          if (active) setState("error");
          return;
        }
      }
      if (active) setState("prompt");
    }
    void inspect();
    return () => { active = false; };
  }, [vapidPublicKey]);

  function dismiss() {
    window.localStorage.setItem(DISMISS_KEY, "1");
    setState("hidden");
  }

  async function enable() {
    if (!vapidPublicKey || state === "busy") return;
    setState("busy");
    try {
      const permission = await Notification.requestPermission();
      if (permission === "denied") {
        setState("denied");
        return;
      }
      if (permission !== "granted") {
        setState("prompt");
        return;
      }
      const worker = await registration();
      const existing = await worker.pushManager.getSubscription();
      const subscription = existing ?? await worker.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey(vapidPublicKey),
      });
      setState(await persistSubscription(subscription) ? "hidden" : "error");
    } catch {
      setState("error");
    }
  }

  if (state === "checking" || state === "hidden") return null;
  const install = state === "install";
  const denied = state === "denied";
  const unsupportedIos = state === "unsupported-ios";
  const unsupported = state === "unsupported" || unsupportedIos;
  return (
    <aside className="push-permission-gate" aria-labelledby="push-permission-title">
      <button className="push-permission-close" type="button" aria-label="Để sau" onClick={dismiss}><X size={18} /></button>
      <span className="push-permission-icon" aria-hidden="true">{install ? <Download size={22} /> : <BellRing size={22} />}</span>
      <div>
        <h2 id="push-permission-title">{install ? "Thêm PRO7 vào Màn hình chính" : unsupportedIos ? "Web Push chưa sẵn sàng trên iPhone/iPad" : "Nhận thông báo trận đấu"}</h2>
        <p>
          {install
            ? "Trên iPhone/iPad, hãy chọn Chia sẻ → Thêm vào Màn hình chính, rồi mở PRO7 từ biểu tượng để bật thông báo."
            : denied
              ? "Quyền thông báo đang bị chặn. Hãy mở cài đặt trình duyệt để cho phép PRO7 gửi lời mời và lời nhắc."
              : unsupportedIos
                ? "Web Push cần iOS/iPadOS 16.4 trở lên và PRO7 phải mở ở chế độ ứng dụng. Sau khi cập nhật iOS, hãy xóa biểu tượng PRO7 cũ, thêm lại từ Chia sẻ → Thêm vào Màn hình chính rồi mở từ biểu tượng."
                : unsupported
                ? "Trình duyệt hoặc cấu hình hiện tại chưa hỗ trợ Web Push. Thông báo trong ứng dụng vẫn hoạt động."
                : state === "error"
                  ? "Chưa thể đăng ký thiết bị. Thông báo trong ứng dụng vẫn được giữ; bạn có thể thử lại."
                  : "Nhận lời mời ngay khi Admin tạo trận, lời nhắc người chưa trả lời và nhắc lại trước trận 2 giờ."}
        </p>
      </div>
      {!install && !denied && !unsupported && (
        <button className="primary-button push-permission-enable" type="button" disabled={state === "busy"} onClick={() => void enable()}>
          {state === "busy" ? "Đang bật…" : state === "error" ? "Thử lại" : "Bật thông báo"}
        </button>
      )}
      <button className="soft-button push-permission-later" type="button" onClick={dismiss}>Để sau</button>
    </aside>
  );
}
