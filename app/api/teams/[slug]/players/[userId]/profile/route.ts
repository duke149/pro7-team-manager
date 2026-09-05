import { updateManagedProfile } from '../../../../../../../lib/squad/profile-action';

export async function PATCH(request: Request, { params }: { params: Promise<{ slug: string; userId: string }> }) {
  return updateManagedProfile(request, await params);
}
