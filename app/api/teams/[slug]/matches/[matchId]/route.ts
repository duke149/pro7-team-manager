import { mutateMatch } from "../../../../../../lib/matches/actions";

type Target = { slug: string; matchId: string };
export async function mutateMatchRoute(request: Request, params: Promise<Target>, handler: (request: Request, target: Target) => Promise<Response>) {
  return handler(request, await params);
}
export async function PATCH(request: Request, context: { params: Promise<Target> }) {
  return mutateMatchRoute(request, context.params, mutateMatch);
}
