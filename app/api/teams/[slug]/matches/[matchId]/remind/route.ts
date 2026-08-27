import { remindPendingAttendance } from "../../../../../../../lib/overview/actions";

type Target = { slug: string; matchId: string };

export async function mutateOverviewReminderRoute(
  request: Request,
  params: Promise<Target>,
  handler: (request: Request, target: Target) => Promise<Response>,
) {
  return handler(request, await params);
}

export async function POST(request: Request, context: { params: Promise<Target> }) {
  return mutateOverviewReminderRoute(request, context.params, remindPendingAttendance);
}
