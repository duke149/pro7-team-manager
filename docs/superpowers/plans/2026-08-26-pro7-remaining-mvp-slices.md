# PRO7 Remaining MVP Slices Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the remaining mock/placeholder Overview, Matches, Tactics, and Funds routes with authorized Supabase-backed CRUD while preserving the approved hosted PRO7 interface, then load removable fictional demo fixtures and verify the full MVP in the browser.

**Architecture:** Add one reviewed additive Postgres migration containing the four domain schemas, tenant RLS, exact grants, and narrow mutation RPCs. Each route uses typed server reads plus small client islands for mutations; Overview is a read-only aggregate over the same sources. Demo fixtures are tagged, idempotent, and removable without deleting real team or Auth data.

**Tech Stack:** Vinext/Next-compatible React 19 server routes, TypeScript 5.9, Supabase Postgres 17/Auth/Realtime, `@supabase/ssr` 0.12.5, `@supabase/supabase-js` 2.112.4, Node test runner + tsx, happy-dom, Supabase MCP, in-app browser.

**Spec:** `docs/superpowers/specs/2026-08-25-pro7-full-mvp-crud-design.md`

## Global Constraints

- Preserve the hosted PRO7 left rail, page headers, cards, labels, actions, spacing, responsive behavior, and black/white/red palette; do not redesign the frontend or add neon colors.
- All team routes resolve identity, membership, and permission on the server; hidden controls are UX only and RLS/RPC checks remain authoritative.
- Members can read matches/news/applied tactics and respond only to their own attendance; Funds and Admin Settings remain Admin/Owner-only.
- Scheduled matches use cancellation after invitations; completed-match corrections and finance voids are audited instead of hard deletion.
- Every public table has explicit grants and RLS. Every `SECURITY DEFINER` RPC fixes `search_path`, revokes `PUBLIC`/`anon`, grants only intended roles, and re-checks authorization.
- New UI code must not hardcode demo names, totals, balances, match scores, or lineup data.
- Demo data uses a stable `PRO7-DEMO` marker, is idempotent, and has an explicit cleanup query that cannot target unmarked data.
- Every production behavior follows RED → GREEN → refactor and every slice receives desktop/mobile, light/dark, Owner/Admin/Member browser verification on `http://localhost:3000`.
- Remote DDL, Edge deployment, and demo-data writes occur only after the reviewed migration/preflight checkpoint and are followed by advisors and cleanup counts.

---

### Task 1: Add remaining-MVP schema, RLS, grants, aggregates, and RPCs

**Files:**
- Create: `supabase/migrations/<cli-version>_pro7_remaining_mvp.sql`
- Create: `tests/supabase-remaining-mvp-schema.test.mjs`
- Create: `tests/supabase-remaining-mvp-live-harness.sql`
- Create: `tests/supabase-remaining-mvp-live-verification.sql`
- Create: `tests/supabase-remaining-mvp-pre-apply.sql`
- Create: `tests/supabase-remaining-mvp-pre-apply.test.mjs`
- Modify: `lib/supabase/database.types.ts`

**Interfaces:**
- Consumes: `public.has_team_permission(uuid,text)`, team/membership/profile tables, permissions introduced by `20260825013307_pro7_foundation_permissions.sql`.
- Produces: `matches`, `match_attendance`, `match_events`, `match_player_stats`, `match_team_stats`, `team_news`, `match_tactics`, `lineup_slots`, `finance_entries`, `member_dues`, and narrow RPCs `manage_match`, `invite_match_attendance`, `respond_match_attendance`, `manage_match_analysis`, `save_match_tactic`, `apply_match_tactic`, `manage_finance_entry`, `manage_member_due`.

- [ ] **Step 1: Create the migration with the pinned CLI**

Run `npx supabase@2.55.8 migration new pro7_remaining_mvp` and record the exact generated path.

- [ ] **Step 2: Write failing static contracts**

Add behavioral/static assertions for every table, composite FK, unique/index/check, explicit grants, RLS policy, RPC signature/owner/config/ACL, applied-tactic visibility, own RSVP update, Admin-only finance, cancellation/void semantics, and audit calls.

- [ ] **Step 3: Verify RED**

Run `node --test tests/supabase-remaining-mvp-schema.test.mjs`; expect failure because the generated migration is empty.

- [ ] **Step 4: Implement minimal SQL**

Use relational columns for all filtering/join keys, `jsonb` only for bounded versioned comparison metrics, integer VND amounts, normalized pitch coordinates in `[0,100]`, `updated_at` optimistic checks, tenant composite FKs, and explicit `TO authenticated` policies with permission/ownership predicates.

- [ ] **Step 5: Verify static GREEN**

Run `node --test tests/supabase-remaining-mvp-schema.test.mjs`; expect all assertions pass.

