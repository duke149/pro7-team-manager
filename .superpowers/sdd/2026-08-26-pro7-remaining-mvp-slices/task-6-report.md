# Task 6 local artifact report

## Status

Complete for the assigned local artifact phase. No remote database, connected account, browser session, or `auth.users` row was read or mutated by the seed/cleanup artifacts. Remote schema apply, remote import, advisor review, and browser QA remain controller-owned.

Commit subject: `test: add removable PRO7 demo fixtures`.

## Delivered artifacts

- `supabase/demo/pro7-demo-seed.sql`
  - Resolves exactly one `public.teams.slug = 'pro7-fc'` row and rejects missing/ambiguous targets.
  - Requires one active membership and deterministically selects at most eight active memberships by UUID: up to seven starters plus an optional eighth bench player.
  - Emits explicit `player_count`, `starter_count`, `bench_count`, `bench_coverage`, `injured_player_count`, and `injured_coverage` fields so sparse, bench, and injury coverage are truthful without mutating real player profiles.
  - Uses fixed domain UUIDs and bounded `PRO7-DEMO` marker fields/marked parents.
  - Covers scheduled/completed/cancelled matches, pending/available/unavailable RSVP rows, match events, player/team statistics, published/draft news, parser-valid tactics with starter and bench slots, income/expense/void finance rows, paid/pending/waived dues, and invitation/reminder notifications.
  - Gives both tactics the first seven selected players as starters and only the eighth as bench. The balanced tactic is applied only with at least seven deterministic players; with fewer than seven both remain valid incomplete drafts, so production's seven-starter/one-GK applied contract is never weakened.
  - Never inserts, updates, or deletes Auth identities and contains no secrets.
- `supabase/demo/pro7-demo-cleanup.sql`
  - Deletes only deterministic rows whose own bounded field, deterministic parent, or exact private due-row snapshot still carries `PRO7-DEMO` lineage.
  - Preserves a deterministic-ID due that was replaced or changed after seeding, and removes stale demo snapshot markers without deleting that unmarked row.
  - Uses FK-safe order and leaves memberships, profiles, team-player profiles, and Auth identities intact.
- `tests/pro7-demo-seed.test.mjs`
  - Creates a disposable PostgreSQL 17 cluster, installs the minimal Supabase platform surface, applies all six repository migrations, and provisions credential-free test identities/memberships.
  - Executes seed twice and cleanup twice; verifies identical demo counts, marker lineage, zero demo rows, exact baseline restoration, no unmarked changes, deterministic-ID collision refusal, exact-slug refusal, an eight-player cap, and a one-membership fallback.
  - Feeds rows read from the disposable database through the real `getTacticsDetail` parser for both manager and member routes, including the sparse all-draft state.
  - Enforces the TacticsBoard readiness contract on the actual parsed attacking draft: seven starters and one starting goalkeeper at both seven and eight selected players, with bench visible only for the eighth player.
  - Replaces one seeded deterministic due with an unmarked row and proves reseeding refuses it while cleanup twice preserves it byte-for-byte.
- `tests/full-mvp-route-matrix.test.ts`
  - Loads the real route pages through the repository's Vite navigation alias.
  - Verifies Owner/Admin/Member read access for Overview, Squad, Matches, Tactics, Funds, and Settings plus mutation access for Squad, Matches, RSVP, Tactics, Funds, and Settings.

## TDD evidence

- RED: `node --test tests/pro7-demo-seed.test.mjs` failed 3/3 because both SQL artifacts were absent after the disposable PG17 cluster successfully applied every migration.
- Review RED: `node --import tsx --test tests/pro7-demo-seed.test.mjs` failed on missing truthful injury metadata and deletion of a replaced deterministic due; the route-parser assertions then exposed the sparse applied invariant addressed by the same round.
- Review GREEN: `node --import tsx --test tests/pro7-demo-seed.test.mjs` passed 6/6 on PostgreSQL 17.
- Review round 2 RED: the focused PG17 test failed because the seed still capped selection at seven; mutation-checking the former attacking-draft allocation then failed the exact-seven assertion with 13 rather than 14 total starter slots.
- Review round 2 GREEN: `node --import tsx --test tests/pro7-demo-seed.test.mjs` passed 7/7, including exact-seven board readiness and eight-player bench visibility.
- Route matrix: `node --import tsx --test tests/full-mvp-route-matrix.test.ts` passed 3/3.

## Fresh local verification

- Focused PG17 plus board-contract/route-parser/matrix run: 10 tests passed, 0 failed.
- `npm run test:unit`: 412 tests, 407 passed, 5 environment-gated skips, 0 failed.
- `npx eslint tests/pro7-demo-seed.test.mjs tests/full-mvp-route-matrix.test.ts`: clean.
- `git diff --check`: clean.
- `npx tsc --noEmit`: repository baseline remains non-zero on existing app/test/Cloudflare diagnostics; no diagnostic referenced either new test file.

## Concerns and controller handoff

- The current remote has one active membership. The seed therefore creates one starter in each incomplete draft, reports `starter_count: 1`, `bench_count: 0`, and deferred bench/injury coverage, and exposes no invalid applied tactic to members. At seven active memberships both tactics are board-ready with no manufactured bench; at eight the actual eighth player appears on both benches.
- The seed does not manufacture injured/available player profiles because doing so would mutate pre-existing membership-domain rows and break exact cleanup restoration. It reports `injured_coverage: "deferred"` when no existing active membership is injured and `"available"` otherwise.
- Remote execution and browser CRUD/role QA were not attempted. The controller should review the SQL, run the seed once remotely, capture only aggregate coverage plus the emitted player count, and preserve `pro7-demo-cleanup.sql` for teardown.
