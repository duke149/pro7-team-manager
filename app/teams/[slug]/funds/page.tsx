import { notFound } from "next/navigation";

import { getFunds } from "../../../../lib/funds/queries";
import type { FundsResult } from "../../../../lib/funds/model";
import { requireTeamPermission } from "../../../../lib/teams/context";
import type { TeamAccessContext } from "../../../../lib/teams/context";
import type { PermissionCode } from "../../../../lib/teams/permissions";
import { FundsView } from "./funds-view";

function currentPeriod() {
  const parts = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", timeZone: "Asia/Ho_Chi_Minh" }).formatToParts(new Date());
  const year = parts.find(({ type }) => type === "year")?.value;
  const month = parts.find(({ type }) => type === "month")?.value;
  return `${year}-${month}-01`;
}

export async function renderFundsPage(
  arguments_: {
    params: Promise<{ slug: string }>;
    requireTeamPermission: (slug: string, permission: PermissionCode) => Promise<TeamAccessContext | null>;
    getFunds?: (teamId: string, periodStart: string) => Promise<FundsResult>;
    denied: () => unknown;
    periodStart?: string;
  } = {
    params: Promise.resolve({ slug: "" }),
    requireTeamPermission,
    denied: notFound,
  },
) {
  const { slug } = await arguments_.params;
  const context = await arguments_.requireTeamPermission(slug, "finance.read");
  if (!context) return arguments_.denied();
  const periodStart = arguments_.periodStart ?? currentPeriod();
  const result = arguments_.getFunds ? await arguments_.getFunds(context.team.id, periodStart) : { ok: true as const, data: { periodStart, balanceVnd: 0, monthIncomeVnd: 0, monthIncomeCount: 0, monthExpenseVnd: 0, monthExpenseCount: 0, pendingDuesVnd: 0, pendingDuesCount: 0, paidDuesCount: 0, totalDuesCount: 0, dues: [], recentEntries: [] } };
  return <FundsView team={context.team} permissions={context.permissions} result={result} />;
}

export default async function FundsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  return renderFundsPage({ params, requireTeamPermission, getFunds, denied: notFound });
}
