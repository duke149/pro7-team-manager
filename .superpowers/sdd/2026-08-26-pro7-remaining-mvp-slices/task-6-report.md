# Task 6 local artifact report

## Status

Complete for the assigned local artifact phase. No remote database, connected account, browser session, or `auth.users` row was read or mutated by the seed/cleanup artifacts. Remote schema apply, remote import, advisor review, and browser QA remain controller-owned.

Commit subject: `test: add removable PRO7 demo fixtures`.

## Delivered artifacts

- `supabase/demo/pro7-demo-seed.sql`
  - Resolves exactly one `public.teams.slug = 'pro7-fc'` row and rejects missing/ambiguous targets.
  - Requires one active membership and deterministically selects at most seven active memberships by UUID.
  - Emits `{"marker":"PRO7-DEMO","player_count":N,"injured_player_count":I,"injured_coverage":"available|deferred"}` so sparse and injury coverage are truthful without mutating real player profiles.
  - Uses fixed domain UUIDs and bounded `PRO7-DEMO` marker fields/marked parents.
  - Covers scheduled/completed/cancelled matches, pending/available/unavailable RSVP rows, match events, player/team statistics, published/draft news, parser-valid tactics with starter and bench slots, income/expense/void finance rows, paid/pending/waived dues, and invitation/reminder notifications.
  - Marks the balanced tactic applied only when seven deterministic players exist; with fewer than seven it remains a valid draft, so production's seven-starter/one-GK applied contract is never weakened.
  - Never inserts, updates, or deletes Auth identities and contains no secrets.
- `supabase/demo/pro7-demo-cleanup.sql`
  - Deletes only deterministic rows whose own bounded field, deterministic parent, or exact private due-row snapshot still carries `PRO7-DEMO` lineage.
  - Preserves a deterministic-ID due that was replaced or changed after seeding, and removes stale demo snapshot markers without deleting that unmarked row.
  - Uses FK-safe order and leaves memberships, profiles, team-player profiles, and Auth identities intact.
- `tests/pro7-demo-seed.test.mjs`
  - Creates a disposable PostgreSQL 17 cluster, installs the minimal Supabase platform surface, applies all six repository migrations, and provisions credential-free test identities/memberships.
  - Executes seed twice and cleanup twice; verifies identical demo counts, marker lineage, zero demo rows, exact baseline restoration, no unmarked changes, deterministic-ID collision refusal, exact-slug refusal, a seven-player cap, and a one-membership fallback.
  - Feeds rows read from the disposable database through the real `getTacticsDetail` parser for both manager and member routes, including the sparse all-draft state.
  - Replaces one seeded deterministic due with an unmarked row and proves reseeding refuses it while cleanup twice preserves it byte-for-byte.
- `tests/full-mvp-route-matrix.test.ts`
  - Loads the real route pages through the repository's Vite navigation alias.
  - Verifies Owner/Admin/Member read access for Overview, Squad, Matches, Tactics, Funds, and Settings plus mutation access for Squad, Matches, RSVP, Tactics, Funds, and Settings.

## TDD evidence

- RED: `node --test tests/pro7-demo-seed.test.mjs` failed 3/3 because both SQL artifacts were absent after the disposable PG17 cluster successfully applied every migration.
- Review RED: `node --import tsx --test tests/pro7-demo-seed.test.mjs` failed on missing truthful injury metadata and deletion of a replaced deterministic due; the route-parser assertions then exposed the sparse applied invariant addressed by the same round.
- Review GREEN: `node --import tsx --test tests/pro7-demo-seed.test.mjs` passed 6/6 on PostgreSQL 17.
- Route matrix: `node --import tsx --test tests/full-mvp-route-matrix.test.ts` passed 3/3.

## Fresh local verification

- Focused PG17 plus route-parser/matrix run: 9 tests passed, 0 failed.
- `npm run test:unit`: 411 tests, 406 passed, 5 environment-gated skips, 0 failed.
- `npx eslint tests/pro7-demo-seed.test.mjs tests/full-mvp-route-matrix.test.ts`: clean.
- `git diff --check`: clean.
- `npx tsc --noEmit`: repository baseline remains non-zero on existing app/test/Cloudflare diagnostics; no diagnostic referenced either new test file.

## Concerns and controller handoff

- The current remote has one active membership. The seed therefore creates one starter slot in the balanced draft and one bench slot in the attacking draft, reports `player_count: 1`, and exposes no invalid applied tactic to members. Once seven active memberships exist, rerunning fills seven players deterministically and marks only the valid seven-starter/one-GK tactic applied.
- The seed does not manufacture injured/available player profiles because doing so would mutate pre-existing membership-domain rows and break exact cleanup restoration. It reports `injured_coverage: "deferred"` when no existing active membership is injured and `"available"` otherwise.
- Remote execution and browser CRUD/role QA were not attempted. The controller should review the SQL, run the seed once remotely, capture only aggregate coverage plus the emitted player count, and preserve `pro7-demo-cleanup.sql` for teardown.
