import { requireProductUser } from "../../../lib/supabase/auth";

export async function renderTeamLayout({
  children,
  params,
  requireProductUser: requireUser,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
  requireProductUser: typeof requireProductUser;
}) {
  const { slug } = await params;
  await requireUser(`/teams/${encodeURIComponent(slug)}/overview`);
  return children;
}

export default async function TeamLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  return renderTeamLayout({ children, params, requireProductUser });
}
