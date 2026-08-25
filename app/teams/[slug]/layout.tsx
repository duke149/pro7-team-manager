import { requireProductUser } from "../../../lib/supabase/auth";
import { loadTeamAccessContext } from "../../../lib/teams/context";
import { ProductShell } from "../../components/product-shell";
import { notFound } from "next/navigation";

export async function renderTeamLayout({
  children,
  params,
  requireProductUser: requireUser,
  loadTeamAccessContext: loadContext,
  denied = notFound,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
  requireProductUser: typeof requireProductUser;
  loadTeamAccessContext?: (slug: string) => ReturnType<typeof loadTeamAccessContext>;
  denied?: () => React.ReactNode;
}) {
  const { slug } = await params;
  const productUser = await requireUser(`/teams/${encodeURIComponent(slug)}/overview`);

  if (!loadContext) return children;

  const context = await loadContext(slug);
  if (!context) return denied();

  return (
    <ProductShell
      team={context.team}
      roleName={context.membership.roleName}
      permissions={context.permissions}
      email={productUser.user.email}
    >
      {children}
    </ProductShell>
  );
}

export default async function TeamLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  return renderTeamLayout({
    children,
    params,
    requireProductUser,
    loadTeamAccessContext,
  });
}
