# Supabase MVP Core Specification

## Objective

Add the first production-ready backend slice for PRO7 Team Manager without replacing the existing dashboard UI. The slice provides Supabase authentication, a multi-team data model, database-backed RBAC, row-level security, and a login boundary that can be expanded by later player, match, finance, and settings modules.

## Scope

Phase 1 includes:

- Supabase browser and server clients using only public runtime credentials.
- Email/password login, OAuth/email callback support, logout, and safe return-path handling.
- A protected dashboard entry point. The existing ChatGPT/Sites authentication helper remains separate and its reserved routes are not reused.
- Profiles, teams, memberships, invitations, roles, permissions, role-permission mappings, and team settings.
- Owner/admin/member system roles plus custom roles.
- RLS and explicit object/column grants for authenticated users; anonymous users receive no application-table access.
- Atomic team bootstrap, safe invitation acceptance, timestamps, indexes, and business audit events.
- Generated database types and focused contract/integration tests.

Phase 1 does not include:

- Migrating the dashboard's mock player/match/finance data.
- Sending invitation emails or exposing invitation creation directly to browsers.
- Ownership transfer, password reset, signup UI, social-provider buttons, or user administration UI.
- A team switcher or settings editor.
- Deployment or changes to Sites/Cloudflare environment variables.

## Runtime and repository boundaries

- The application is Vinext 1.0 beta on the Cloudflare Worker runtime.
- Supabase packages are pinned to `@supabase/supabase-js@2.112.4` and `@supabase/ssr@0.12.5`.
- Public runtime variables are `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. No service-role key is stored in the repository or sent to the browser.
- `app/chatgpt-auth.ts` is an independent Sites feature. Supabase uses `/login` and `/auth/callback`, never `/signin-with-chatgpt`, `/signout-with-chatgpt`, or `/callback`.
- Environment parsing is centralized and fails with actionable errors.
- Server identity checks call `supabase.auth.getUser()` rather than trusting an unverified session payload.

## Data model

### Public Data API tables

1. `profiles`: presentation data keyed by `auth.users.id`; no email or authorization metadata.
2. `teams`: tenant root with immutable client-side `owner_user_id`, unique normalized slug, and timestamps.
3. `roles`: team-scoped system/custom roles; `(id, team_id)` is unique for composite foreign keys.
4. `permissions`: global permission catalog.
5. `role_permissions`: role-to-permission join table.
6. `memberships`: accepted team membership keyed by `(team_id, user_id)` with a same-team role constraint.
7. `invitations`: pending/accepted/revoked invitation records; only a SHA-256 token hash is stored.
8. `team_settings`: one bounded JSON object per team.

### Private objects

- `private.audit_events` stores append-only business audit rows and is not exposed through the Data API.
- Security-definer authorization helpers live in `private`, use an empty search path, fully qualify object names, derive the caller from `auth.uid()`, and have execution revoked from `PUBLIC`.

### Permission catalog

- `team.read`, `team.update`, `team.delete`
- `members.read`, `members.invite`, `members.manage`
- `roles.read`, `roles.manage`
- `settings.read`, `settings.update`

System role mappings:

- `owner`: all permissions.
- `admin`: all permissions except `team.delete`.
- `member`: `team.read`, `members.read`, `roles.read`, `settings.read`.

## Database behavior

- Creating an `auth.users` row creates one minimal profile. User metadata can populate bounded presentation fields but never authorization fields.
- Creating a team atomically creates owner/admin/member roles, their mappings, the owner membership, and default team settings.
- The team owner membership and all system roles are immutable through client operations.
- Role assignment is constrained to a role belonging to the same team.
- Invitation creation is reserved for a trusted server/Edge Function. Browsers can only list permitted invitation metadata; `token_hash` is excluded by column privileges.
- `public.accept_team_invitation(text)` validates authentication, confirmed email, normalized email equality, pending status, expiry, and single-use semantics under row lock. Failure modes return one generic error.
- Auditing covers teams, memberships, roles, role permissions, invitations, and team settings. Invitation token hashes are stripped from audit JSON.
- Team ownership deletion is restricted until teams are transferred or deleted.

## Authorization rules

- All eight public tables have RLS enabled and use separate command policies.
- Profiles: users can read their own profile and profiles sharing a team when they have `members.read`; they can update only their own display fields.
- Teams: permission-gated read/update/delete; authenticated users may create a team owned by themselves.
- Memberships: a user may see their own row; `members.read` sees the team roster; `members.manage` changes/removes non-owner members.
- Roles and role permissions: `roles.read` can view; `roles.manage` can mutate custom roles only.
- Permissions: authenticated read-only catalog.
- Invitations: `members.invite` can view safe columns only; no direct browser mutations.
- Team settings: `settings.read` can read and `settings.update` can update.
- `anon` has no table or RPC privileges. Default privileges in `public` are revoked before application objects are created.
- `service_role` receives explicit application-table privileges for trusted backend work and is still never used in client code.

## UI behavior

- `/login` offers email/password sign-in in the established black/white/red visual language, with loading and Vietnamese error states.
- `next`/return paths must be local relative paths, must not start with `//`, and must not target reserved authentication routes.
- `/auth/callback` exchanges a Supabase code for a session and safely redirects.
- `/` requires a verified Supabase user and redirects unauthenticated visitors to `/login?next=%2F`.
- A compact authenticated control provides logout while preserving the existing dashboard composition.

## Verification and acceptance

The implementation is accepted when:

1. Existing render tests and the production build pass.
2. Focused unit tests cover environment parsing and safe return paths.
3. Source contract tests prove auth routes, protected home behavior, and required SQL security clauses.
4. The migration applies once to project `pficsujapinkmqsyvcfw` and creates the expected objects.
5. Transactional database probes validate owner bootstrap, tenant isolation, member/admin/owner capabilities, cross-team role rejection, invitation secrecy/single-use behavior, immutable system roles/owner membership, and audit redaction.
6. Supabase security and performance advisors are re-run and any Phase 1 finding is resolved or documented.
7. Generated TypeScript database types are committed.

## Known baseline limitations

- `npm run lint` has eight pre-existing accessibility findings in `app/pro7-app.tsx`.
- Direct `tsc --noEmit` has pre-existing Cloudflare Worker global/module type failures.
- These baseline failures are not silently treated as Phase 1 regressions; focused tests and the production build remain mandatory.
