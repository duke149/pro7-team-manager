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
- SHA-256: `ae4f256b44c0c20a53fee11e0f70a457cc24f7eb5a923bc489988fa18d2af1ab`

## Concerns / boundaries

1. `supabase db lint` could not enable `plpgsql_check` because the local disposable Supabase stub does not install that extension. PostgreSQL 17 execution, catalog ACL/RLS/function checks, and the missing-FK-index probe passed as the local substitute. No remote advisor was run because remote access/apply was explicitly out of scope.
2. Whole-repository `npx tsc --noEmit` still reports the documented baseline errors outside Task 1 (for example Cloudflare ambient types, existing mounted-test typings, and existing Squad typing issues). The focused compile of `lib/supabase/database.types.ts`, the complete unit suite, and production build pass.
3. Pinned CLI type generation against the Homebrew disposable database attempted to use Docker and could not run without Docker Desktop. Per the brief, only the provisional generated table/function contracts were updated manually and verified by focused TypeScript compilation/build.

No existing applied migration was edited. No remote state was mutated.