- [ ] **Step 6: Write the transactional PostgreSQL 17 verifier**

Cover Owner/Admin/Member/unrelated users, cross-team denial, pending/available/unavailable RSVP ownership, invitation idempotency, completion/cancellation rules, applied-vs-draft tactics visibility, seven unique starters with goalkeeper, finance read/manage denial, void semantics, and rollback-zero fixture counts.

- [ ] **Step 7: Run live RED/GREEN and pre-apply**

Apply existing migrations plus the new migration to a disposable PostgreSQL 17 database, run the live harness, require explicit success and rollback/cleanup sentinels, then run the read-only pre-apply artifact against both pending and applied controlled states.

- [ ] **Step 8: Update provisional database types and verify**

Update only the generated table/function contracts, run focused TypeScript tests, `npm run test:unit`, `npm run build`, scoped ESLint, and `git diff --check`.

- [ ] **Step 9: Commit**

Run `git add supabase/migrations tests/supabase-remaining-mvp-* lib/supabase/database.types.ts && git commit -m "feat: add remaining PRO7 MVP schema"`.

---

### Task 2: Connect Matches CRUD, attendance invitations, and analysis

**Files:**
- Create: `lib/matches/model.ts`
- Create: `lib/matches/validation.ts`
- Create: `lib/matches/queries.ts`
- Create: `lib/matches/actions.ts`
- Create: `app/teams/[slug]/matches/matches-view.tsx`
- Create: `app/teams/[slug]/matches/[matchId]/page.tsx`
- Create: `app/teams/[slug]/matches/[matchId]/match-detail.tsx`
- Create: `app/api/teams/[slug]/matches/route.ts`
- Create: `app/api/teams/[slug]/matches/[matchId]/route.ts`
- Create: `app/api/teams/[slug]/matches/[matchId]/attendance/route.ts`
- Modify: `app/teams/[slug]/matches/page.tsx`
- Modify: `app/globals.css`
- Create: `tests/matches-validation.test.ts`
- Create: `tests/matches-queries.test.ts`
- Create: `tests/matches-actions.test.ts`
- Create: `tests/matches-pages.test.ts`
- Create: `tests/matches-mounted.test.ts`

**Interfaces:**
- Consumes: Task 1 match tables/RPCs and `TeamAccessContext`.
- Produces: server list/detail models, validated mutation results, real RSVP controls, Admin invite selection defaulting to every active member, and hosted-layout match analysis.

- [ ] **Step 1: Write validation/query/action RED tests**

Assert exact payload keys, bounded opponent/venue/note, ISO timestamps, score/status consistency, same-origin JSON, permission gating, explicit selects, stable sorting, malformed-row fail-closed behavior, and RPC error mapping.

- [ ] **Step 2: Verify RED**

Run `npm run test:unit -- tests/matches-validation.test.ts tests/matches-queries.test.ts tests/matches-actions.test.ts`; expect missing-module failures.

- [ ] **Step 3: Implement contracts and verify GREEN**

Implement small server-only modules; run the same command until all tests pass.

- [ ] **Step 4: Write route/UI RED tests**

Assert hosted control order, Admin create/edit/cancel/complete/invite controls, Member own RSVP only, three honest loading/empty/error states, details/analysis/upcoming schedule from props, no mock values, and navigation refresh after mutations.

- [ ] **Step 5: Implement route/UI without changing visual identity**

Reuse the prototype class structure (`match-center`, `confirmed-card`, `rsvp-card`, `analysis-card`, `fixtures-card`) and replace only data/actions. Use forms/dialogs whose labels and buttons match the hosted screens.

- [ ] **Step 6: Verify Task 2**

Run focused unit/mounted tests, rendered HTML, full unit suite, production build, scoped ESLint, and `git diff --check`.

- [ ] **Step 7: Commit**

Run `git add lib/matches app/teams/'[slug]'/matches app/api/teams/'[slug]'/matches app/globals.css tests/matches-* && git commit -m "feat: connect match and attendance CRUD"`.

---

### Task 3: Build Overview aggregates, news, statistics, and calendar

**Files:**
- Create: `lib/overview/model.ts`
- Create: `lib/overview/queries.ts`
- Create: `lib/overview/aggregates.ts`
- Create: `app/teams/[slug]/overview/overview-view.tsx`
- Modify: `app/teams/[slug]/overview/page.tsx`
- Modify: `app/globals.css`
- Create: `tests/overview-aggregates.test.ts`
- Create: `tests/overview-queries.test.ts`
- Create: `tests/overview-page.test.ts`

**Interfaces:**
- Consumes: Task 1/2 matches, attendance, events/stats, news, and context permissions.
- Produces: next-match/countdown model, attendance aggregate, recent form/win rate, top scorer, published news, and upcoming calendar links.

