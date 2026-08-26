# Task 2 report — Matches CRUD, attendance, and analysis

Status: DONE_WITH_CONCERNS

## Outcome

Connected the hosted PRO7 Matches surface to the Task 1 `matches`, `match_attendance`, `match_events`, `match_player_stats`, and `match_team_stats` contracts. The slice now provides server-backed match list/detail models, Admin create/edit/complete/cancel/invite operations, Member own-RSVP operations, and live completed-match analysis. No remote mutation or migration change was made.

## TDD evidence

### RED

1. Server contracts:
   - Command: `npm run test:unit -- tests/matches-validation.test.ts tests/matches-queries.test.ts tests/matches-actions.test.ts`
   - Result: 3/3 test files failed with `ERR_MODULE_NOT_FOUND` for `lib/matches/{validation,queries,actions}`.
2. Route/UI contracts:
   - Command: `npm run test:unit -- tests/matches-pages.test.ts tests/matches-mounted.test.ts`
   - Result: 6/6 tests failed because detail/page/route/client modules did not exist.
3. Admin lifecycle method regression:
   - Command: `npm run test:unit -- tests/matches-mounted.test.ts`
   - Result: 1 failure proved the detail client sent `POST` instead of the route's required `PATCH`.
4. Supabase stale-token format regression:
   - Command: `npm run test:unit -- tests/matches-validation.test.ts`
   - Result: 1 failure proved a real `timestamptz` token such as `2026-10-18T08:00:00+00:00` was rejected.
5. Browser/server boundary regression:
   - Command: `npm run test:unit -- tests/matches-queries.test.ts`
   - Result: 1 failure proved query/action modules could be imported with `window` present.

### GREEN

- Server validation/query/action cycle: 11/11 passed initially.
- Route/UI/mounted cycle: 6/6 passed initially.
- Lifecycle `PATCH`, offset ISO stale token, and server-only boundary regressions all passed after their minimal fixes.
- Final focused command: 20 tests, 20 passed, 0 failed, 0 skipped.

## Verification

- `npm run test:unit -- tests/matches-validation.test.ts tests/matches-queries.test.ts tests/matches-actions.test.ts tests/matches-pages.test.ts tests/matches-mounted.test.ts`
  - 20 tests; 20 passed; 0 failed.
- `npm run test:unit`
  - 294 tests; 289 passed; 0 failed; 5 skipped because optional live PostgreSQL environment variables were absent.
- `npm test`
  - Production build succeeded and exposed the three new match API routes plus list/detail pages.
  - Rendered HTML/browser-boundary suite: 7 passed; 0 failed.
- Scoped ESLint over `lib/matches`, match pages/routes, match tests, and match fixtures: 0 errors, 0 warnings.
- Scoped TypeScript diagnostic filter for match production files: no match-scope errors.
- `git diff --check`: clean.

## Files

### Server contracts

- `lib/matches/model.ts`
- `lib/matches/validation.ts`
- `lib/matches/queries.ts`
- `lib/matches/actions.ts`
- `lib/matches/server-only.ts`

### Pages and client UI

- `app/teams/[slug]/matches/page.tsx`
- `app/teams/[slug]/matches/matches-view.tsx`
- `app/teams/[slug]/matches/loading.tsx`
- `app/teams/[slug]/matches/error.tsx`
- `app/teams/[slug]/matches/[matchId]/page.tsx`
- `app/teams/[slug]/matches/[matchId]/match-detail.tsx`
- `app/globals.css`

### API routes

- `app/api/teams/[slug]/matches/route.ts`
- `app/api/teams/[slug]/matches/[matchId]/route.ts`
- `app/api/teams/[slug]/matches/[matchId]/attendance/route.ts`

### Tests and fixtures

- `tests/matches-validation.test.ts`
- `tests/matches-queries.test.ts`
- `tests/matches-actions.test.ts`
- `tests/matches-pages.test.ts`
- `tests/matches-mounted.test.ts`
- `tests/fixtures/matches-mounted-entry.ts`
- `tests/fixtures/matches-navigation.ts`

## Security and authority decisions

- All mutations require same-origin JSON and a bounded 16 KiB body before authentication/database work.
- Server permission guards require `matches.manage` for lifecycle/invites and `matches.respond` for own RSVP.
- The caller cannot supply team or RSVP user identity; both come from `TeamAccessContext`.
- Database authority remains in the existing hardened `manage_match`, `invite_match_attendance`, and `respond_match_attendance` RPCs plus Task 1 RLS.
- Optimistic `updated_at` tokens are carried through mutations; SQLSTATE `40001` maps to a bounded `409 stale` response.
- Query modules use explicit selects, team filters, stable ordering, bounds, and fail closed on malformed nested rows.
- Query/action modules reject browser-runtime imports.

## Hosted parity decisions

- Preserved the hosted hierarchy and selectors: `match-center`, `confirmed-card`, `rsvp-card`, `analysis-card`, `fixtures-card`.
- Preserved the existing black/white/red visual system and existing card geometry; only small form/state extensions were added.
- Replaced every match demo opponent, score, schedule, count, event, MVP, and metric with model props.
- The hosted third RSVP tile is now the honest non-action state `Chưa xác nhận`; the database supports only `pending`, `available`, and `unavailable`, so no fake “maybe” mutation was retained.
- Admin invite selection initializes with every active invite candidate checked, including already-invited members; the idempotent RPC owns conflict handling.
- List analysis shows the latest completed result; detail analysis renders actual events, MVP/player stats, and team metrics when present, with honest empty copy otherwise.

## Concerns

- Whole-repository `npx tsc --noEmit` remains red on pre-existing non-Task-2 errors in account/Squad/Cloudflare/test harness files. No TypeScript diagnostic remains in Task 2 production files, and the configured production build succeeds.
- Test runs emit existing Node `module.register()` and Vinext middleware deprecation warnings. Parallel Vite suites also occasionally log that HMR port `24678` is already in use; all affected tests still completed successfully.
- Live hosted CRUD was not exercised because this task explicitly prohibited remote mutation. RPC/RLS authority is covered by the already-passing Task 1 schema/live-harness tests and the new injected action tests.
