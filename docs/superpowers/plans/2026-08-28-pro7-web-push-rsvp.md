# PRO7 Web Push and Account-bound RSVP Implementation Plan

> **Execution:** Use `superpowers:executing-plans` task by task. Every production behavior follows strict RED → GREEN → refactor.

**Goal:** Deliver real VAPID Web Push, one shareable match RSVP link, a dedicated account-bound response screen, and immediate/manual/configurable/two-hour reminders while preserving current PRO7 UX and durable in-app notifications.

**Architecture:** Match RPCs write attendance, in-app notifications, and a private push outbox atomically. A Supabase Edge Function expands events into per-device deliveries and sends VAPID notifications; `pg_net` wakes it immediately and `pg_cron` retries/schedules milestones. A root Service Worker receives notifications and opens a generic RSVP route whose server derives the responding user from the verified session.

**Tech stack:** Vinext-compatible React 19/TypeScript, Supabase Postgres 17/Auth/Edge Functions/Cron/pg_net/Vault, Service Worker Push API, VAPID, Node test runner + tsx/happy-dom, Supabase CLI/MCP, in-app browser.

**Spec:** `docs/superpowers/specs/2026-08-28-pro7-web-push-rsvp-design.md`

## Global constraints

- Calendar/OAuth is out of scope.
- Preserve PRO7's current black/white/red visual system and route shell; no unrelated frontend redesign.
- One shared RSVP URL per match; no recipient token or user ID.
- Push failure cannot roll back attendance or durable in-app notifications.
- RLS/RPC/session checks remain authoritative; client visibility is UX only.
- No secrets in git, browser bundles, logs, fixtures, test output, or reports.
- Do not touch or stage the existing untracked `supabase/.temp/` directory.

---

### Task 1: Add subscriptions, outbox, deliveries, scheduler, and hardened RPCs

**Files:**
- Create: `supabase/migrations/<cli-version>_pro7_web_push_rsvp.sql`
- Create: `tests/supabase-web-push-schema.test.mjs`
- Create: `tests/supabase-web-push-live-harness.sql`
- Create: `tests/supabase-web-push-live-verification.sql`
- Create: `tests/supabase-web-push-pre-apply.sql`
- Create: `tests/supabase-web-push-pre-apply.test.mjs`
- Modify: `lib/supabase/database.types.ts`

- [ ] Generate the additive migration with the pinned Supabase CLI.
- [ ] Write static contract tests for exact tables, constraints, indexes, explicit grants, own-user RLS, private object ACL, hardened service functions, invitation/reminder signature compatibility, local RSVP paths, and Cron/wake artifacts.
- [ ] Run the focused test and capture the expected RED against the empty migration.
- [ ] Implement the minimal SQL schema/functions/triggers with fixed `search_path`, exact ACLs, bounded payloads, deterministic event keys, and same-transaction outbox insertion.
- [ ] Write and run a PostgreSQL 17 verifier covering Owner/Admin/Member/unrelated roles, subscription ownership, invite/outbox atomicity, manual reminder revisions, configured/fixed-two-hour pending-only scheduling, equality de-duplication, service-only claim/settle, transient retry, expired endpoint deletion, and rollback-zero fixtures.
- [ ] Add a read-only pre-apply artifact that rejects migration drift and incompatible existing functions/settings.
- [ ] Update provisional database types, run focused/full verification, and commit `feat: add PRO7 web push schema`.

### Task 2: Build the VAPID Edge Function delivery worker

**Files:**
- Create: `supabase/functions/send-web-push/index.ts`
- Create: `supabase/functions/send-web-push/deno.json`
- Create: `supabase/functions/send-web-push/deno.lock`
- Create: `supabase/functions/send-web-push/README.md`
- Create: `tests/send-web-push-edge.test.mjs`

- [ ] Write RED tests for method/internal-secret checks, missing environment, bounded batch requests, claim results, per-device delivery, expired subscription deletion, retryable/permanent classification, partial-device success, and redacted responses/logging.
- [ ] Implement the minimal pinned Web Push sender and service-client boundary.
- [ ] Verify tests plus native Deno type-check; mutate provider statuses to prove each branch is protected.
- [ ] Commit `feat: add VAPID push delivery worker`.

### Task 3: Add browser subscription API, Service Worker, manifest, and permission UX

