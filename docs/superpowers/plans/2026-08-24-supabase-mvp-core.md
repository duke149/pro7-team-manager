# Supabase MVP Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a secure Supabase foundation for PRO7 with login, profiles, multi-team RBAC, RLS, invitations, settings, and generated database types while preserving the existing dashboard.

**Architecture:** Vinext uses `@supabase/ssr` factories at a narrow client/server boundary. PostgreSQL is the authorization source of truth: public Data API tables use RLS and column grants, while trusted helpers and audit records live in an unexposed `private` schema. A single reviewed migration is applied to the empty Supabase project, then verified with transactional probes and advisors.

**Tech Stack:** Vinext 1.0 beta, React 19, TypeScript 5.9, Supabase JS 2.112.4, Supabase SSR 0.12.5, PostgreSQL 17, Node test runner + tsx.

**Spec:** `docs/superpowers/specs/2026-08-24-supabase-mvp-core.md`

## Global Constraints

- Work only in branch `feature/supabase-mvp-core` and its dedicated worktree.
- Never add a service-role key, raw invitation token, or user authorization field to client code/logs/tests.
- Keep `app/chatgpt-auth.ts` and its reserved paths independent.
- Use tests first for every behavior change. Preserve the known baseline lint/typecheck findings and report them separately.
- Apply the schema to remote project `pficsujapinkmqsyvcfw` only after local review; use one migration operation, then re-run advisors.
- Do not deploy the app or change production hosting variables in this plan.

---

## Task 1: Supabase runtime foundation

**Files:**

- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `.env.example`
- Create: `lib/supabase/env.ts`
- Create: `lib/supabase/client.ts`
- Create: `lib/supabase/server.ts`
- Create: `tests/supabase-env.test.ts`

**Interfaces:**

- `parseSupabasePublicEnv(source): { url: string; publishableKey: string }`
- `createBrowserSupabaseClient()` returns a typed singleton-compatible browser client.
- `createServerSupabaseClient()` returns a cookie-backed server client and tolerates immutable Server Component cookies.

**Checklist:**

- [x] Add a direct `tsx` dev dependency and a `test:unit` script using `node --import tsx --test`.
- [x] Write failing tests for missing URL, malformed URL, missing key, and valid values.
- [x] Run `npm run test:unit -- tests/supabase-env.test.ts`; expect failure because the parser is absent.
- [x] Implement the strict parser and safe `.env.example`.
- [x] Pin `@supabase/supabase-js` to `2.112.4` and `@supabase/ssr` to `0.12.5` exactly.
- [x] Implement browser/server factories with no service-role path and no raw environment access in UI modules.
- [x] Run the focused unit test; expect all cases to pass.
- [x] Run `npm run build` with public test credentials; expect a successful Vinext build.
- [x] Commit as `feat: add Supabase runtime foundation`.

---

## Task 2: Database schema, RBAC, and RLS migration

**Files:**

- Create: `supabase/migrations/20260824000000_supabase_mvp_core.sql`
- Create: `tests/supabase-schema.test.mjs`

**Interfaces:**

- Public tables: `profiles`, `teams`, `roles`, `permissions`, `role_permissions`, `memberships`, `invitations`, `team_settings`.
- Private table: `private.audit_events`.
- Public RPC: `accept_team_invitation(token text) returns uuid`.
- Private functions/triggers named in the specification and reviewed design.

**Checklist:**

- [x] Write a failing SQL contract test that checks all tables, constraints, indexes, RLS enables, policy names, default ACL revocations, explicit grants, helper hardening, trigger names, invitation hash redaction, and seeded permissions.
- [x] Run `node --test tests/supabase-schema.test.mjs`; expect failure because the migration is absent.
- [x] Create one idempotency-safe-for-history migration: revoke broad defaults before object creation, create `private`, tables, constraints, indexes, functions, triggers, seeds, RLS, policies, and explicit grants.
- [x] Use `security definer set search_path = ''`, fully qualified identifiers, `(select auth.uid())`, and revoked `PUBLIC` execution for every trusted helper.
- [x] Ensure client grants cannot write ownership, system flags, timestamps, invitation tokens/status, or audit rows.
- [x] Ensure `service_role` receives only explicit application-object privileges.
- [x] Run the SQL contract test; expect all clauses to pass.
- [x] Perform a manual security review against the specification before any remote DDL.
- [x] Commit as `feat: add secure team RBAC schema`.

