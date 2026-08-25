import { requireProductUser } from "../../../lib/supabase/auth";

export default async function TeamLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  await requireProductUser(`/teams/${encodeURIComponent(slug)}/overview`);
  return children;
}
