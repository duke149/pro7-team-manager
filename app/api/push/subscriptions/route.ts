import type { NextRequest } from "next/server";

import { mutatePushSubscription } from "../../../../lib/push/actions";

export async function POST(request: NextRequest) {
  return mutatePushSubscription(request);
}

export async function DELETE(request: NextRequest) {
  return mutatePushSubscription(request);
}
