import { saveMatchAnalysis } from "../../../../../../../lib/matches/analysis-actions";

type Target = { slug: string; matchId: string };

export async function mutateMatchRoute(
  request: Request,
  params: Promise<Target>,
  handler: (request: Request, target: Target) => Promise<Response>,
) {
  return handler(request, await params);
}

export async function PUT(request: Request, context: { params: Promise<Target> }) {
  return mutateMatchRoute(request, context.params, saveMatchAnalysis);
}
