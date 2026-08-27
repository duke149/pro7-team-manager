import type { NextRequest } from "next/server";

import { mutateAdminSettings } from "../../../../../lib/settings/actions";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) { return mutateAdminSettings(request, (await params).slug); }
