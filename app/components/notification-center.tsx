"use client";

import { Bell, Check, X } from "lucide-react";
import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";

import { isIsoTimestamp } from "../../lib/matches/validation";
import type { TeamNotification } from "../../lib/notifications/model";

const MARK_READ_TIMEOUT_MS = 4_000;
const REFRESH_INTERVAL_MS = 20_000;

function date(value: string) { return new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(value)); }

function authoritativeReadAt(value: unknown): string | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).sort().join("\0") !== "ok\0readAt" || record.ok !== true) return null;
  return typeof record.readAt === "string" && isIsoTimestamp(record.readAt) ? record.readAt : null;
}

export function NotificationCenter({ initialNotifications, markReadTimeoutMs = MARK_READ_TIMEOUT_MS, refreshIntervalMs = REFRESH_INTERVAL_MS, requestRefresh = () => {} }: { initialNotifications: readonly TeamNotification[]; markReadTimeoutMs?: number; refreshIntervalMs?: number; requestRefresh?: () => void }) {
  const [open, setOpen] = useState(false);
  const [readOverrides, setReadOverrides] = useState<Readonly<Record<string, string>>>(Object.freeze({}));
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(() => new Set());
  const [message, setMessage] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const readInFlight = useRef(new Map<string, Promise<void>>());
  const refreshRef = useRef(requestRefresh);
  const notifications = initialNotifications.map((notification) => {
    const readAt = notification.readAt ?? readOverrides[notification.id];
    return readAt ? { ...notification, readAt } : notification;
  });
  const unread = notifications.filter(({ readAt }) => readAt === null).length;

  useEffect(() => {
    refreshRef.current = requestRefresh;
  }, [requestRefresh]);

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== "hidden") refreshRef.current();
    };
    const interval = window.setInterval(refresh, Math.max(1, refreshIntervalMs));
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [refreshIntervalMs]);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    function keydown(event: KeyboardEvent) { if (event.key === "Escape") { event.preventDefault(); setOpen(false); triggerRef.current?.focus(); } }
    document.addEventListener("keydown", keydown); return () => document.removeEventListener("keydown", keydown);
  }, [open]);

  async function performMarkRead(notification: TeamNotification): Promise<void> {
    setPendingIds((current) => new Set([...current, notification.id])); setMessage("");
    const controller = new AbortController();
    let timeout: number | undefined;
    const body: unknown = await Promise.race([
      fetch(`/api/notifications/${encodeURIComponent(notification.id)}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: "{}", signal: controller.signal })
        .then(async (response) => response.ok ? response.json().catch(() => null) : null)
        .catch(() => null),
      new Promise<null>((resolvePromise) => {
        timeout = window.setTimeout(() => { controller.abort(); resolvePromise(null); }, Math.max(1, markReadTimeoutMs));
      }),
    ]);
    if (timeout !== undefined) window.clearTimeout(timeout);
    const readAt = authoritativeReadAt(body);
    setPendingIds((current) => { const next = new Set(current); next.delete(notification.id); return next; });
    if (!readAt) { setMessage("Không thể cập nhật trạng thái thông báo."); return; }
    setReadOverrides((current) => Object.freeze({ ...current, [notification.id]: readAt })); setMessage("Đã đánh dấu thông báo là đã đọc.");
  }

  function markRead(notification: TeamNotification): Promise<void> {
    if (notification.readAt) return Promise.resolve();
    const existing = readInFlight.current.get(notification.id);
    if (existing) return existing;
    const request = performMarkRead(notification);
    readInFlight.current.set(notification.id, request);
    void request.finally(() => {
      if (readInFlight.current.get(notification.id) === request) readInFlight.current.delete(notification.id);
    });
    return request;
  }

  async function openNotification(event: ReactMouseEvent<HTMLAnchorElement>, notification: TeamNotification) {
    if (notification.readAt) return;
    event.preventDefault();
    await markRead(notification);
    window.location.assign(notification.targetPath);
  }

  return <div className="notification-center">
    <button ref={triggerRef} className="icon-button notification" type="button" aria-label="Thông báo" aria-expanded={open} onClick={() => { if (!open) refreshRef.current(); setOpen((current) => !current); }}><Bell size={20} />{unread > 0 && <i className="notification-badge">{unread > 9 ? "9+" : unread}</i>}</button>
    {open && <section className="notification-popover" aria-label="Danh sách thông báo">
      <header><div><span>TRUNG TÂM THÔNG BÁO</span><h2>Thông báo</h2></div><button ref={closeRef} type="button" aria-label="Đóng thông báo" onClick={() => { setOpen(false); triggerRef.current?.focus(); }}><X size={18} /></button></header>
      {notifications.length === 0 ? <p className="notification-empty">Bạn chưa có thông báo.</p> : <div className="notification-list">{notifications.map((notification) => <div className={`notification-row ${notification.readAt ? "read" : "unread"}`} key={notification.id}><a href={notification.targetPath} onClick={(event) => void openNotification(event, notification)}><span className="notification-state">{notification.readAt ? <Check size={15} /> : <Bell size={15} />}</span><span><b>{notification.title}</b><small>{notification.body}</small><time>{date(notification.createdAt)}</time></span></a>{!notification.readAt && <button type="button" disabled={pendingIds.has(notification.id)} onClick={() => void markRead(notification)}>{pendingIds.has(notification.id) ? "Đang cập nhật…" : "Đánh dấu đã đọc"}</button>}</div>)}</div>}
      {message && <p className="notification-feedback" role="status">{message}</p>}
    </section>}
  </div>;
}
