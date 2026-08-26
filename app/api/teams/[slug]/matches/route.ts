import { createMatch } from "../../../../../lib/matches/actions";

export async function mutateMatchesRoute(
  request: Request,
  params: Promise<{ slug: string }>,
  handler: (request: Request, target: { slug: string }) => Promise<Response>,
) {
  return handler(request, await params);
}

export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  return mutateMatchesRoute(request, context.params, createMatch);
}
