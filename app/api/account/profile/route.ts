import { updateOwnProfile } from "../../../../lib/account/profile";

export async function PATCH(request: Request): Promise<Response> {
  return updateOwnProfile(request);
}
