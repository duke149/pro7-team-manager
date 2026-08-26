# Task 1 report — remaining PRO7 MVP schema

Status: `DONE_WITH_CONCERNS`

## Delivered files

- `supabase/migrations/20260826043803_pro7_remaining_mvp.sql`
- `tests/supabase-remaining-mvp-schema.test.mjs`
- `tests/supabase-remaining-mvp-live-harness.sql`
- `tests/supabase-remaining-mvp-live-verification.sql`
- `tests/supabase-remaining-mvp-pre-apply.sql`
- `tests/supabase-remaining-mvp-pre-apply.test.mjs`
- `lib/supabase/database.types.ts`

The migration is additive and creates the eleven required public tables, their tenant/composite constraints and access indexes, explicit table/column ACLs, RLS policies, optimistic timestamp checks, and the nine hardened RPCs. Direct authenticated writes remain closed except own-user notification `read_at`; trusted writes flow through narrow RPC boundaries. No demo rows, credentials, remote mutation, migration apply, or deployment were added.

## TDD evidence

### Static schema RED → GREEN

- RED: `node --test tests/supabase-remaining-mvp-schema.test.mjs`
  - Empty CLI-generated migration.
  - Result: `0 pass / 8 fail`; first failure was missing `public.matches`.
- GREEN: same command after implementation.
  - Result: `8 pass / 0 fail`.
- Admin-override audit regression RED: after adding the missing approved Admin RSVP override contract, the focused suite returned `7 pass / 1 fail` because `respond_match_attendance` did not yet check `matches.manage`; GREEN returned to `8 pass / 0 fail` after the minimal permission/audit implementation.

The contracts cover all ten tables, tenant composite FKs, unique/check/index contracts, explicit grants, RLS, own RSVP, applied-only tactic visibility, finance read isolation, RPC signatures/owner/search path/ACL, cancellation/void semantics, optimistic timestamps, lineup validation, and audit inserts.

### PostgreSQL 17 live RED → GREEN

- RED: ran `tests/supabase-remaining-mvp-live-verification.sql` on a disposable PostgreSQL 17.10 database with only the five prerequisite migrations.
  - Expected failure: `public.manage_match(...) does not exist` (`42883`).
- GREEN: ran `tests/supabase-remaining-mvp-live-harness.sql` on a fresh prerequisite-only disposable database.
  - Result sentinels:
    - `remaining_mvp_live_transaction_rollback_ok`
    - `remaining_mvp_live_fixture_counts_zero`
    - `remaining_mvp_live_harness_ok`

The live verifier covers Owner/Admin/Member/unrelated callers, cross-team denial, pending/available/unavailable ownership rules, invitation retry idempotency, completion/cancellation immutability, draft/applied tactics visibility, seven unique starters plus exactly one goalkeeper, finance read/manage denial, paid dues, void semantics, audit events, rollback, and zero residue.

### Pre-apply RED → GREEN

- RED: `node --test tests/supabase-remaining-mvp-pre-apply.test.mjs`
  - Expected failure: read-only artifact did not yet exist (`ENOENT`).
- GREEN with both controlled database states:
  - `PRO7_REMAINING_MVP_PENDING_DATABASE_URL=pro7_remaining_final_pending_20260826`
  - `PRO7_REMAINING_MVP_APPLIED_DATABASE_URL=pro7_remaining_final_applied_20260826`
  - Result: `3 pass / 0 fail / 0 skip`.

The artifact starts a read-only transaction and reports migration history, prospective table/function collisions, authenticated legacy write grants, missing RLS, and tenant composite-FK conflicts.

## Final verification

- Focused schema + default pre-apply tests: `9 pass / 0 fail / 2 environment skips`.
- Controlled pre-apply tests: `3 pass / 0 fail / 0 skip`.
- Focused provisional-type compile: exit `0`.
- Scoped ESLint for the generated types and new Node tests: exit `0`.
- `npm run test:unit`: `268 pass / 0 fail / 5 environment skips` (273 tests total).
- `npm run build`: exit `0`; production build completed.
- `git diff --check`: exit `0`.
- Final PostgreSQL catalog probes:
  - `rls_tables=10`
  - `hardened_rpcs=8`
  - `unexpected_rpc_acl=0`
  - `unindexed_fks=0`

## Migration identity

- Path: `supabase/migrations/20260826043803_pro7_remaining_mvp.sql`
- SHA-256: `4046befe2bb00af95e2825c42866a1471c1393c30001714fb9150d5facfc1a85`

## Concerns / boundaries

