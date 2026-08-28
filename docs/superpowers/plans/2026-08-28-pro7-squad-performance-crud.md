# PRO7 Squad Performance Integration Plan

> **Execution:** Follow `superpowers:executing-plans` task by task. Use strict TDD for every production behavior. Do not mutate remote Supabase in this plan.

**Goal:** Replace the Squad browser-side performance inference with one bounded server-only enrichment that reports appearances and statistics only from authoritative completed-match player-stat rows.

**Architecture:** A server-only query loads a bounded, strictly parsed completed-match window and the corresponding `match_player_stats` rows under the caller's existing RLS context. It aggregates only the visible Squad player IDs, fails the complete enrichment closed on malformed/incomplete/overflow data, and returns immutable per-player performance records. The Squad page resolves this query before rendering; the client receives no Supabase client and performs no performance fetch.

**Tech stack:** TypeScript, React/Vinext server routes, Supabase/PostgREST under RLS, Node test runner with dependency doubles, mounted/render tests.

---

## Task 1: Lock the performance result contract

**Files:**

- Modify: `lib/squad/model.ts`
- Create: `tests/squad-performance.test.ts`

1. Write failing tests for immutable per-player results containing `recorded`, positive-minute appearances, recent W/D/L form, total minutes/goals/assists/MVP, and optional average rating.
2. Prove RSVP rows and event references are not part of the query contract.
3. Prove unknown/malformed UUIDs, timestamps, scores, numeric values, duplicate match/player rows, incomplete pages, and explicit caps fail closed.
4. Run the focused suite and confirm RED before production implementation.

## Task 2: Implement the bounded server-only aggregate

**Files:**

- Create: `lib/squad/performance.ts`
- Modify: `tests/squad-performance.test.ts`
- Modify: `tests/squad-queries.test.ts`

1. Load completed matches using deterministic UUID-keyset pages with a documented safe maximum; reject overflow instead of truncating history.
2. Load player-stat rows in bounded match-ID chunks, request only match/user/minutes/goals/assists/rating/MVP columns, and require a complete unique row set within the RPC/schema maximum.
3. Aggregate only requested visible player IDs. Count an appearance only when `minutes_played > 0`; build recent form from those appearances ordered by match start descending and stable ID tiebreak.
4. Keep `recorded: false` when no authoritative player-stat row exists. Do not convert a database/query error to zero.
5. Reject browser-runtime imports with the existing server-only contract and re-run focused tests to GREEN.

## Task 3: Bind the aggregate to the existing Squad UI

**Files:**

- Modify: `app/teams/[slug]/squad/page.tsx`
- Modify: `app/teams/[slug]/squad/squad-view.tsx`
- Modify: `tests/squad-pages.test.ts`
- Modify: `tests/squad-player-detail-mounted.test.ts` only if shared fixtures require the new model

1. Write failing page/render tests proving the query runs only after `players.read`, uses the verified team ID and visible player IDs, and is skipped for roster errors/empty results.
2. Remove `createBrowserSupabaseClient`, the effect, and all attendance/event inference from `squad-view`.
3. Pass the immutable server result into cards. Render recorded appearances/form/totals honestly; render “Chưa ghi nhận thống kê” for absent analysis and “Không thể tải phong độ” for enrichment failure.
4. Preserve the hosted toolbar, summary, card order, Admin controls, search/filter/sort behavior, and average-age `—` state.
5. Re-run focused page, query, render, and mounted tests to GREEN.

## Task 4: Verify, inspect locally, review, and checkpoint

1. Run focused Squad suites, full unit, `npm test`, scoped ESLint, changed-module TypeScript diagnostics, browser-import security contracts, and `git diff --check`.
2. Reload localhost:3000 and inspect Squad as the existing authenticated Admin at 1440px and 390px. Verify real player names, truthful recorded/not-recorded states, no loading flash, no horizontal overflow, and even five-item Admin bottom navigation.
3. Verify Member control omission and server-only behavior with mounted/render tests; use a live Member session only when one is already available without transmitting credentials.
4. Perform a fresh scoped review. Fix Critical/Important findings through RED/GREEN before committing.
5. Commit the slice and record that no remote migration, DML, Edge deployment, merge, push, or production update occurred.

## Acceptance criteria

- No Squad browser bundle imports or invokes Supabase for performance data.
- RSVP availability and event references never count as appearances.
- Every appearance is backed by a completed-match player-stat row with positive minutes.
- Aggregate errors/overflow/malformed rows never render fabricated zeroes.
- Admin/player CRUD, search/filter/sort, profile/avatar, and established PRO7 layout remain intact.
