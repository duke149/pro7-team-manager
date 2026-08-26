import type { PermissionCode } from "../teams/permissions";

export type TeamNotificationSettings = Readonly<{ matchInvitations: boolean; matchReminders: boolean; reminderHoursBefore: number }>;
export type SettingsRole = Readonly<{ id: string; name: string; slug: string; isSystem: boolean; permissions: readonly PermissionCode[] }>;
export type AuditEvent = Readonly<{ id: number; occurredAt: string; actorUserId: string | null; actorDisplayName: string | null; tableName: string; action: "INSERT" | "UPDATE" | "DELETE"; rowKey: Readonly<Record<string, unknown>> }>;
export type AdminSettingsData = Readonly<{ notificationSettings: TeamNotificationSettings; activeMembers: number; inactiveMembers: number; roles: readonly SettingsRole[]; auditEvents: readonly AuditEvent[] }>;
export type AdminSettingsResult = { ok: true; data: AdminSettingsData } | { ok: false; error: "server" };
