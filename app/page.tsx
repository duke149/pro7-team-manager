import { requireProductUser } from "../lib/supabase/auth";
import { redirect } from "next/navigation";
import { loadUserTeams, type TeamListLookup } from "../lib/teams/context";

type TeamSummary = { id: string; name: string; slug: string };

function compareTeams(left: TeamSummary, right: TeamSummary): number {
  if (left.name !== right.name) return left.name < right.name ? -1 : 1;
  if (left.slug !== right.slug) return left.slug < right.slug ? -1 : 1;
  if (left.id !== right.id) return left.id < right.id ? -1 : 1;
  return 0;
}

export async function redirectFromRoot({
  requireProductUser: requireUser,
  loadUserTeams: loadTeams,
  redirect: redirectTo,
}: {
  requireProductUser: typeof requireProductUser;
  loadUserTeams: (userId: string) => Promise<TeamListLookup>;
  redirect: (url: string) => never;
}): Promise<never> {
  const productUser = await requireUser("/");
  return redirectVerifiedUserFromRoot(productUser, loadTeams, redirectTo);
}

async function redirectVerifiedUserFromRoot(
  productUser: Awaited<ReturnType<typeof requireProductUser>>,
  loadTeams: (userId: string) => Promise<TeamListLookup>,
  redirectTo: (url: string) => never,
): Promise<never> {
  const lookup = await loadTeams(productUser.user.id);
  if (!lookup.ok) throw new Error("Không thể tải danh sách đội.");
  const firstTeam = [...lookup.teams].sort(compareTeams)[0];
  return redirectTo(
    firstTeam
      ? `/teams/${encodeURIComponent(firstTeam.slug)}/overview`
      : "/setup/team",
  );
}

export default async function Home() {
  const productUser = await requireProductUser("/");
  return redirectVerifiedUserFromRoot(productUser, () => loadUserTeams(), redirect);
}
