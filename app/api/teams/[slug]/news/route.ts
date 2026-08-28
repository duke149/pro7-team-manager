import { mutateTeamNews } from "../../../../../lib/news/actions";

type Context = { params: Promise<{ slug: string }> };

async function handle(request: Request, context: Context) {
  const { slug } = await context.params;
  return mutateTeamNews(request, slug);
}

export async function POST(request: Request, context: Context) { return handle(request, context); }
export async function PATCH(request: Request, context: Context) { return handle(request, context); }
