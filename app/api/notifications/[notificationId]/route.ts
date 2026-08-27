import { type NextRequest } from "next/server";

import { markNotificationRead } from "../../../../lib/notifications/actions";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ notificationId: string }> }) {
  return markNotificationRead(request, (await params).notificationId);
}
