import { provisionTeamMember } from "../../../../../lib/squad/provisioning-action";

export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  return provisionTeamMember(request, await context.params);
}
