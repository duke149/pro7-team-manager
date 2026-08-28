# PRO7 Historical Tactics Integrity Implementation Plan

> Execute with `superpowers:executing-plans`, use test-driven development, and preserve the approved PRO7 tactics layout.

**Goal:** Keep scheduled tactics editable only with active team members while making completed-match tactics a truthful, read-only historical record whose referenced players remain identifiable after deactivation.

**Architecture:** Extend the existing server-only tactics query with a bounded, exact historical-identity resolver. Scheduled matches retain the current active-player pool and mutation rules. Completed matches request only applied tactics, resolve every referenced slot through same-team membership/profile rows including inactive memberships, and fail closed on missing, malformed, duplicate, cross-team, or overflow data. The existing board remains visually unchanged and receives a non-editable capability for completed history.

**Tech stack:** TypeScript, React server/client components, Supabase/PostgREST with RLS, Node test runner, Vite mounted tests, Vinext.

## Task 1: Lock historical identity and lifecycle contracts

**Files:**
- Modify: `tests/tactics-pages.test.ts`
- Modify: `tests/tactics-mounted.test.ts`

1. Add failing query tests proving a completed applied tactic resolves inactive referenced memberships and their real profile names, requests no unrelated former members, and exposes no generic “Chưa cập nhật tên” label.
2. Add failing cases for missing membership/profile rows, duplicate rows, malformed historical rows, non-monotonic pages, and reference overflow.
3. Add failing page/mounted tests proving completed tactics are read-only for both Admin and Member, query only applied rows, and never expose save/apply/drag controls.
4. Run focused tests and record the expected RED failures before production edits.

## Task 2: Implement the bounded server-only resolver

**Files:**
- Modify: `lib/tactics/queries.ts`
- Modify if required: `lib/tactics/model.ts`

1. Keep active-membership pagination unchanged for scheduled matches.
2. After loading and strictly parsing applied completed-match tactics, collect their unique slot user IDs with an explicit safe bound.
3. Query only those same-team memberships without an active-status filter, in bounded keyset/in-list chunks, and require one exact row per requested identity.
4. Load the corresponding visible profiles in bounded chunks, reject missing/duplicate/malformed rows, and return immutable player labels. Null names use an identifier-backed former-player label rather than invented data.
5. Preserve scheduled-match rejection of any tactic slot outside the active pool.

## Task 3: Enforce read-only completed history in the existing board

**Files:**
- Modify: `app/teams/[slug]/tactics/[matchId]/page.tsx`
- Modify: `app/teams/[slug]/tactics/[matchId]/tactics-board.tsx`

1. Treat `tactics.manage` as a scheduled-match edit capability, not blanket editability.
2. For completed matches, request applied rows only and render the existing board with disabled formation, modes, player controls, instructions, pressing, defensive line, save, and apply mutations.
3. Replace the generic missing-name fallback with an identifier-backed label; do not change the pitch, toolbar, side-card, responsive layout, or black/white/red theme.
4. Run focused query, page, and mounted tests to GREEN.

## Task 4: Verify and checkpoint

1. Run the complete tactics-focused test set, full unit suite, production build/render suite, changed-file ESLint, TypeScript diagnostic filter, and `git diff --check`.
2. Open a completed tactic and a scheduled tactic on authenticated localhost. Verify historical names/read-only controls, scheduled Admin editability, light/dark, 1440 px and 390 px widths, and no horizontal overflow.
3. Self-review the complete slice because agent delegation is disabled for this session; address any Critical or Important issue before commit.
4. Commit the slice without remote Supabase mutation, branch merge, push, or production deployment.