---

## Task 3: Auth helpers, callback, protected dashboard, and login UI

**Files:**

- Create: `lib/supabase/auth.ts`
- Create: `app/login/page.tsx`
- Create: `app/login/login-form.tsx`
- Create: `app/auth/callback/route.ts`
- Modify: `app/page.tsx`
- Modify: `app/pro7-app.tsx`
- Modify: `app/globals.css`
- Create: `tests/supabase-auth.test.ts`
- Modify: `tests/rendered-html.test.mjs`

**Interfaces:**

- `safeRelativeReturnPath(value, fallback?)` rejects absolute/protocol-relative/reserved auth paths.
- `getCurrentUser()` verifies identity with `auth.getUser()`.
- `requireCurrentUser(returnTo)` redirects unauthenticated visitors to `/login`.
- `/auth/callback?code=...&next=...` exchanges the code and redirects safely.

**Checklist:**

- [x] Write failing unit tests for safe/unsafe return paths and reserved Sites/Supabase auth routes.
- [x] Add failing source/render contracts for `/login`, `/auth/callback`, protected `/`, `getUser()`, and logout.
- [x] Run focused tests; expect failures because auth modules/routes are absent.
- [x] Implement auth helpers and callback without mixing ChatGPT Auth.
- [x] Build the black/white/red login form with email/password, disabled/loading behavior, Vietnamese error handling, and safe redirect.
- [x] Require a verified Supabase user at `/`; add a compact logout control without restructuring the dashboard.
- [x] Run focused tests and `npm test`; expect all existing and new tests to pass.
- [x] Run `npm run build` with public test credentials; expect success.
- [x] Commit as `feat: add Supabase login boundary`.

---

## Task 4: Apply migration and verify the live Supabase project

**Files:**

- Create: `tests/supabase-live-verification.sql`
- Create: `lib/supabase/database.types.ts`
- Modify: `lib/supabase/client.ts`
- Modify: `lib/supabase/server.ts`

**Interfaces:**

- Remote project: `pficsujapinkmqsyvcfw` (`FC Duke`).
- Database clients are parameterized with generated `Database` types.

**Checklist:**

- [x] Confirm the remote public schema and migration history are still empty immediately before apply.
- [x] Create a transactional verification script covering profile bootstrap, team bootstrap, tenant isolation, owner/admin/member permissions, immutable owner/system roles, cross-team role rejection, invitation token secrecy/single use, audit redaction, and privilege/default-ACL inspection.
- [x] Apply the reviewed migration exactly once through the Supabase migration capability.
- [x] Execute verification probes transactionally; roll back fixtures and record each assertion result.
- [x] Generate current TypeScript database types from the project and commit them.
- [x] Parameterize browser/server clients with `Database`.
- [x] Re-run Supabase security and performance advisors; resolve every Phase 1 finding or document why it is non-actionable.
- [x] Run `npm run test:unit`, `npm test`, the SQL contract test, and `npm run build`; expect success.
- [x] Commit as `feat: verify Supabase MVP core`.

---

## Task 5: Final review and handoff

**Files:**

- Modify: `docs/superpowers/plans/2026-08-24-supabase-mvp-core.md`
- Create: `docs/supabase-mvp-handoff.md`

**Checklist:**

- [ ] Request a fresh code/security review of the full branch diff.
- [ ] Fix all critical/important findings with focused regression tests.
- [x] Run the complete verification set from a clean tracked worktree state and capture evidence, including the empty pre-gate `git status --short` result.
- [x] Document schema objects, permission matrix, local environment setup, remote migration name, advisor status, known baseline lint/typecheck issues, and safe next modules.
- [x] Mark all plan checkboxes accurately; do not mark unverified steps complete.
- [x] Commit as `docs: add Supabase MVP handoff`.
- [ ] Use `superpowers:finishing-a-development-branch` to present merge/integration options.
