import { requireProductUser } from "../lib/supabase/auth";
import { redirect } from "next/navigation";
import { listUserTeams } from "../lib/teams/context";

type TeamSummary = { id: string; name: string; slug: string };

function compareTeams(left: TeamSummary, right: TeamSummary): number {
  if (left.name !== right.name) return left.name < right.name ? -1 : 1;
  if (left.slug !== right.slug) return left.slug < right.slug ? -1 : 1;
  if (left.id !== right.id) return left.id < right.id ? -1 : 1;
  return 0;
}

export async function redirectFromRoot({
  requireProductUser: requireUser,
  listUserTeams: listTeams,
  redirect: redirectTo,
}: {
  requireProductUser: typeof requireProductUser;
  listUserTeams: (userId: string) => Promise<TeamSummary[]>;
  redirect: (url: string) => never;
}): Promise<never> {
  const productUser = await requireUser("/");
  return redirectVerifiedUserFromRoot(productUser, listTeams, redirectTo);
}

async function redirectVerifiedUserFromRoot(
  productUser: Awaited<ReturnType<typeof requireProductUser>>,
  listTeams: (userId: string) => Promise<TeamSummary[]>,
  redirectTo: (url: string) => never,
): Promise<never> {
  const teams = await listTeams(productUser.user.id);
  const firstTeam = [...teams].sort(compareTeams)[0];
  return redirectTo(
    firstTeam
      ? `/teams/${encodeURIComponent(firstTeam.slug)}/overview`
      : "/setup/team",
  );
}

export default async function Home() {
  const productUser = await requireProductUser("/");
  return redirectVerifiedUserFromRoot(productUser, () => listUserTeams(), redirect);
}