- [ ] **Step 1: Write aggregate/query RED tests**

Use hand-calculated fixtures for next scheduled match, pending/available/unavailable totals, W/D/L form, zero-match empty statistics, top-scorer tie-breaks, published-only news, and stable calendar ordering.

- [ ] **Step 2: Verify RED, implement, and verify GREEN**

Run `npm run test:unit -- tests/overview-aggregates.test.ts tests/overview-queries.test.ts`; expect missing modules, implement minimal bounded queries/aggregates, then require all tests pass.

- [ ] **Step 3: Write and implement page parity RED/GREEN**

Assert the hosted `Chốt đội hình`, `Chi tiết trận`, attendance, statistics, news, and calendar card order; actions link to the actual next match/tactics route; members never receive remind/manage controls; empty/error states do not invent statistics.

- [ ] **Step 4: Verify Task 3**

Run focused tests, render tests, full unit suite, build, scoped ESLint, and diff-check.

- [ ] **Step 5: Commit**

Run `git add lib/overview app/teams/'[slug]'/overview app/globals.css tests/overview-* && git commit -m "feat: connect PRO7 overview aggregates"`.

---

### Task 4: Connect tactics drafts, lineup slots, bench, and apply workflow

**Files:**
- Create: `lib/tactics/model.ts`
- Create: `lib/tactics/validation.ts`
- Create: `lib/tactics/queries.ts`
- Create: `lib/tactics/actions.ts`
- Create: `app/teams/[slug]/tactics/[matchId]/page.tsx`
- Create: `app/teams/[slug]/tactics/[matchId]/tactics-board.tsx`
- Create: `app/api/teams/[slug]/tactics/[matchId]/route.ts`
- Modify: `app/teams/[slug]/tactics/page.tsx`
- Modify: `app/globals.css`
- Create: `tests/tactics-validation.test.ts`
- Create: `tests/tactics-actions.test.ts`
- Create: `tests/tactics-pages.test.ts`
- Create: `tests/tactics-mounted.test.ts`

**Interfaces:**
- Consumes: Task 1 tactics/lineup RPCs, Task 2 scheduled matches, active squad records.
- Produces: Admin draft editor/save/apply and Member read-only applied lineup.

- [ ] **Step 1: Write validator/action RED tests**

Assert allowed formations/modes, coordinates `[0,100]`, bounded instructions, pressing/defensive values, unique users/slots, exactly seven starters, one goalkeeper, active same-team players, optimistic version, same-origin JSON, and tactics permissions.

- [ ] **Step 2: Verify RED, implement, and verify GREEN**

Run focused tests, implement minimal contracts, and require all pass.

- [ ] **Step 3: Write mounted parity RED tests**

Assert hosted formation/mode toolbar, pitch, seven draggable starter controls, bench, instructions, save/apply, accessible keyboard movement, mutation refresh, and Member read-only mode with no draft leakage.

- [ ] **Step 4: Implement tactics routes/UI**

Reuse `tactics-toolbar`, `pitch-card`, `pitch`, `pitch-player`, `instruction-card`, and `bench-card`; pointer/keyboard changes update local draft and persistence only occurs through validated save/apply requests.

- [ ] **Step 5: Verify Task 4 and commit**

Run focused/mounted/render/full tests, build, ESLint, diff-check, then `git add lib/tactics app/teams/'[slug]'/tactics app/api/teams/'[slug]'/tactics app/globals.css tests/tactics-* && git commit -m "feat: connect match tactics workflow"`.

---

### Task 5: Connect Admin-only funds CRUD and dues

**Files:**
- Create: `lib/funds/model.ts`
- Create: `lib/funds/validation.ts`
- Create: `lib/funds/queries.ts`
- Create: `lib/funds/actions.ts`
- Create: `app/teams/[slug]/funds/funds-view.tsx`
- Create: `app/api/teams/[slug]/funds/entries/route.ts`
- Create: `app/api/teams/[slug]/funds/dues/route.ts`
- Modify: `app/teams/[slug]/funds/page.tsx`
- Modify: `app/globals.css`
- Create: `tests/funds-validation.test.ts`
- Create: `tests/funds-queries.test.ts`
- Create: `tests/funds-actions.test.ts`
- Create: `tests/funds-pages.test.ts`
- Create: `tests/funds-mounted.test.ts`

**Interfaces:**
- Consumes: Task 1 finance tables/RPCs and `finance.read/manage` permission.
- Produces: authoritative balance/monthly income/expense/pending dues, create income/expense, mark due paid, and void with reason.

- [ ] **Step 1: Write contract RED tests**

