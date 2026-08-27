export type TeamNotification = Readonly<{
  id: string;
  type: "match_invitation" | "match_reminder";
  sourceId: string;
  title: string;
  body: string;
  targetPath: string;
  readAt: string | null;
  createdAt: string;
}>;

export type NotificationListResult =
  | { ok: true; notifications: readonly TeamNotification[]; unreadCount: number }
  | { ok: false; error: "server" };
