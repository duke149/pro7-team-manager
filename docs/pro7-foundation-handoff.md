# PRO7 foundation slice — local handoff checkpoint

## 2026-08-26 remote-state addendum

This addendum supersedes this historical checkpoint's remote-pending statements. Project `pficsujapinkmqsyvcfw` now records the exact ordered migration history `20260824170300_supabase_mvp_core`, `20260824183536_rls_mutation_visibility`, `20260825013307_pro7_foundation_permissions`, and `20260825091904_pro7_squad_profiles`; the authorized Squad post-apply verification was GREEN. Remote-generated types have replaced the provisional file at `lib/supabase/database.types.ts` (PostgREST `14.17`, 541 lines, SHA-256 `82919e9c7b62a67b937d2408a7377ecf07653caf5daf1883d238e82d27e95e9d`). The current migration hashes, remote table/RLS inventory, advisor rulings, and remaining project-setting concern are recorded in `docs/supabase-mvp-handoff.md`.

## Scope and state

This handoff records local-only evidence for the PRO7 foundation routing and
RBAC slice. No Supabase remote DDL, Edge deployment, secret change, type
generation, advisor run, real-credential login, or authenticated product-route
browser QA was completed. The remote project is therefore **not**
foundation-complete.

The linked worktree is `feature/supabase-mvp-core`. The whole-plan final-fix
wave began at `ba802fc` and is implemented locally in `ea07ac5`. The five
Important review findings are addressed in code and local verification. The
scoped whole-plan re-review now passes; authenticated product-route browser QA
and all remote operations remain pending.

## Commits in this slice

| Commit | Subject |
| --- | --- |
| `6fb6ee0` | `feat: add PRO7 foundation permissions` |
| `8f477e1` | `test: verify foundation permission remapping` |
| `7e79794` | `feat: add typed team access guards` |
| `eb559bd` | `fix: load custom role team context` |
| `aacc414` | `fix: harden team context RPC` |
| `6f84f59` | `feat: require temporary password replacement` |
| `da61437` | `fix: harden temporary password replacement` |
| `c565b88` | `fix: preserve ambiguous password writes` |
| `ec93e75` | `feat: add team-scoped product routes` |
| `17b39d9` | `fix: harden team route boundaries` |
| `fae0cbc` | `fix: preserve framework team route context` |
| `190f759` | `feat: add permission-aware product shell` |
| `c359412` | `fix: harden product shell controls` |
| `49e96a2` | `test: mount product shell interactions` |
| `c769baa` | `fix: hydrate product shell safely` |
| `31e15f3` | `docs: hand off PRO7 foundation slice` |
| `ba802fc` | `docs: correct foundation handoff checkpoint` |
| `ea07ac5` | `fix: close foundation review findings` |

## Migration inventory and order

Do not amend or rerun the already-applied core migration.  The latter two files
remain local-only pending explicit remote authorization.

| Order | Migration | SHA-256 | Remote state |
| --- | --- | --- | --- |
| 1 | `20260824170300_supabase_mvp_core.sql` | `b0c13b47538e07c02666672fc9e83b13a49167c0590deed782bb50596e7cf363` | Applied once; do not reapply/amend |
| 2 | `20260824183536_rls_mutation_visibility.sql` | `2c2b1ca30529b1ddc0d0dc66a899384d118ec763ef94f7222ba669b39fbe605b` | Pending remote authorization |
| 3 | `20260825013307_pro7_foundation_permissions.sql` | `a319ee4e03bc94973063bb5568e542a98b9eaa4afae4b26cf38431f416d9ca83` | Pending remote authorization |

## Fresh local evidence

All commands below were rerun for this handoff.  `git diff --check` completed
with no output before documentation changes.

| Gate | Result |
| --- | --- |
| `npm run test:unit` | Exit 0: 147 passed, 0 failed |
| `npm test` | Exit 0: production build completed; 6 rendered/source tests passed |
| Core, pending-RLS, foundation, and pre-apply static SQL contracts | Exit 0: 21 passed, 0 failed |
| `deno check supabase/functions/change-temporary-password/index.ts` | Exit 0 |
| Focused ESLint over all final-fix application/library/test files | Exit 0, no diagnostics |
| `npm ci --ignore-scripts --dry-run` | Exit 0 |
| `git diff --check` | Exit 0, no output |

For the scoped re-review closeout, the controller freshly reran
`npm run test:unit` (147/147) and `npm test` (production build succeeded; 6/6
rendered/source tests). These confirm the reviewed local head without changing
the remote state.

A disposable PostgreSQL 17.10 cluster, with only local Supabase role/auth
stubs, applied the immutable core migration first. Before either pending file,
`tests/supabase-foundation-pre-apply.sql` ran in a read-only transaction and
reported the three expected migration states, the 10-code pre-foundation
catalog, and zero slug, auth/profile, system-role, custom-role,
prospective-column, or prospective-function conflicts. The pending RLS file
then applied; the core verifier reported `ok`, explicit `ROLLBACK`, 98
assertions, and 17 coverage groups. The foundation harness applied the local
foundation file and reported `ok`, explicit `ROLLBACK`, 50 assertions, and 15
coverage groups. Its committed-fixture cleanup reported exactly:

```text
fixture_auth_users=0 fixture_profiles=0 fixture_teams=0 fixture_roles=0
fixture_memberships=0 fixture_audit_events=0 fixture_permissions=21
```

