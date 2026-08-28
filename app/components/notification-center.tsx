"use client";

import { Bell, Check, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { isIsoTimestamp } from "../../lib/matches/validation";
import type { TeamNotification } from "../../lib/notifications/model";

function date(value: string) { return new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(value)); }

export function NotificationCenter({ initialNotifications }: { initialNotifications: readonly TeamNotification[] }) {
  const [open, setOpen] = useState(false);
  const [readOverrides, setReadOverrides] = useState<Readonly<Record<string, string>>>(Object.freeze({}));
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const notifications = initialNotifications.map((notification) => {
    const readAt = notification.readAt ?? readOverrides[notification.id];
    return readAt ? { ...notification, readAt } : notification;
  });
  const unread = notifications.filter(({ readAt }) => readAt === null).length;

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    function keydown(event: KeyboardEvent) { if (event.key === "Escape") { event.preventDefault(); setOpen(false); triggerRef.current?.focus(); } }
    document.addEventListener("keydown", keydown); return () => document.removeEventListener("keydown", keydown);
  }, [open]);

  async function markRead(notification: TeamNotification) {
    if (notification.readAt || pendingId) return;
    setPendingId(notification.id); setMessage("");
    const response = await fetch(`/api/notifications/${encodeURIComponent(notification.id)}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: "{}" }).catch(() => null);
    const body: unknown = response?.ok ? await response.json().catch(() => null) : null;
    const readAt = typeof body === "object" && body !== null && "readAt" in body && typeof body.readAt === "string" && isIsoTimestamp(body.readAt) ? body.readAt : null;
    if (!readAt) { setPendingId(null); setMessage("Không thể cập nhật trạng thái thông báo."); return; }
    setReadOverrides((current) => Object.freeze({ ...current, [notification.id]: readAt })); setPendingId(null); setMessage("Đã đánh dấu thông báo là đã đọc.");
  }

  return <div className="notification-center">
    <button ref={triggerRef} className="icon-button notification" type="button" aria-label="Thông báo" aria-expanded={open} onClick={() => setOpen((current) => !current)}><Bell size={20} />{unread > 0 && <i className="notification-badge">{unread > 9 ? "9+" : unread}</i>}</button>
    {open && <section className="notification-popover" aria-label="Danh sách thông báo">
      <header><div><span>TRUNG TÂM THÔNG BÁO</span><h2>Thông báo</h2></div><button ref={closeRef} type="button" aria-label="Đóng thông báo" onClick={() => { setOpen(false); triggerRef.current?.focus(); }}><X size={18} /></button></header>
      {notifications.length === 0 ? <p className="notification-empty">Bạn chưa có thông báo.</p> : <div className="notification-list">{notifications.map((notification) => <div className={`notification-row ${notification.readAt ? "read" : "unread"}`} key={notification.id}><a href={notification.targetPath}><span className="notification-state">{notification.readAt ? <Check size={15} /> : <Bell size={15} />}</span><span><b>{notification.title}</b><small>{notification.body}</small><time>{date(notification.createdAt)}</time></span></a>{!notification.readAt && <button type="button" disabled={pendingId !== null} onClick={() => void markRead(notification)}>{pendingId === notification.id ? "Đang cập nhật…" : "Đánh dấu đã đọc"}</button>}</div>)}</div>}
      {message && <p className="notification-feedback" role="status">{message}</p>}
    </section>}
  </div>;
}