**Files:**
- Create: `lib/push/model.ts`
- Create: `lib/push/validation.ts`
- Create: `lib/push/actions.ts`
- Create: `app/api/push/subscriptions/route.ts`
- Create: `app/components/push-permission-gate.tsx`
- Create: `app/manifest.ts`
- Create: `public/pro7-sw.js`
- Modify: `app/components/pro7-route-shell.tsx`
- Modify: `app/teams/[slug]/admin/settings/settings-view.tsx`
- Modify: `app/globals.css`
- Create: `tests/push-validation.test.ts`
- Create: `tests/push-actions.test.ts`
- Create: `tests/push-permission-mounted.test.ts`
- Create: `tests/service-worker-push.test.mjs`

- [ ] Write RED tests for exact/size-bounded subscription payloads, own-user binding, same-origin JSON, upsert/delete semantics, unsupported/default/granted/denied states, explicit-click permission, iOS standalone guidance, dismissal persistence, worker payload validation, and same-origin notification click behavior.
- [ ] Implement server contracts, permission state machine, root worker, and manifest without prompting on page load.
- [ ] Update Admin notification copy to describe browser push, configurable reminder, and the fixed two-hour reminder.
- [ ] Run mounted desktop/mobile/light/dark tests and focused/full verification.
- [ ] Commit `feat: add browser push subscriptions`.

### Task 4: Add one shared match link and dedicated account-bound RSVP route

**Files:**
- Create: `lib/matches/share.ts`
- Create: `app/components/match-share-button.tsx`
- Create: `app/teams/[slug]/matches/[matchId]/rsvp/page.tsx`
- Create: `app/teams/[slug]/matches/[matchId]/rsvp/rsvp-view.tsx`
- Create: `app/teams/[slug]/matches/[matchId]/rsvp/loading.tsx`
- Create: `app/teams/[slug]/matches/[matchId]/rsvp/error.tsx`
- Modify: `app/teams/[slug]/matches/matches-view.tsx`
- Modify: `app/teams/[slug]/matches/[matchId]/match-detail.tsx`
- Modify: `app/globals.css`
- Create: `tests/match-share.test.ts`
- Create: `tests/match-share-mounted.test.ts`
- Create: `tests/match-rsvp-page.test.ts`
- Create: `tests/match-rsvp-mounted.test.ts`

- [ ] Write RED tests for canonical generic URLs, Web Share payload/fallback copy, no token/user identity, login `next` preservation, non-invitee denial, inactive/wrong-team denial, live deadline closure, exact three-choice mapping, verified session binding, authoritative refresh, and redirect to detail after success.
- [ ] Implement the reusable share control and replace the current text-only clipboard action without changing the surrounding card layout.
- [ ] Implement the dedicated server route and small client RSVP island using the existing attendance RPC/API.
- [ ] Run mounted, server-render, accessibility, desktop/mobile, and full verification.
- [ ] Commit `feat: add account-bound match RSVP links`.

### Task 5: Local end-to-end verification

- [ ] Read `superpowers:verification-before-completion` and run the complete relevant test/build/lint/type/diff gate from a clean index.
- [ ] Start the app on `http://localhost:3000` and verify Admin and Member sessions in the in-app browser.
- [ ] Check permission modal, denied/unsupported guidance, subscription API, Admin invite/manual reminder, share sheet/copy fallback, login redirect, all three RSVP options, Admin attendance reconciliation, Service Worker click, responsive bottom navigation, and existing avatar/squad/match/tactics/funds/settings regressions.
- [ ] Record screenshots/evidence without hardcoding demo data or mutating unrelated production records.

### Task 6: Supabase and production rollout

- [ ] Run the read-only remote preflight, migration-list comparison, function/table/grant/RLS inventory, and project advisors.
- [ ] Generate one VAPID key pair without printing or committing the private key; expose only the public key to the app.
- [ ] Apply the reviewed migration once, set Edge/Vault secrets, deploy `send-web-push`, and install the minute Cron/immediate wake-up configuration.
- [ ] Reconcile remote-generated database types and run post-apply schema/RLS/advisor verification.
- [ ] Deploy the application through the existing production workflow.
- [ ] Use one Admin and one invited test Member to verify real subscription storage, immediate invitation push, notification click/login/RSVP, Admin response visibility, manual reminder, configured reminder scheduling, fixed two-hour de-duplication, and expired-subscription cleanup.
- [ ] Run `superpowers:finishing-a-development-branch` and present the final integration/push status with residual browser/platform limitations.
