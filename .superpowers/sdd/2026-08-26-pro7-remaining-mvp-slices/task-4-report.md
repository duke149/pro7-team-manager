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

---

## Fix round 1/5 — authoritative saves, lineup assignment, and hosted parity

Status: `DONE_WITH_CONCERNS`

### Changes

- Save now reads back the exact scoped `match_tactics` row after the RPC, strictly validates `id`, `version`, `updated_at`, and draft status, and returns the authoritative `{ id, version, updatedAt }` contract. The mounted editor reconciles that result before refresh, enabling a newly created draft to apply and ensuring consecutive save/apply requests use the latest optimistic token.
- Tactics player authority now comes directly from active memberships. The bounded keyset query does not filter `player_status`, so injured and unavailable active members remain valid; inactive memberships are excluded, and missing/malformed player or public profile rows fail closed.
- Admins can exchange assignments between any starter and bench slot through pointer drop or Enter/Space selection. Bench entries are semantic buttons; swapping preserves seven starter slot records, one goalkeeper role, unique users, and unique slot keys.
- Pointer movement uses one coherent pointer-events path with capture, release, cancel, and lost-capture cleanup. Native HTML dragging was removed, and a released/lost pointer can no longer move a player on later pointer events.
- Formation changes rewrite all seven starter role/coordinate records from the literal `2-3-1`, `3-2-1`, or `2-2-2` template while retaining the current goalkeeper assignment.
- The hosted toolbar now exposes exactly `Có bóng` and `Không bóng`, mapped to `attacking` and `defensive`. A legacy `balanced` row is surfaced only as an explicitly identified old-data fallback under `Có bóng`; Member fallback is applied-only, so no draft can leak.
- Mode, defensive-line, formation, starter, and bench selection controls expose pressed/selected semantics. Tactics loading and error boundaries now match the existing PRO7 pending/error surfaces and retry behavior.

### Fix-round TDD evidence

- Authoritative save RED: expected the parsed tactic row and malformed-row rejection; old action returned only `tacticId` and accepted malformed readback. GREEN: 6/6 action tests.
- Membership-authority RED: injured/unavailable active members caused the inherited Squad availability filter to fail the applied lineup read. GREEN: direct active-membership query includes all three player statuses and rejects missing player/profile rows.
- Mounted RED: seven failures demonstrated three old mode controls, absent pointer capture, unchanged geometry after formation selection, non-interactive bench assignments, unreconciled new saves, missing ARIA state, and no legacy fallback notice. GREEN: 10/10 mounted tests, including a keyboard swap payload, pointer swaps in both directions, and release/lost-capture regression.
- Boundary RED: tactics `loading.tsx` and `error.tsx` modules were absent. GREEN: pending and retry boundary rendering covered in the page suite.

### Fresh verification

- Focused tactics suite: 27 passed, 0 failed.
- Full `npm run test:unit`: 365 total; 360 passed, 0 failed, 5 optional live-database skips.
- `npm test`: production build succeeded and rendered HTML/browser-boundary checks passed 7/7.
- Tactics-scoped ESLint: exit 0. `git diff --check`: exit 0.
- Whole-repository `npm run lint`: unchanged baseline of 479 errors and 1 warning in pre-existing/generated files.
- No remote operation, migration edit/apply, deployment, or `supabase/.temp/` mutation occurred.

---

## Fix round 2/5 — apply lifecycle, readback races, and drag-click suppression

Status: `DONE_WITH_CONCERNS`

### Changes

- A successful apply no longer leaves the now-immutable applied tactic ID and optimistic token in editable state. The editor immediately forks the applied content into an unsaved version-one draft with null ID/token, keeps duplicate Apply disabled, and sends the next Save through the create path. The same safe version-one seed is used after an Admin reload that contains only an applied tactic.
- Post-save readback now selects and strictly parses the complete scoped tactic and lineup. It accepts only the RPC-returned ID, guarded team/match, submitted mode/formation/instructions/pressing/defensive line, expected resulting version (`1` for create, current + 1 for update), draft status, and an exact slot-keyed lineup match. A structurally valid later version or changed field/slot returns the stable `409 stale` response and its token is never adopted.
- Pointer state records meaningful movement and cross-slot drops. The one native click generated after a coordinate drag or bench drop is consumed for the source slot and the suppression is then cleared; ordinary click and keyboard selection remain available.

### Fix-round TDD evidence

- Apply lifecycle RED: Apply remained enabled and the next edited Save reused the immutable tactic ID/token. GREEN: duplicate Apply is disabled, edit → Save sends `tacticId: null`, `version: 1`, and `expectedUpdatedAt: null`; reload from applied-only data has the same valid create contract.
- Readback race RED: expanded authoritative rows failed the old four-field parser, and raced version/content fixtures could not produce the required stable conflict. GREEN: exact successful create/update rows pass while version +2, formation mismatch, and slot-coordinate mismatch return `409 stale`.
- Pointer-click RED: dispatching pointerdown → move/drop → pointerup → native click selected the source again. GREEN: both coordinate-drag and bench-drop clicks are consumed once, and the following normal click selects normally.

### Fresh verification

- Focused tactics suite: 32 passed, 0 failed.
- Full `npm run test:unit`: 370 total; 365 passed, 0 failed, 5 optional live-database skips.
- `npm test`: production build succeeded and rendered HTML/browser-boundary checks passed 7/7.
- Changed-file ESLint and `git diff --check`: exit 0.
- Whole-repository `npm run lint`: unchanged baseline of 479 errors and 1 warning in pre-existing/generated files.
- No UI redesign, remote operation, migration edit/apply, deployment, or `supabase/.temp/` mutation occurred.
