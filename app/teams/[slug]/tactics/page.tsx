import { notFound } from "next/navigation";

import { requireTeamPermission } from "../../../../lib/teams/context";
import type { PermissionCode } from "../../../../lib/teams/permissions";
import type { ReactNode } from "react";

type TacticsRouteArguments = {
  params: Promise<{ slug: string }>;
  requireTeamPermission: (
    slug: string,
    permission: PermissionCode,
  ) => Promise<Awaited<ReturnType<typeof requireTeamPermission>>>;
  denied: () => ReactNode;
};

export async function renderTacticsPage(
  arguments_: TacticsRouteArguments = {
    params: Promise.resolve({ slug: "" }),
    requireTeamPermission,
    denied: notFound,
  },
) {
  const { slug } = await arguments_.params;
  const context = await arguments_.requireTeamPermission(slug, "tactics.read");
  if (!context) return arguments_.denied();

  return (
    <div className="view-stack">
      <section className="card squad-empty-state" aria-labelledby="tactics-empty-title">
        <div>
          <span className="page-heading">CHIẾN THUẬT</span>
          <h2 id="tactics-empty-title">Chưa có trận đấu để lập chiến thuật</h2>
          <p>Đội hình sẽ được chuẩn bị từ trang trận đấu sau khi một trận được tạo.</p>
        </div>
      </section>
    </div>
  );
}

export default async function TacticsPage({ params }: { params: Promise<{ slug: string }> }) {
  return renderTacticsPage({ params, requireTeamPermission, denied: notFound });
}