Assert integer positive VND, bounded category/description/void reason, period/due-date/state consistency, explicit queries excluding voided entries from balance, no client balance input, same-origin JSON, and permission/error mapping.

- [ ] **Step 2: Verify RED, implement contracts, verify GREEN**

Run focused tests, implement minimal modules, and require all pass.

- [ ] **Step 3: Write and implement page/mounted RED→GREEN**

Preserve hosted balance, action cards, summary strip, member dues, and recent transactions; implement create-expense/payment dialogs, paid/void actions, field errors and refresh; member access must resolve to denied before any finance query.

- [ ] **Step 4: Verify Task 5 and commit**

Run focused/mounted/render/full tests, build, ESLint, diff-check, then `git add lib/funds app/teams/'[slug]'/funds app/api/teams/'[slug]'/funds app/globals.css tests/funds-* && git commit -m "feat: connect admin funds CRUD"`.

---

### Task 6: Import removable fictional demo data and verify the complete MVP

**Files:**
- Create: `supabase/demo/pro7-demo-seed.sql`
- Create: `supabase/demo/pro7-demo-cleanup.sql`
- Create: `tests/pro7-demo-seed.test.mjs`
- Create: `tests/full-mvp-route-matrix.test.ts`
- Modify: `.superpowers/sdd/2026-08-26-pro7-remaining-mvp-slices/progress.md`

**Interfaces:**
- Consumes: all prior tables/RPCs plus the existing `pro7-fc` demo team and provisioned test members.
- Produces: a labelled demo season containing active/injured players, scheduled/completed/cancelled matches, every RSVP state, events/stats, published/draft news, draft/applied tactics, finance entries/void, and paid/pending dues.

- [ ] **Step 1: Write seed safety RED tests**

Execute seed twice and cleanup twice on disposable PostgreSQL 17; assert identical counts after the second seed, zero marked rows after cleanup, no unmarked row changes, no hardcoded Auth credentials, and all records carry the stable `PRO7-DEMO` marker through a bounded description/category/notes/source field.

- [ ] **Step 2: Implement seed and cleanup, verify GREEN**

Use deterministic UUIDs only for demo domain rows, resolve the target team by exact slug, resolve existing demo memberships, refuse to run if the slug is ambiguous, and insert enough data to exercise every visible state without touching real rows.

- [ ] **Step 3: Apply the reviewed schema remotely and reconcile types**

Run the remote read-only preflight, apply the exact migration once, normalize migration history to the local CLI version if necessary, generate remote TypeScript types, verify schema/RLS/RPC behavior, and run security/performance advisors.

- [ ] **Step 4: Import demo fixtures remotely**

Execute the idempotent seed, query only counts/aggregates to verify expected coverage, and preserve the cleanup artifact for final handoff.

- [ ] **Step 5: Run automated whole-MVP verification**

Run `npm run test:unit`, Edge Function suites, all SQL contracts/live harnesses, `npm run test`, scoped and repository lint with baseline triage, TypeScript baseline triage, and `git diff --check`.

- [ ] **Step 6: Run browser QA on localhost**

With the clean dev server, test Owner/Admin/Member route matrix and actual CRUD for Squad, Matches/RSVP/analysis, Overview links/aggregates, Tactics draft/apply/read-only, Funds create/pay/void/denial, Settings denial, Profile/avatar boundary, search/sort/filter, logout/login, desktop/mobile, and light/dark. Restore or delete each temporary mutation and confirm final demo counts.

- [ ] **Step 7: Commit**

Run `git add supabase/demo tests/pro7-demo-seed.test.mjs tests/full-mvp-route-matrix.test.ts && git commit -m "test: add removable PRO7 demo fixtures"`.

---

### Task 7: Final review and handoff

**Files:**
- Modify: `docs/superpowers/plans/2026-08-26-pro7-remaining-mvp-slices.md`
- Create: `.superpowers/sdd/2026-08-26-pro7-remaining-mvp-slices/final-verification.md`

**Interfaces:**
- Consumes: Tasks 1–6 and every ledger ruling/finding.
- Produces: final review package, verified local/remote inventory, remaining advisor warnings, demo cleanup instructions, and user-facing approval checklist.

- [ ] **Step 1: Run a whole-branch independent review**

Review spec compliance, authorization, tenant isolation, mutation concurrency, UI parity, demo safety, and test evidence; fix all Critical/Important findings through the bounded review loop.

- [ ] **Step 2: Record final evidence**

Record exact commits, migration versions/hashes, Edge Function versions, test counts, route/browser matrix, advisor URLs, demo row counts, and cleanup command in the final verification artifact.

- [ ] **Step 3: Present the final approval state**

Keep `localhost:3000` running, leave a representative route open, and report what is complete, what is intentionally deferred, warnings requiring dashboard action, and how to remove demo data before importing production data.
