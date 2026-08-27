import { requireProductUser } from "../lib/supabase/auth";
import { redirect } from "next/navigation";
import {
  loadUserTeams,
  type TeamListLookup,
  type UserTeamSummary,
} from "../lib/teams/context";
import { resolveTeamLandingPath } from "../lib/teams/navigation";

function compareTeams(left: UserTeamSummary, right: UserTeamSummary): number {
  if (left.name !== right.name) return left.name < right.name ? -1 : 1;
  if (left.slug !== right.slug) return left.slug < right.slug ? -1 : 1;
  if (left.id !== right.id) return left.id < right.id ? -1 : 1;
  return 0;
}

export type RootDestination =
  | { kind: "setup" }
  | { kind: "route"; href: string }
  | { kind: "no-access" };

export function resolveRootDestination(
  teams: UserTeamSummary[],
): RootDestination {
  if (teams.length === 0) return { kind: "setup" };

  for (const team of [...teams].sort(compareTeams)) {
    const href = resolveTeamLandingPath(team.slug, team.permissions);
    if (href) return { kind: "route", href };
  }

  return { kind: "no-access" };
}

function NoAuthorizedTeamRoute() {
  return (
    <main className="team-access-error" aria-labelledby="team-access-error-title">
      <section>
        <p>PRO7 TEAM MANAGER</p>
        <h1 id="team-access-error-title">Chưa có quyền truy cập trang đội</h1>
        <span>
          Tài khoản đang thuộc một đội nhưng chưa được cấp quyền cho bất kỳ trang nào.
          Vui lòng liên hệ quản trị viên đội.
        </span>
      </section>
    </main>
  );
}

export async function redirectFromRoot({
  requireProductUser: requireUser,
  loadUserTeams: loadTeams,
  redirect: redirectTo,
}: {
  requireProductUser: typeof requireProductUser;
  loadUserTeams: (userId: string) => Promise<TeamListLookup>;
  redirect: (url: string) => never;
}): Promise<React.ReactNode> {
  const productUser = await requireUser("/");
  return redirectVerifiedUserFromRoot(productUser, loadTeams, redirectTo);
}

async function redirectVerifiedUserFromRoot(
  productUser: Awaited<ReturnType<typeof requireProductUser>>,
  loadTeams: (userId: string) => Promise<TeamListLookup>,
  redirectTo: (url: string) => never,
): Promise<React.ReactNode> {
  const lookup = await loadTeams(productUser.user.id);
  if (!lookup.ok) throw new Error("Không thể tải danh sách đội.");
  const destination = resolveRootDestination(lookup.teams);
  if (destination.kind === "setup") return redirectTo("/setup/team");
  if (destination.kind === "route") return redirectTo(destination.href);
  return <NoAuthorizedTeamRoute />;
}

export default async function Home() {
  const productUser = await requireProductUser("/");
  return redirectVerifiedUserFromRoot(productUser, () => loadUserTeams(), redirect);
}
