import { notFound } from "next/navigation";

import { loadAdminSettings } from "../../../../../lib/settings/queries";
import type { AdminSettingsResult } from "../../../../../lib/settings/model";
import { requireTeamPermission, type TeamAccessContext } from "../../../../../lib/teams/context";
import type { PermissionCode } from "../../../../../lib/teams/permissions";
import { SettingsView } from "./settings-view";

export async function renderSettingsPage(arguments_: {
  params: Promise<{ slug: string }>;
  requireTeamPermission: (slug: string, permission: PermissionCode) => Promise<TeamAccessContext | null>;
  loadAdminSettings?: (teamId: string) => Promise<AdminSettingsResult>;
  denied: () => unknown;
}) {
  const { slug } = await arguments_.params;
  const context = await arguments_.requireTeamPermission(slug, "settings.read");
  if (!context) return arguments_.denied();
  const result = arguments_.loadAdminSettings
    ? await arguments_.loadAdminSettings(context.team.id)
    : { ok: true as const, data: null };
  return <SettingsView team={context.team} permissions={context.permissions} data={result.ok ? result.data : null} />;
}

export default async function SettingsPage({ params }: { params: Promise<{ slug: string }> }) {
  return renderSettingsPage({ params, requireTeamPermission, loadAdminSettings, denied: notFound });
}
