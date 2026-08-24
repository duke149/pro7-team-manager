# Supabase MVP handoff

## Release record

- Branch/worktree: `feature/supabase-mvp-core` at `/Users/everygolflb/Documents/Codex/2026-08-24/t-i-c-n-x-y/.worktrees/supabase-mvp-core`.
- Supabase project: `pficsujapinkmqsyvcfw` (`FC Duke`).
- Applied once: remote migration `20260824170300` / `supabase_mvp_core`, sourced from `supabase/migrations/20260824000000_supabase_mvp_core.sql` (SHA-256 `b0c13b47538e07c02666672fc9e83b13a49167c0590deed782bb50596e7cf363`). Do not rename, reapply, or amend this history migration.
- No app deployment, hosting-environment change, Supabase branch/project creation, or additional/ad-hoc remote DDL was performed.

## Architecture and database surface

Vinext uses only public Supabase credentials behind typed browser/server factories. PostgreSQL is the authorization source: Data API tables are protected by RLS plus explicit grants; trusted helpers and audit data are in an unexposed `private` schema.

| Surface | Exact inventory |
| --- | --- |
| `public` Data API tables | `profiles`, `teams`, `roles`, `permissions`, `role_permissions`, `memberships`, `invitations`, `team_settings` |
| `public` RPC | `accept_team_invitation(token text)` |
| `private` table | `audit_events` |
| `private` trusted functions | `set_updated_at`, `handle_new_user`, `is_team_member`, `has_team_permission`, `can_view_profile`, `can_manage_membership`, `role_belongs_to_team`, `can_view_role`, `can_manage_role`, `bootstrap_team`, `audit_row_change` |
| Triggers | `on_auth_user_created`, `trg_teams_bootstrap`, `trg_profiles_set_updated_at`, `trg_teams_set_updated_at`, `trg_roles_set_updated_at`, `trg_invitations_set_updated_at`, `trg_team_settings_set_updated_at`, `trg_teams_audit`, `trg_memberships_audit`, `trg_roles_audit`, `trg_role_permissions_audit`, `trg_invitations_audit`, `trg_team_settings_audit` |

All eight public tables have RLS enabled with 20 command-specific `authenticated` policies. Helpers are `SECURITY DEFINER`, have `search_path = ''`, fully qualify references, derive identity from `auth.uid()`, and begin with execution revoked from `PUBLIC`.

### Permissions and safeguards

| Role | Effective system permissions |
| --- | --- |
| Owner | All 10: `team.read`, `team.update`, `team.delete`, `members.read`, `members.invite`, `members.manage`, `roles.read`, `roles.manage`, `settings.read`, `settings.update` |
| Admin | All owner permissions except `team.delete` (9) |
| Member | `team.read`, `members.read`, `roles.read`, `settings.read` (4) |

- Team creation atomically bootstraps owner/admin/member roles, the canonical owner membership, and `{}` settings.
- Client operations cannot alter the canonical owner membership or any system role. Custom roles cannot receive `team.delete`; clients cannot assign, or accept an invitation for, the owner role. Same-team composite foreign keys reject cross-team role assignment.
- `anon` has no application-table CRUD or invitation-RPC access. `service_role` has explicit CRUD on the eight public application tables only; it has no private-schema, private-table, private-sequence, or private-helper access.
- `authenticated` access is explicit and RLS-filtered: profile updates are only `display_name`/`avatar_url`; teams only `name`/`slug`; memberships only `role_id`; roles only custom-role presentation fields; settings only `settings`; permissions are read-only; role-permission mutations remain policy-gated. Invitations expose only 11 safe metadata columns (`id`, `team_id`, `email`, `role_id`, `inviter_user_id`, `status`, `expires_at`, `accepted_at`, `accepted_by_user_id`, `created_at`, `updated_at`) and no browser mutation grant. `token_hash`, ownership, IDs, system flags, statuses, timestamps, and audit rows are not client-writable.

### Invitations and auditing

