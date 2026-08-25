# PRO7 foundation slice — local handoff checkpoint

## Scope and state

This handoff records local-only evidence for the PRO7 foundation routing and
RBAC slice.  No Supabase remote DDL, Edge deployment, secret change, type
generation, advisor run, or browser QA was performed.  The remote project is
therefore **not** foundation-complete.

The linked worktree is `feature/supabase-mvp-core`; the local Task 6 gate began
at `c769baa` with an empty tracked `git status --short`.

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

## Migration inventory and order

Do not amend or rerun the already-applied core migration.  The latter two files
remain local-only pending explicit remote authorization.

| Order | Migration | SHA-256 | Remote state |
| --- | --- | --- | --- |
| 1 | `20260824170300_supabase_mvp_core.sql` | `b0c13b47538e07c02666672fc9e83b13a49167c0590deed782bb50596e7cf363` | Applied once; do not reapply/amend |
| 2 | `20260824183536_rls_mutation_visibility.sql` | `2c2b1ca30529b1ddc0d0dc66a899384d118ec763ef94f7222ba669b39fbe605b` | Pending remote authorization |
| 3 | `20260825013307_pro7_foundation_permissions.sql` | `2e0c112cc4b06e13c6fd43ec258221d82aee05018387381cf22ca14bc5cceb32` | Pending remote authorization |

## Fresh local evidence

All commands below were rerun for this handoff.  `git diff --check` completed
with no output before documentation changes.

| Gate | Result |
| --- | --- |
| `npm run test:unit` | Exit 0: 134 passed, 0 failed |
| `npm test` | Exit 0: production build completed; 6 rendered/source tests passed |
| All three static SQL contracts | Exit 0: 18 passed, 0 failed |
| `deno check --config supabase/functions/change-temporary-password/deno.json supabase/functions/change-temporary-password/index.ts` | Exit 0 |
| Focused ESLint over Task 1–5 application/library/test files | Exit 0, no diagnostics |
| `npm ci --ignore-scripts --dry-run` | Exit 0 |
| `git diff --check` | Exit 0, no output |

A disposable PostgreSQL 17.10 cluster, with only local Supabase role/auth
stubs, applied the three migrations in the inventory order.  The core verifier
reported `ok`, explicit `ROLLBACK`, 98 assertions, and 17 coverage groups.  The
foundation verifier reported `ok`, explicit `ROLLBACK`, 35 assertions, and 12
coverage groups.  Its committed-fixture cleanup reported exactly:

```text
fixture_auth_users=0 fixture_profiles=0 fixture_teams=0 fixture_roles=0
fixture_memberships=0 fixture_audit_events=0 fixture_permissions=21
```

This was local disposable-database evidence only; no SQL reached Supabase.

## Known baseline findings — not green gates

- Full repository ESLint is not a passing gate.  Excluding test-generated
  `work/` bundles, it reports 8 errors and 1 warning: seven existing
  accessibility errors plus one image warning in `app/pro7-app.tsx`, and the
  previously accepted Edge-specific unused `ImportMeta` diagnostic.  The
  unscoped `npm run lint` also traverses generated `work/` test bundles and
  consequently reports 480 errors and 1 warning; that result is not a source
  regression signal.
- `npx tsc --noEmit` reproduces 21 known, non-gating root TypeScript
  configuration/boundary diagnostics.  Fifteen are emitted from this slice's
  Deno, mounted-shell-test, and team-route-test files; six are from pre-existing
  configuration/runtime files.  This root check is not green and must not be
  described as entirely pre-existing.  Native Deno checking and focused/scoped
  checks remain green as recorded above.
- The test/build runs emit non-failing Node `DEP0205`, Vinext
  middleware-to-proxy, route-classification, and occasional Vite HMR-port
  notices.

## Browser QA ruling

Browser QA is pending.  The controller ruling is that localhost uses the
remote project, which does not yet have the pending RLS or foundation
migrations; exercising the new profile/status-dependent routes would not test
this slice.  Do not add a compatibility shim or claim browser runtime behavior
until the approved remote migration/deployment checkpoint is complete.

## Required remote checkpoint, in order

1. Obtain explicit authorization; review and apply
   `20260824183536_rls_mutation_visibility.sql` once.
2. Apply `20260825013307_pro7_foundation_permissions.sql` once, after the RLS
   correction.
3. Regenerate remote `Database` types and reconcile the checked-in provisional
   `profiles.requires_password_change` and `memberships.status/updated_at`
   metadata.
4. Set Edge Function secrets by name only: `SUPABASE_URL`,
   `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and
   `ALLOWED_ORIGINS`.  No values are recorded here.
5. Deploy `change-temporary-password`; deployment has not occurred.
6. Before any remote validation run, design and review a separate,
   non-destructive post-apply validator for the populated project: read-only
   catalog/ACL/policy/permission-matrix checks, plus transaction-scoped,
   uniquely named fixtures only if mutations are explicitly approved.  It must
   make no global-empty-audit or fixture assumptions.
7. Run that separately approved validator, then security/performance advisors.
8. Perform the pending desktop/mobile browser QA.

Never run `tests/supabase-foundation-live-harness.sql` against the remote
project.  It is local/disposable-only: it re-includes the apply-once foundation
migration, creates committed pre-migration fixtures, and assumes empty audit
fixtures during cleanup.

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
