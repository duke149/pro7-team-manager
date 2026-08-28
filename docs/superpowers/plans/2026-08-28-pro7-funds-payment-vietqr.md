# PRO7 Funds Payment Settings and VietQR Plan

> **Execution:** Follow `superpowers:executing-plans` task by task. Use strict TDD for every production behavior. Do not mutate remote Supabase in this plan.

**Goal:** Remove the hard-coded VietQR account and connect Funds to an Admin-owned, concurrency-safe payment configuration without changing the established PRO7 hierarchy.

**Architecture:** `team_settings.settings` remains the bounded JSON document, with independently validated `notifications` and `payments` sections. One narrow authenticated RPC locks the team-settings row, verifies `settings.update`, rejects a stale `updated_at` token, validates the requested section, and merges only that section. Admin Settings reads and edits the payment section. Funds reads the same configuration server-side after `finance.read` authorization and derives a VietQR URL only from a selected pending due.

**Tech stack:** TypeScript, React/Vinext server routes, Supabase/Postgres RPC, Node test runner, mounted/render tests, localhost browser QA.

---

## Task 1: Lock settings and VietQR contracts

**Files:**

- Modify: `lib/settings/model.ts`
- Modify: `tests/settings-validation.test.ts`
- Modify: `tests/settings-queries.test.ts`
- Create: `tests/funds-payment-settings.test.ts`

1. Write failing tests for exact bounded payment payloads, ISO concurrency tokens, and immutable parsed payment settings.
2. Require settings reads to include and strictly parse `updated_at`; absent `payments` is a valid unconfigured state, malformed `payments` fails closed.
3. Write failing tests for server-only Funds payment reads and deterministic VietQR URLs derived from pending dues.
4. Reject incomplete settings, invalid bank/account identifiers, unsafe amounts, oversized descriptions, and browser-runtime imports.
5. Run focused tests and capture RED before production implementation.

## Task 2: Add the atomic section-update RPC

**Files:**

- Create via pinned CLI: `supabase/migrations/*_update_team_settings_section.sql`
- Modify: `lib/supabase/database.types.ts`
- Create: `tests/supabase-team-settings-section.test.mjs`
- Modify: `tests/settings-actions.test.ts`
- Modify: `lib/settings/validation.ts`
- Modify: `lib/settings/actions.ts`

1. Create the migration through `supabase migration new`; never invent the timestamp.
2. Implement a short `SECURITY DEFINER` RPC with fixed `search_path`, direct `auth.uid()` and `settings.update` authorization, one row lock, exact stale-token comparison, strict section validation, JSON merge, and an `updated_at` return value.
3. Revoke default execution from `PUBLIC`, `anon`, and `service_role`; grant only `authenticated`.
4. Route both notification and payment saves through the same RPC so either save preserves the other section and future keys.
5. Test allow/deny, stale writes, malformed JSON, exact grants, and merge preservation on disposable PostgreSQL; update the typed RPC contract.

## Task 3: Add the Admin payment module

**Files:**

- Modify: `app/teams/[slug]/admin/settings/settings-view.tsx`
- Modify: `app/globals.css`
- Modify: `tests/settings-pages.test.ts`
- Create or modify mounted Settings tests

1. Add a sixth Admin Settings module for bank identifier/code, account number, account holder, and optional transfer prefix.
2. Keep the established settings card, typography, black/white/red palette, responsive stacking, focus styles, and permission omission.
3. Save with the current `updatedAt` token, adopt the authoritative returned token, and present stale/conflict errors without pretending success.
4. Ensure the notification form also sends/adopts the same token.

## Task 4: Replace hard-coded VietQR with real data

**Files:**

- Create: `lib/funds/payment-settings.ts`
- Modify: `app/teams/[slug]/funds/page.tsx`
- Modify: `app/teams/[slug]/funds/funds-view.tsx`
- Modify: `app/globals.css`
- Modify: `tests/funds-pages.test.ts`
- Modify: `tests/funds-mounted.test.ts`

1. Load payment settings only after the existing `finance.read` route guard and fail the page closed on malformed/upstream data.
2. Remove all hard-coded bank data, account data, amount, account holder, and JavaScript alerts.
3. When configuration is absent, show an honest “Chưa cấu hình tài khoản nhận quỹ” state with an Admin Settings link.
4. When configuration is complete, require selection of a pending due, generate the QR amount and deterministic bounded transfer content from that due, expose copy feedback, and preserve the existing modal accessibility boundary.
5. Do not mutate a due merely by showing or scanning the QR.

## Task 5: Verify, inspect locally, review, and checkpoint

1. Run focused settings/funds/schema tests, the full unit suite, `npm test`, scoped ESLint, changed-module TypeScript diagnostics, server-only import checks, and `git diff --check`.
2. Reload localhost:3000 as the authenticated Admin at 1440px and 390px; inspect Admin Settings and Funds for alignment, modal focus, missing-config truthfulness, no hard-coded account, and no horizontal overflow.
3. Verify Member cannot resolve Funds or Admin Settings and receives no payment configuration through server/render tests.
4. Perform a fresh scoped self-review and fix Critical/Important findings through RED/GREEN.
5. Commit the slice and record that the new migration was not applied remotely.

## Acceptance criteria

- No hard-coded bank account, holder, amount, or transfer content remains in the Funds UI.
- Payment and notification saves preserve each other and future settings keys.
- Stale Admin saves fail safely instead of overwriting another Admin's update.
- A QR is generated only from complete validated configuration and one real pending due.
- Members cannot access Funds, Admin Settings, or bank configuration.
- Existing Funds CRUD and PRO7 visual hierarchy remain intact.
