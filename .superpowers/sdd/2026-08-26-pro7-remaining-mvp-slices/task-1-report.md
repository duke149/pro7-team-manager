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

The migration is additive and creates the ten requested public tables, their tenant/composite constraints and access indexes, explicit table ACLs, RLS policies, optimistic timestamp checks, and the eight requested hardened RPCs. Direct authenticated writes remain closed; writes flow through the narrow RPC boundaries. No demo rows, credentials, remote mutation, migration apply, or deployment were added.

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
- SHA-256: `7b98a63b474b36d1f6cfdf39987f6ce5d599eaf09f396761a9773db53f13dc5e`

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