1. `supabase db lint` could not enable `plpgsql_check` because the local disposable Supabase stub does not install that extension. PostgreSQL 17 execution, catalog ACL/RLS/function checks, and the missing-FK-index probe passed as the local substitute. No remote advisor was run because remote access/apply was explicitly out of scope.
2. Whole-repository `npx tsc --noEmit` still reports the documented baseline errors outside Task 1 (for example Cloudflare ambient types, existing mounted-test typings, and existing Squad typing issues). The focused compile of `lib/supabase/database.types.ts`, the complete unit suite, and production build pass.
3. Pinned CLI type generation against the Homebrew disposable database attempted to use Docker and could not run without Docker Desktop. Per the brief, only the provisional generated table/function contracts were updated manually and verified by focused TypeScript compilation/build.

No existing applied migration was edited. No remote state was mutated.

## Review fix round 1/5 — 2026-08-26

### Findings verified and corrected

1. Added explicit SQL `NULL` rejection for analysis event/player-stat/team-metric JSON and tactic slots before any destructive write.
2. `manage_match_analysis` now advances the locked match's monotonic `updated_at`, returns that authoritative timestamp, and rejects a second call carrying the stale pre-mutation token with `40001`.
3. RSVP, tactic save, and tactic apply now lock the parent match row before checking the scheduled lifecycle. Tactic apply uses the same parent-before-child lock order as tactic save. Live post-completion behavior plus static lock contracts cover lifecycle serialization.
4. Added `manage_member_due('void_payment', ...)`: it locks the paid due and generated finance entry, voids the entry with a bounded reason, returns the due to `pending`, clears payment linkage/timestamp, and audits both records. Direct void of a paid-due entry remains blocked.
5. Tactic draft create/update is audited with metadata-only payloads; applying a new tactic audits both every demoted applied tactic and the newly applied tactic. Instructions and lineup/player/coordinate content are excluded from audit payloads.
6. Added privileged PostgreSQL 17 mismatch probes for attendance/match, due/finance-entry, and lineup/tactic composite tenant FKs; all assert SQLSTATE `23503`.
7. Exact attendance invitation retry is now a row/token/audit no-op through `ON CONFLICT DO NOTHING`; mixed retries still insert and audit only newly invited active members.

The live verifier also pins the prerequisite foundation role mappings without modifying the applied foundation migration:

- Owner: exact 21 permissions, including `team.delete`.
- Admin: exact 20 permissions, excluding only `team.delete`.
- Member: exact 8 read/respond permissions (`matches.read`, `matches.respond`, `members.read`, `news.read`, `players.read`, `roles.read`, `tactics.read`, `team.read`).

### Review TDD evidence

- RED static regression: `node --test tests/supabase-remaining-mvp-schema.test.mjs` returned `7 pass / 2 fail`; failures first exposed the mutating invite conflict path and missing monotonic timestamp helper.
- GREEN static regression: same command returned `9 pass / 0 fail`.
- GREEN PostgreSQL 17 fresh apply/live harness returned all three sentinels:
  - `remaining_mvp_live_transaction_rollback_ok`
  - `remaining_mvp_live_fixture_counts_zero`
  - `remaining_mvp_live_harness_ok`
- Controlled pending/applied pre-apply: `3 pass / 0 fail / 0 skip`.
- Full unit suite: `269 pass / 0 fail / 5 skip` (`274` total).
- Focused TypeScript compile: exit `0`.
- Scoped ESLint: exit `0`.
- Production build: exit `0`.
- `git diff --check`: exit `0`.
- Final catalog probes: `rls_tables=10`, `hardened_rpcs=8`, `unexpected_rpc_acl=0`, `unindexed_fks=0`.

### Review files and migration identity

- Modified `supabase/migrations/20260826043803_pro7_remaining_mvp.sql` while it remained pending/unapplied outside disposable local verification databases.
- Modified `tests/supabase-remaining-mvp-schema.test.mjs`.
- Modified `tests/supabase-remaining-mvp-live-verification.sql`.
- Modified `tests/supabase-remaining-mvp-pre-apply.sql` with the authoritative source hash.
- Modified `lib/supabase/database.types.ts` for the timestamp return type.
- Appended this report.
- Final SHA-256: `7b98a63b474b36d1f6cfdf39987f6ce5d599eaf09f396761a9773db53f13dc5e`.

### Review concerns / boundaries

