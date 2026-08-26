# PRO7 Design Audit and RSVP Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan.

**Goal:** Fix the accepted Checklist Design audit, complete Admin Settings/auth/notification surfaces, and prove the real Admin-to-player RSVP flow with four temporary Supabase accounts.

**Architecture:** Preserve the existing PRO7 route shell and backend authority. Add narrowly scoped client components and server query/action modules, use existing RLS/RPCs wherever possible, and add one audited forward-only migration for private audit-log access. Use real Supabase data only after local contracts are green.

**Tech Stack:** Next.js/Vinext, React 19, TypeScript, Supabase Auth/Postgres/RLS/Edge Functions, Node test runner, Vite mounted-component fixtures, PostgreSQL 17 disposable verification.

**Spec:** `docs/superpowers/specs/2026-08-26-pro7-design-audit-and-rsvp-demo-design.md`

## Global constraints

- Keep existing PRO7 layout/class geometry and black/white/red visual identity.
- Do not hardcode player/match data in production UI.
- Use `apply_patch` for source edits and Supabase CLI for migration creation.
- Observe RED before production implementation for every task.
- Do not stage or edit `supabase/.temp/`.
- Apply remote DDL/data only after pre-apply checks pass; run post-apply checks and advisors.
- Never test the destructive team-delete confirmation.

### Task 1: Responsive, tokens, typography, and shared interaction contracts

**Files:**
- Modify: `app/globals.css`
- Modify: `app/components/pro7-route-shell.tsx`
- Modify: `app/teams/[slug]/squad/squad-view.tsx`
- Create: `app/components/accessible-modal.tsx`
- Test: `tests/design-system-contract.test.ts`
- Test: `tests/pro7-route-shell-mounted.test.ts`
- Test: `tests/squad-pages.test.ts`

1. Add failing tests for the 900px shell breakpoint, semantic red tokens/no neon residue, readable semantic type sizes, reduced motion, and shared modal keyboard behavior.
2. Add the primitive → semantic → component token layer and replace the misleading `--lime` references.
3. Add final scoped CSS overrides for tablet/mobile shell, meaningful text minimums, touch targets, and reduced motion.
4. Extract accessible modal behavior and adopt it in the Add player modal without changing visual markup/order.
5. Run focused mounted/rendered checks and visually inspect 1440px, 900px, 768px, 390px in both themes.

### Task 2: Login show password and Supabase password recovery

**Files:**
- Modify: `app/login/login-form.tsx`
- Create: `app/account/forgot-password/page.tsx`
- Create: `app/account/forgot-password/forgot-password-form.tsx`
- Create: `app/account/reset-password/page.tsx`
- Create: `app/account/reset-password/reset-password-form.tsx`
- Modify: `app/auth/callback/route.ts`
- Create: `lib/account/password-recovery.ts`
- Test: `tests/login-form-mounted.test.ts`
- Test: `tests/password-recovery.test.ts`
- Test: `tests/password-recovery-pages.test.ts`

1. Read current official Supabase password-reset/callback documentation.
2. Add RED tests for accessible password visibility, safe relative recovery redirects, same-origin callback handling, matching strong passwords, success/error states, and no account enumeration.
3. Implement show/hide control and reset-email form using `resetPasswordForEmail`.
4. Extend callback allow-list for recovery and implement reset form using `updateUser`.
5. Verify login/recovery UI responsively without sending a real reset email during smoke tests.

### Task 3: Notification query, self-only mutation, and header center

**Files:**
- Create: `lib/notifications/model.ts`
- Create: `lib/notifications/queries.ts`
- Create: `lib/notifications/actions.ts`
- Create: `app/api/notifications/[notificationId]/route.ts`
- Create: `app/components/notification-center.tsx`
- Modify: `app/components/pro7-route-header.tsx`
- Modify: `app/components/pro7-route-shell.tsx`
- Modify: `app/teams/[slug]/layout.tsx`
- Test: `tests/notification-queries.test.ts`
- Test: `tests/notification-actions.test.ts`
- Test: `tests/notification-center-mounted.test.ts`
- Test: `tests/team-layout.test.ts`

1. Add RED tests for strict row parsing, bounded newest-first reads, target-path confinement, unread count, self-only mark-read boundary, dropdown keyboard behavior, and authoritative refresh.
2. Implement server-only notification query and mutation contracts using the authenticated Supabase client and existing RLS.
3. Load team-scoped notifications in the route layout and render the bell dropdown with badge, empty state, mark-read, and deep links.
4. Run focused tests and verify Admin/member notification isolation in browser.

### Task 4: Admin Settings schema and secure audit-log RPC

