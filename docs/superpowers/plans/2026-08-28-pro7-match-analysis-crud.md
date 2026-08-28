# PRO7 Match Analysis CRUD Implementation Plan

> **Execution:** Follow `superpowers:executing-plans` task by task. Use strict TDD for every production behavior. Do not mutate remote Supabase in this plan.

**Goal:** Complete the Admin-only atomic match-analysis workflow while preserving the approved PRO7 match-detail layout and keeping Member views read-only.

**Architecture:** A strict same-origin `PUT` route validates one complete analysis snapshot and calls the existing `manage_match_analysis` RPC exactly once. The match detail server query supplies authoritative analysis rows and same-team historical member identities. A client editor is embedded below the existing completed-match analysis card; successful writes adopt the returned concurrency token and refresh, while stale writes preserve the draft.

**Tech stack:** TypeScript, React/Vinext, Supabase/Postgres RPC + RLS, Node test runner with `tsx`, Vite mounted tests.

---

## Task 1: Lock the analysis payload contract

**Files:**

- Create: `lib/matches/analysis-validation.ts`
- Create: `tests/matches-analysis-validation.test.ts`

1. Write failing tests for exact top-level and nested keys, byte-independent structural limits (200 events, 100 stats), UUID/timestamp validation, normalized notes, duplicate event order, duplicate players, one-MVP limit, integer/count/rating bounds, event/player relationships, metric key/value bounds, and valid empty snapshots.
2. Run `npm run test:unit -- tests/matches-analysis-validation.test.ts` and confirm RED because the module is absent.
3. Implement immutable `MatchAnalysisPayload` parsing. Emit RPC-shaped snake-case child objects only after all fields pass.
4. Re-run the focused suite and confirm GREEN.

## Task 2: Add the server mutation and same-origin API

**Files:**

- Create: `lib/matches/analysis-actions.ts`
- Create: `app/api/teams/[slug]/matches/[matchId]/analysis/route.ts`
- Create: `tests/matches-analysis-actions.test.ts`
- Modify: `tests/matches-pages.test.ts`

1. Write failing tests for origin/content-type/body-size/JSON/UUID guards, `matches.manage`, slug-bound team ID, one RPC invocation, exact arguments, successful returned timestamp, and stable 403/404/409/422/500 mappings.
2. Run the focused tests and confirm RED.
3. Implement a bounded same-origin `PUT` action. Call `manage_match_analysis` once with the verified team ID and return `{ ok: true, updatedAt }` only when the RPC result is a valid timestamp.
4. Add the route forwarding contract and re-run focused tests to GREEN.

## Task 3: Supply historical analysis identities without widening access

**Files:**

- Modify: `lib/matches/model.ts`
- Modify: `lib/matches/queries.ts`
- Modify: `tests/matches-queries.test.ts`

1. Write failing query tests proving Admin analysis candidates include the bounded active invite pool plus every invited/referenced historical same-team identity (including inactive memberships), Members do not receive editor candidates, referenced historical stat/event identities resolve names, malformed/duplicate/incomplete pages fail closed, and no cross-team fields are requested.
2. Run `npm run test:unit -- tests/matches-queries.test.ts` and confirm RED.
3. Add `analysisCandidates` to `MatchDetail`. Build it from the existing bounded active invite pool plus attendance/event/stat references, so a `matches.manage` custom role does not become incorrectly dependent on `members.read`. Reuse the existing profile visibility policy and batched profile reads; never expose membership role or private profile fields.
4. Re-run focused tests and confirm GREEN.

## Task 4: Build the PRO7 analysis editor and honest read state

**Files:**

- Create: `app/teams/[slug]/matches/[matchId]/match-analysis-editor.tsx`
- Modify: `app/teams/[slug]/matches/[matchId]/match-detail.tsx`
- Modify: `app/globals.css`
- Create: `tests/matches-analysis-editor.test.ts`
- Modify: `tests/matches-pages.test.ts`

1. Write failing render/mounted tests for Admin-only editor controls, Member omission, add/remove events, player-stat editing, MVP exclusivity, metric editing, reset, exact save payload, success-token adoption + refresh, stale draft preservation, field errors, and 44px mobile controls.
2. Run focused tests and confirm RED.
3. Implement the editor inside the existing completed-match hierarchy. Keep the current card order and black/white/red styles. Use native semantic controls and existing focus/error/status patterns.
4. Remove fabricated `effectiveMetrics`. When no stored metrics exist, render the explicit Vietnamese empty state instead of inferred percentages/counts.
5. Re-run focused tests and confirm GREEN.

## Task 5: Verify, inspect locally, review, and checkpoint

**Files:**

- Modify: `docs/superpowers/plans/2026-08-28-pro7-match-analysis-crud.md` only if verification reveals a contract correction.

1. Run the complete Match suite.
2. Run `npm run test:unit` and `npm test`.
3. Run changed-file ESLint, changed-module TypeScript diagnostics, secret/security contracts, and `git diff --check origin/main`.
4. Start the existing localhost app without changing remote data. Inspect the completed-match Admin page and Member read-only page at desktop and mobile widths; verify that missing metrics remain empty and no controls leak to Members.
5. Perform a fresh scoped code review against this plan. Fix Critical/Important findings through RED/GREEN before committing.
6. Commit the slice. Report remote migration/apply and live remote mutation as not performed.

## Acceptance criteria

- Admin can create, replace, and clear the full completed-match analysis snapshot through one authoritative API/RPC transaction.
- Members see persisted analysis but cannot receive analysis candidates or editor controls.
- Stale score/analysis writes cannot overwrite newer data.
- Historic same-team identities remain resolvable after membership deactivation.
- No synthetic metrics or performance values appear.
- The PRO7 layout, navigation, theme, and responsive structure remain unchanged outside scoped controls.
