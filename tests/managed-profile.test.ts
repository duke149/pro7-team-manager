import assert from 'node:assert/strict';
import test from 'node:test';
import { updateManagedProfile } from '../lib/squad/profile-action';

const id = '92000000-0000-4000-8000-000000000002';
const target = { slug: 'qa-team', userId: id };
const request = (body: object, origin = 'https://pro7.example') => new Request('https://pro7.example/api/teams/qa-team/players/'+id+'/profile', { method: 'PATCH', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(body) });
test('manager endpoint fails closed before writes and rejects identity injection', async () => {
  let writes = 0;
  const dependencies = { authorize: async () => ({ getCurrentUser: async () => ({ id }), updateProfile: async () => { writes++; return { ok: true as const }; } }) };
  assert.equal((await updateManagedProfile(request({ displayName:'QA' }, 'https://evil.example'), target, dependencies)).status, 403);
  assert.equal((await updateManagedProfile(request({ displayName:'QA' }), target, { authorize: async () => null })).status, 403);
  assert.equal((await updateManagedProfile(request({ userId:id, displayName:'QA' }), target, dependencies)).status, 400);
  assert.equal(writes, 0);
});
test('manager endpoint persists validated personal fields to the authorized target', async () => {
  let saved: unknown;
  const response = await updateManagedProfile(request({ displayName:' QA player ', heightCm:178 }), target, { authorize: async () => ({ getCurrentUser: async () => ({ id }), updateProfile: async (userId, patch) => { saved = { userId, patch }; return { ok: true }; } }) });
  assert.equal(response.status, 200);
  assert.deepEqual(saved, { userId:id, patch:{ display_name:'QA player', height_cm:178 } });
});