**Files:**
- Created via CLI and reconciled to remote version: `supabase/migrations/20260826121407_pro7_admin_settings_audit.sql`
- Modify: `lib/supabase/database.types.ts`
- Create: `lib/settings/model.ts`
- Create: `lib/settings/validation.ts`
- Create: `lib/settings/queries.ts`
- Create: `lib/settings/actions.ts`
- Create: `tests/supabase-admin-settings-schema.test.mjs`
- Create: `tests/supabase-admin-settings-live.sql`
- Create: `tests/supabase-admin-settings-live.test.mjs`
- Create: `tests/settings-queries.test.ts`
- Create: `tests/settings-actions.test.ts`

1. Inspect Supabase CLI help and create the migration through the pinned CLI.
2. Add static RED contracts requiring `private.audit_events` RLS, zero direct client grants, a bounded redacted `get_team_audit_events` RPC, fixed search path, permission checks, and exact execute grants.
3. Implement the migration and update provisional generated types.
4. Add RED/GREEN server contracts for team settings, roles/permissions, roster summaries, audit rows, team update, settings update, and team delete confirmation.
5. Apply all migrations to disposable PostgreSQL, exercise Owner/Admin/Member/unrelated cases, and prove rollback cleanup.
6. Run read-only remote pre-apply checks; apply the migration once; re-generate remote types and run Supabase security/performance advisors.

### Task 5: Complete Admin Settings UI

**Files:**
- Replace: `app/teams/[slug]/admin/settings/page.tsx`
- Create: `app/teams/[slug]/admin/settings/settings-view.tsx`
- Create: `app/api/teams/[slug]/settings/route.ts`
- Create: `app/api/teams/[slug]/route.ts`
- Create: `app/teams/[slug]/admin/settings/loading.tsx`
- Create: `app/teams/[slug]/admin/settings/error.tsx`
- Modify: `app/globals.css`
- Test: `tests/settings-pages.test.ts`
- Test: `tests/settings-mounted.test.ts`

1. Add RED tests for server permission gates and all five Settings modules.
2. Implement data-driven team profile, members/roles overview, notification preferences, redacted audit log, and typed-confirmation danger zone.
3. Add dirty state, blur validation, loading/success/error feedback, and keep destructive confirmation inert unless fully typed.
4. Verify Owner/Admin/Member route behavior in rendered and mounted tests; never submit delete in live QA.

### Task 6: Match invitation/admin-response UX completion

**Files:**
- Modify: `lib/overview/actions.ts`
- Modify: `app/teams/[slug]/matches/[matchId]/match-detail.tsx`
- Modify: `tests/overview-actions.test.ts`
- Modify: `tests/matches-mounted.test.ts`
- Modify: `tests/matches-pages.test.ts`

1. Add RED test that reminders use the current two-argument RPC and never pre-read or pass recipient IDs.
2. Add RED mounted tests for response labels/counts and Admin acknowledgement after refresh.
3. Fix reminder caller compatibility and refine the existing attendance panel without changing its visual hierarchy.
4. Verify match edit/invite/respond flows with unit and mounted tests.

### Task 7: Provision four players and prepare the real fc nat scenario

**Remote operations:** Existing Supabase Edge Function and match RPCs only.

1. Confirm local build/tests and read-only remote preconditions: one Owner, Member role, `fc nat` match, no email collisions.
2. Through the authenticated Admin UI, provision Tuấn Đạt, Đức Lee, Phi Hùng, and Trung Hiếu with the approved demo emails/positions/shirts; capture one-time credentials outside tracked files.
3. Confirm four Auth users, profiles, active memberships, Member roles, and player profiles using read-only queries.
4. Through the Admin match UI, extend the RSVP deadline and invite all four players in one action.
5. Confirm four match attendance rows and four invitation notifications using read-only queries.

### Task 8: End-to-end localhost browser audit as Admin and Member

**Browser:** `http://localhost:3000`

1. Admin: verify Overview, Squad, Match, Tactics, Funds, Settings, notification center, light/dark, and 1440/900/768/390 layouts.
2. Log out and sign in as Tuấn Đạt; complete mandatory temporary-password change.
3. Member: verify notification badge/list, deep-link to `fc nat`, submit Có, self profile edit permissions, and denied Funds/Admin/management surfaces.
4. Log back in as Admin and verify Tuấn Đạt is Có mặt while three players remain Đang chờ.
5. Record screenshots and an explicit route/function matrix; do not inspect cookies or browser-stored secrets.

### Task 9: Full verification and re-audit

1. Run all focused tests, `npm run test:unit`, `npm test`, scoped ESLint/type checks, SQL contracts/live verifier, and `git diff --check`.
2. Repeat the Checklist Design audit and update `docs/audits/2026-08-26-pro7-checklist-design-audit.md` with fixed/deferred evidence.
3. Verify remote migration inventory, Auth/member/attendance/notification state, and Supabase advisors.
4. Review the complete diff, confirm `supabase/.temp/` is untouched, and use `superpowers:finishing-a-development-branch` for handoff.