Only a trusted server/Edge Function creates invitations. The table stores a unique 32-byte SHA-256 digest, never a raw token. `accept_team_invitation` is authenticated-only and validates a confirmed, normalized matching email, pending/unexpired state, a same-team non-owner role, and single use under row lock; all failures return the same generic error. Invitation audit payloads strip `token_hash`; the raw token is never logged or selected. `private.audit_events` is append-only and inaccessible to API roles.

## Application boundaries

- Auth routes are `/login` and `/auth/callback`; `getCurrentUser()` verifies identity with `auth.getUser()`, and `/` redirects unauthenticated users to `/login?next=%2F`.
- The return-path validator is fail-closed for absolute, protocol-relative, encoded, traversal, and reserved auth paths. `app/chatgpt-auth.ts` and Sites routes (`/signin-with-chatgpt`, `/signout-with-chatgpt`, `/callback`) remain independent.
- Root `middleware.ts` owns normal SSR refresh cookies/cache headers. It excludes callback path variants; `/auth/callback` is the sole owner of code-exchange response cookies and cache headers, preventing Vinext middleware-cookie ordering from overwriting the exchanged session.
- `lib/supabase/client.ts` and `lib/supabase/server.ts` are the only typed client factories (`SupabaseClient<Database>`). Generated `lib/supabase/database.types.ts` is schema metadata; do not mistake generated fields such as `token_hash` for browser-selectable access—ACLs prohibit it.

## Local setup and verification state

1. Copy `.env.example` to the gitignored `.env.local`.
2. Set only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` from the project dashboard. Do not print, commit, or add a legacy anon, secret, or service-role key.
3. Run `npm run test:unit`, `npm test`, and `node --test tests/supabase-schema.test.mjs`. The live verifier is a rollback-only SQL script and is not a local credential smoke command.

Most recent verified counts: 29 unit tests, 4 production render/source tests, 10 schema-contract tests, and 84 live transactional assertions across 16 coverage groups. Live fixtures were rolled back; post-run fixtures were zero. Controller localhost QA on the exact build covered desktop and mobile, dark OS scheme, safe callback redirects, protected-home redirect, and an empty browser console error/warning log. Light-mode CSS was reviewed but lacks a live media-emulation screenshot.

## Advisor record

- Security WARN: [Signed-In Users Can Execute SECURITY DEFINER Function](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable) for `public.accept_team_invitation`. Intentional: it is the reviewed authenticated-only RPC, verifies caller/email/state, uses an empty search path and generic failures, and is covered by live success/denial probes.
- **MUST-SURFACE — RLS disabled:** [`private.audit_events`](https://supabase.com/docs/guides/database/postgres/row-level-security) has RLS disabled. `private` is not Data API-exposed and API schema/table/sequence ACLs are denied, but RLS remains off. No remediation DDL was auto-applied; add a reviewed migration if defense-in-depth RLS is desired.
- Performance INFO: [Unindexed foreign keys](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys) for `invitations_role_team_fkey` and `memberships_role_team_fkey`. Retained: each has a leading `role_id` index and `roles.id` is globally unique, so adding `team_id` does not improve selectivity.
- Performance INFO: [Unused Index](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index) for `invitations_inviter_user_id_idx` and `invitations_accepted_by_user_id_idx`. Retained: an empty new project has no workload; the reviewed FK/history access paths are still required.

No advisor finding required a Phase 1 correction migration.

## Deferred work and safe next modules

- Audit the `role_permissions` delete cascade: an audit row's `team_id` can become null after its parent role is deleted.
- Add behavioral logout coverage beyond the current source/render contract.
- Avoid `.insert().select()` / `RETURNING` for newly created teams or custom roles: SELECT RLS can run before the AFTER bootstrap trigger establishes visibility. Use plain insert then select, or design a reviewed bootstrap RPC.
- `npm run lint` retains eight baseline `app/pro7-app.tsx` accessibility findings; direct `tsc --noEmit` retains baseline Cloudflare Worker/factory/test type failures. Treat either as separate cleanup work, not as proof of this slice regressing.
- Safe follow-ons: team switcher/settings UI; server/Edge invitation creation and mail delivery; player, match, and finance modules with team-scoped migrations, RLS policies, explicit grants, generated-type refresh, and live rollback verification. Do not deploy or change hosting environment variables as part of these follow-ons without separate approval.