1. Pinned CLI `db lint` could not complete against the Homebrew PostgreSQL 17 disposable database because CLI v2.55.8 forced TLS while that local server exposes a non-TLS listener. Fresh PostgreSQL execution and the catalog security/index probes above passed as the local substitute; no remote advisor was invoked.
2. Existing whole-repository TypeScript baseline failures remain outside this task. Focused types, the complete unit suite, and production build pass.
3. No remote mutation/apply/deploy occurred. The tracked foundation migration was not modified; all database mutations were confined to disposable local PostgreSQL 17 databases.

## Review fix round 2/5 — 2026-08-26

### Load-bearing notification gap corrected

- Added `public.notifications` with bounded invitation/reminder types, title/body, match source, own user, team, validated local match-detail target path, `read_at`, and `created_at`.
- Added tenant-safe membership and match composite FKs, idempotency uniqueness on `(user_id, type, source_entity, source_id)`, own-feed and source indexes, explicit ACLs, and RLS.
- Authenticated clients receive table-level `SELECT` and only column-level `UPDATE(read_at)`; they receive no notification `INSERT`, `DELETE`, or content/source mutation capability. Both SELECT and UPDATE policies require `(select auth.uid()) = user_id`.
- `invite_match_attendance` now creates an invitation notification for every newly inserted attendance row in the same transaction. Exact retries change neither attendance nor invitation notification timestamps/counts/audit.
- Added hardened `remind_match_attendance(uuid,uuid,uuid[])`: it requires `matches.manage`, locks the scheduled parent, validates the entire distinct UUID set as active same-team pending attendance, upserts one deterministic reminder per recipient/match, refreshes it unread with a monotonic notification time, leaves RSVP optimistic tokens untouched, audits once per successful reminder write set, and returns the written count.
- Notification target paths are constructed only from the authoritative team slug and match UUID and constrained to `/teams/<slug>/matches/<uuid>`; arbitrary URLs, query strings, fragments, and cross-tenant match sources are rejected by the table contract.

### Round 2 TDD and verification evidence

- RED static regression: `node --test tests/supabase-remaining-mvp-schema.test.mjs` returned `4 pass / 6 fail`; the failures named the missing notification table/constraints/ACL/RLS, invitation side effect, and reminder RPC.
- GREEN static regression: same command returned `10 pass / 0 fail`.
- Fresh PostgreSQL 17 apply/live harness returned:
  - `remaining_mvp_live_transaction_rollback_ok`
  - `remaining_mvp_live_fixture_counts_zero`
  - `remaining_mvp_live_harness_ok`
- Live coverage includes Admin reminder success/retry, Member reminder denial, unrelated-recipient denial, pending-only enforcement, invitation/reminder cardinality, exact invitation retry timestamp stability, own-user notification visibility/read update, denied client content insert/update/delete, local target paths, unchanged RSVP token, and exactly one audit row per successful reminder call.
- Controlled pending/applied pre-apply: `3 pass / 0 fail / 0 skip`, now covering 11 tables, 9 RPCs, and both notification composite FKs.
- Full unit suite: `318 pass / 0 fail / 5 skip` (`323` total).
- Focused TypeScript compile: exit `0`.
- Scoped ESLint: exit `0`.
- Production build: exit `0`.
- `git diff --check`: exit `0`.
- Final catalog probes: `rls_tables=11`, `hardened_rpcs=9`, `unexpected_rpc_acl=0`, `unindexed_fks=0`; authenticated notification privileges are exactly table `SELECT` and column `read_at:UPDATE`.

### Round 2 files and migration identity

- Modified `supabase/migrations/20260826043803_pro7_remaining_mvp.sql` while it remains pending outside disposable local databases.
- Modified `tests/supabase-remaining-mvp-schema.test.mjs`.
- Modified `tests/supabase-remaining-mvp-live-verification.sql`.
- Modified `tests/supabase-remaining-mvp-pre-apply.sql` and `tests/supabase-remaining-mvp-pre-apply.test.mjs`.
- Modified `lib/supabase/database.types.ts` with the notification table and reminder RPC contracts.
- Appended this report.
- Final SHA-256: `4046befe2bb00af95e2825c42866a1471c1393c30001714fb9150d5facfc1a85`.

### Round 2 concerns / boundaries

1. Pinned Supabase CLI v2.55.8 again forced TLS when pointed at the non-TLS Homebrew PostgreSQL 17 listener, so `db lint` could not inspect that disposable database. Fresh PostgreSQL execution plus explicit catalog RLS/ACL/function/FK-index probes passed; no remote advisor was invoked.
2. Existing whole-repository TypeScript baseline issues remain outside Task 1. Focused types, full unit tests, and the production build pass.
3. No remote mutation/apply/deploy occurred; all database writes were confined to disposable local PostgreSQL 17 databases. `supabase/.temp/` remains untouched.
