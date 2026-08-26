import { mutateTactics } from "../../../../../../lib/tactics/actions";

type Target = { slug: string; matchId: string };
export async function mutateTacticsRoute(request: Request, params: Promise<Target>, handler: (request: Request, target: Target) => Promise<Response>) { return handler(request, await params); }
export async function POST(request: Request, context: { params: Promise<Target> }) { return mutateTacticsRoute(request, context.params, mutateTactics); }
