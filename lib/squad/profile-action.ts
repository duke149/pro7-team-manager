import { updateOwnProfile, type ProfileActionDependencies } from '../account/profile';
import { isUuid } from './model';

type Target = { slug: string; userId: string };
type Dependencies = { authorize: (target: Target) => Promise<ProfileActionDependencies | null> };

async function defaults(): Promise<Dependencies> {
  const { requireTeamPermission } = await import('../teams/context');
  const { createServerSupabaseClient } = await import('../supabase/server');
  return { async authorize(target) {
    const [players, members] = await Promise.all([
      requireTeamPermission(target.slug, 'players.manage'),
      requireTeamPermission(target.slug, 'members.manage'),
    ]);
    if (!players || !members || players.userId !== members.userId || players.team.id !== members.team.id) return null;
    const client = await createServerSupabaseClient();
    const membership = await client.from('memberships').select('user_id').eq('team_id', players.team.id).eq('user_id', target.userId).eq('status', 'active').maybeSingle();
    if (membership.error || !membership.data) return null;
    return {
      // Target resolved only after authenticated team permission and membership checks.
      getCurrentUser: async () => ({ id: target.userId }),
      async updateProfile(id, patch) {
        const result = await client.from('profiles').update(patch).eq('id', id).select('id').maybeSingle();
        return result.error || !result.data ? { ok: false } : { ok: true };
      },
    };
  } };
}

export async function updateManagedProfile(request: Request, target: Target, supplied?: Dependencies) {
  if (!isUuid(target.userId)) return Response.json({ ok: false }, { status: 404 });
  const origin = request.headers.get('origin');
  if (origin ? origin !== new URL(request.url).origin : request.headers.get('sec-fetch-site') !== 'same-origin') return Response.json({ ok: false }, { status: 403 });
  try {
    const authorized = await (supplied ?? await defaults()).authorize(target);
    if (!authorized) return Response.json({ ok: false, message: 'Bạn không có quyền sửa hồ sơ cầu thủ này.' }, { status: 403 });
    return updateOwnProfile(request, authorized);
  } catch {
    return Response.json({ ok: false, message: 'Không thể cập nhật hồ sơ.' }, { status: 500 });
  }
}