This was local disposable-database evidence only; no SQL reached Supabase.

## Known baseline findings — not green gates

- Full repository ESLint is not a source gate because it traverses generated
  test bundles and retains unrelated prototype-page accessibility debt. It was
  not rerun for this final-fix wave; the complete changed surface was linted
  successfully.
- `npx tsc --noEmit` reproduces 21 known, non-gating root TypeScript
  configuration/boundary diagnostics.  Fifteen are emitted from this slice's
  Deno, mounted-shell-test, and team-route-test files; six are from pre-existing
  configuration/runtime files. This is the same total recorded at `ba802fc`;
  it includes the existing root-config `.ts`-extension diagnostic for the Edge
  file while native Deno checking is green.
- The test/build runs emit non-failing Node `DEP0205`, Vinext
  middleware-to-proxy, route-classification, and occasional Vite HMR-port
  notices.

## Browser QA ruling

Browser QA is partially evidenced but remains incomplete and unchecked.

- The login page passed direct IAB visual checks at desktop 1440x900 and mobile
  390x844. It used the approved black/white/red palette with no neon or
  horizontal overflow. Native empty-submit validation and a bounded
  fake-invalid-credential error behaved correctly, with zero console errors or
  warnings. No real credentials were typed.
- In the IAB's stale authenticated session, `/`,
  `/account/change-password`, `/setup/team`, and `/teams/demo/overview`
  returned HTTP 500 because the configured remote project lacks the pending
  RLS and foundation migrations. This is not evidence that the protected
  foundation routes work after migration.
- Separate unauthenticated local fetches to all foundation routes returned the
  correct 307 `/login?next=...` redirects.

Do not add a compatibility shim or mark protected-route browser QA complete.
Authenticated first-login, setup, authorized custom-role destinations,
denials, shell/logout, and desktop/mobile product behavior must be rerun only
after the separately authorized remote checkpoint.

## Scoped whole-plan re-review

The final scoped review result is Spec `PASS` and Quality/Security `APPROVED`,
with no Critical or Important findings. Two Minors remain disclosed:

1. The read-only pre-apply validator would benefit from stronger
   self-classification so its multiple evidence result sets are harder to
   misinterpret; the current checkpoint still requires explicit human
   inspection and stop-on-mismatch handling.
2. Root `npx tsc --noEmit` retains the known non-gating 21 diagnostics recorded
   above.

These Minors do not broaden authorization or make the remote project ready for
DDL. Whole-plan review is complete; protected-route browser QA and remote
completion are not.

## Required remote checkpoint, in order

The current next action is only to request separate authorization for Step 1,
the read-only populated-project pre-apply validator. Do not bundle that request
with DDL, deployment, or secret authorization.

1. Obtain explicit authorization to run only the separately reviewable,
   read-only `tests/supabase-foundation-pre-apply.sql` against the populated
   project. This is evidence collection, not migration authorization.
2. Inspect every result set. Stop before DDL and explicitly remediate/review any
   migration-state mismatch, incompatible slug, auth/profile gap, permission or
   role invariant conflict, or prospective object/column conflict.
3. Only after a clean pre-apply checkpoint and separate explicit DDL
   authorization, apply `20260824183536_rls_mutation_visibility.sql` once.
4. Apply `20260825013307_pro7_foundation_permissions.sql` once, after the RLS
   correction.
5. Regenerate remote `Database` types and reconcile the checked-in provisional
   `profiles.requires_password_change` and `memberships.status/updated_at`
   metadata, including the provisional `create_team` RPC result.
6. Set only the custom Edge Function configuration `ALLOWED_ORIGINS`. The
   pinned runtime automatically injects `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
   and `SUPABASE_SERVICE_ROLE_KEY`; do not try to create or override these
   reserved names and do not require singular `SUPABASE_PUBLISHABLE_KEY`.
7. Deploy `change-temporary-password`; deployment has not occurred.
8. Before any remote validation run, design and review a separate,
   non-destructive post-apply validator for the populated project: read-only
   catalog/ACL/policy/permission-matrix checks, plus transaction-scoped,
   uniquely named fixtures only if mutations are explicitly approved.  It must
   make no global-empty-audit or fixture assumptions.
9. Run that separately approved validator, then security/performance advisors.
10. Perform the pending desktop/mobile browser QA, including finance-only and
    settings-only custom roles on desktop and mobile.

Never run `tests/supabase-foundation-live-harness.sql` against the remote
project.  It is local/disposable-only: it re-includes the apply-once foundation
migration, creates committed pre-migration fixtures, and assumes empty audit
fixtures during cleanup.

The atomic team-creation retry is deliberately narrow: it returns an existing
team only for the same authenticated owner, exact name, and exact slug. A retry
after the team name has been changed will return a duplicate conflict and
requires manual recovery rather than guessing which team the caller intended.

## Mandatory security warning

**`private.audit_events` RLS remains disabled.**  The `private` schema is not
Data API-exposed and its schema/table/sequence ACLs deny API roles, but RLS is
still off.  Do not auto-enable or surface the table: leave it for an explicit
user decision and a separately reviewed migration.

## Next plan

After the checkpoint, start the squad/account-provisioning slice: add the
team-player profile and active-membership deactivation path, build the
admin-only account-provisioning Edge workflow, and add member personal-profile
and avatar flows.  Each must have its own additive migration, RLS/grant review,
rollback verification, and explicit deployment/secrets checkpoint.
