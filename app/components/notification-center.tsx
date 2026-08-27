"use client";

import { Bell, Check, X } from "lucide-react";
import { useState } from "react";

import type { TeamNotification } from "../../lib/notifications/model";

function date(value: string) { return new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(value)); }

export function NotificationCenter({ initialNotifications }: { initialNotifications: readonly TeamNotification[] }) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState(initialNotifications);
  const unread = notifications.filter(({ readAt }) => readAt === null).length;

  async function markRead(notification: TeamNotification) {
    if (notification.readAt) return;
    const response = await fetch(`/api/notifications/${encodeURIComponent(notification.id)}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: "{}" }).catch(() => null);
    if (!response?.ok) return;
    const body: unknown = await response.json().catch(() => null);
    const readAt = typeof body === "object" && body !== null && "readAt" in body && typeof body.readAt === "string" ? body.readAt : new Date().toISOString();
    setNotifications((current) => current.map((item) => item.id === notification.id ? { ...item, readAt } : item));
  }

  return <div className="notification-center">
    <button className="icon-button notification" type="button" aria-label="Thông báo" aria-expanded={open} onClick={() => setOpen((current) => !current)}><Bell size={20} />{unread > 0 && <i className="notification-badge">{unread > 9 ? "9+" : unread}</i>}</button>
    {open && <section className="notification-popover" aria-label="Danh sách thông báo">
      <header><div><span>TRUNG TÂM THÔNG BÁO</span><h2>Thông báo</h2></div><button type="button" aria-label="Đóng thông báo" onClick={() => setOpen(false)}><X size={18} /></button></header>
      {notifications.length === 0 ? <p className="notification-empty">Bạn chưa có thông báo.</p> : <div className="notification-list">{notifications.map((notification) => <a key={notification.id} className={notification.readAt ? "read" : "unread"} href={notification.targetPath} onClick={() => void markRead(notification)}><span className="notification-state">{notification.readAt ? <Check size={15} /> : <Bell size={15} />}</span><span><b>{notification.title}</b><small>{notification.body}</small><time>{date(notification.createdAt)}</time></span></a>)}</div>}
    </section>}
  </div>;
}
