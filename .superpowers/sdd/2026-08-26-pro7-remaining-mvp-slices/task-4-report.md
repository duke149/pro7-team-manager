# Task 4 report — tactics drafts, lineup, bench, and apply workflow

Status: `DONE_WITH_CONCERNS`

## Outcome

Connected the hosted PRO7 tactics surface to the existing Task 1 `match_tactics`, `lineup_slots`, `save_match_tactic`, and `apply_match_tactic` contracts while consuming the Task 2 match query and existing Squad query. The slice now provides a scheduled-match tactics index, an Admin draft editor with save/apply mutations, and an applied-only Member read surface. No mock lineup or player names are present in production code.

The hosted `tactics-toolbar`, `mode-toggle`, `tactics-layout`, `pitch-card`, `pitch`, `pitch-player`, `instruction-card`, and `bench-card` structure is preserved with the existing black/white/red system. Starter movement works through both pointer input and accessible arrow-key controls; local movement never persists until the validated save request is submitted.

## Server and data contracts

- `lib/tactics/model.ts` defines the database-aligned formation, mode, level, role, slot, tactic, player, match-list, and detail contracts.
- `lib/tactics/validation.ts` rejects unknown payload keys and enforces the three formations/modes/levels, coordinate bounds, 2,000-character normalized instructions, positive smallint versions, existing/new optimistic-token coupling, 7–30 unique slots, exactly seven starters, and exactly one starter goalkeeper.
- `lib/tactics/queries.ts` reuses `listMatches` and `listSquadPlayers`, accepts only scheduled match IDs, issues an explicit bounded tactics select, and adds an explicit `status = applied` filter for Member reads before fail-closed row parsing.
- `lib/tactics/actions.ts` requires same-origin JSON within 16 KiB, re-requires `tactics.manage`, derives the team from the guarded context, verifies every save user against active same-team memberships, and then invokes the exact existing RPC signatures. Stale, lifecycle, permission, not-found, validation, and internal failures map to bounded public responses.
- The API route forwards only decoded slug/match identity to the server authority handler.

## UI behavior

- The tactics landing lists only live scheduled matches and retains honest empty/error states.
- Admins receive one local draft per mode, actual active Squad players, exactly seven starter controls when enough players exist, bench rows, instructions, pressing, defensive line, save, and apply.
- Published tactics can seed a new immutable-safe draft version; applying is disabled until an existing clean draft with an optimistic timestamp is present.
- Save normalizes instruction whitespace, sends same-origin JSON, and refreshes authoritative route data on success. Apply sends only tactic identity and the optimistic timestamp, then refreshes.
- Members query and render applied rows only, see no save/apply controls, receive read-only fields and disabled pitch controls, and cannot select modes that have no published tactic.
- Empty, load-error, mutation-error, insufficient-player, and no-applied-tactic states do not invent names, positions, or lineup data.

## TDD evidence

### Server RED → GREEN

- RED: `npm run test:unit -- tests/tactics-validation.test.ts tests/tactics-actions.test.ts`
  - 2/2 files failed with `ERR_MODULE_NOT_FOUND` for the absent tactics validator/action modules.
- GREEN: same command after minimal model/validator/action implementation.
  - 9 passed, 0 failed.

### Query/page/mounted RED → GREEN

- RED: `npm run test:unit -- tests/tactics-pages.test.ts tests/tactics-mounted.test.ts`
  - The query import was absent and the mounted bundle could not resolve `tactics-board`; 6 tests failed.
- GREEN after implementing query/page/board/API contracts:
  - Page/query: 4 passed, 0 failed.
  - Mounted: 5 passed, 0 failed.
- Focused review regressions:
  - Member unpublished mode buttons first failed because they remained enabled; GREEN after disabling only unavailable read-only modes.
  - Instruction normalization first failed with the submitted leading/trailing whitespace intact; GREEN after trimming only at the save boundary.

## Fresh verification

- Focused tactics plus retained landing test: 19 passed, 0 failed before the two focused regressions; both additional regressions passed individually after their fixes and are included in the full suite.
- `npm run test:unit`: 357 tests total; 352 passed, 0 failed, 5 optional live-database environment skips.
- `npm test`: production build succeeded; the tactics page and API routes are present; rendered HTML/browser-boundary suite passed 7/7.
- Scoped ESLint over tactics production/tests/fixtures: exit 0, no findings.
- Full TypeScript diagnostic filter: no diagnostics in tactics production/tests/fixtures.
- `git diff --check`: exit 0.
- No remote mutation, migration apply/edit, deployment, or Supabase temp-directory change occurred.

## Files

- `lib/tactics/model.ts`
- `lib/tactics/validation.ts`
- `lib/tactics/queries.ts`
- `lib/tactics/actions.ts`
- `app/teams/[slug]/tactics/page.tsx`
- `app/teams/[slug]/tactics/[matchId]/page.tsx`
- `app/teams/[slug]/tactics/[matchId]/tactics-board.tsx`
- `app/api/teams/[slug]/tactics/[matchId]/route.ts`
- `app/globals.css`
- `tests/tactics-validation.test.ts`
- `tests/tactics-actions.test.ts`
- `tests/tactics-pages.test.ts`
- `tests/tactics-mounted.test.ts`
- `tests/fixtures/tactics-mounted-entry.ts`
- `tests/fixtures/tactics-navigation.ts`

## Concern

Whole-repository `npm run lint` remains red at the unchanged documented baseline: 479 errors and 1 warning in pre-existing `app/pro7-app.tsx` accessibility findings and generated bundles under `work/`. The fresh tactics-scoped ESLint run is clean. `supabase/.temp/` remains untracked and untouched.
