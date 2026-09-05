# Audit remediation — 2026-09-05

Status: partial implementation verified locally; NOT production-ready.

## Implemented

- Mobile active navigation contrast and accessible names; client-side router navigation with native modifier-click behavior preserved.
- Match score rows wrap at mobile widths.
- Funds action labels readable in dark mode; legacy `Member due payment` displayed in Vietnamese and new UI payments carry member/month descriptions.
- Settings permission labels localized, role details collapsed, audit events initially limited to 10 with load-more; owner-only danger link hidden from non-owners.
- Tactics labels show short names with full accessible names and visible keyboard focus.
- Notifications return the newest 20 instead of rejecting accounts with more than 20 records; mark displayed unread notifications read and reopen device permission setup.
- Push prompt dismissal expires after 24 hours rather than persisting forever.
- `/demo` redirects to the application entry point.
- Prepared migration `20260905070237_pro7_audit_payment_description.sql`; NOT applied remotely.

## Evidence

- Full regression run: 674 tests, 667 passed, 7 skipped, 0 failed. Log: `/tmp/pro7-audit-fix-verified-tests.log`.
- Production build passed. Log: `/tmp/pro7-audit-fix-build.log`.
- `git diff --check` passed.
- Browser Playwright checks at 390 × 844: matches no horizontal overflow; readable funds dark actions; settings no horizontal overflow; active mobile nav visible.
- Browser tactics swap Danh Tuấn ↔ Đức Mạnh preserved seven starters and moved the previous starter to the bench. No save was performed; navigating away discarded this local change.
- Screenshots stored under `/Users/everygolflb/.codex/visualizations/2026/08/24/01a033cf-894c-7760-94ab-ada21d8eaea8/pro7-fixes-2026-09-05/`.

## Remaining release gates

- Complete live CRUD persistence/reload checks with isolated test records and both member/admin roles. Mounted tests are not proof of complete production end-to-end behavior.
- Verify real Web Push on an allowed browser/device; current browser permission is denied.
- Deferred by user: SePay automatic reconciliation. Retain manual bank verification and one atomic due-payment action; no provider subscription or integration in this release.
- Inspect remote function definitions/ACL before applying the prepared migration.
- Supabase advisors: 13 unindexed foreign keys, 5 unused indexes, 19 authenticated SECURITY DEFINER notices, 3 private RLS-without-policy notices, and leaked-password protection notice. These require contextual review, not blindly revoking RPC access or opening private RLS policies.
- Measure route latency with consistent warm/cold runs; no quantitative performance improvement claim yet.
- Verify remaining desktop/mobile and light/dark pages, including profile/avatar, dialogs and notification flows.
- Do not deploy until outstanding gates are resolved or explicitly accepted.

No production deployment or remote DB writes were performed in this batch. Historical financial records were not rewritten.

## Follow-up: manual payment scope confirmed

- Fixed Settings team-name save baseline. A mounted regression first failed on the stale dirty state, then passed after the fix; failed requests remain retryable.
- Added a real temporary-PostgreSQL lifecycle check: creating a due and confirming it generates exactly one income entry; replay does not duplicate income; a member cannot confirm; voiding restores pending and zero active income while retaining audit history.
- Latest full suite: 676 total, 669 passed, 7 skipped, zero failures (`/tmp/pro7-followup-tests.log`).
- Browser check on actual localhost data: September currently has no pending dues. Payment dialog correctly selects fee creation; QR dialog explains that a real pending fee is required. No fake payment or fee was inserted into the connected database.
- SePay is explicitly deferred and is no longer a prerequisite for finishing the manual-payment release. Other release gates above remain open.

## Notification and database preflight follow-up

- In-app invitations/reminders now resolve the current team slug and open the dedicated RSVP screen, consistent with the share-link flow.
- Ctrl/Cmd/Shift/Alt notification clicks retain native navigation instead of marking read and forcing the current tab to navigate. Tests first reproduced both route and modifier-click failures, then passed.
- Remote read-only preflight confirmed `manage_member_due` body matches the pending migration except for the intended Vietnamese default description; existing ACL is postgres/authenticated only. No remote apply performed.
- Added PostgreSQL query-plan checks for push lookup index availability and retained denial of authenticated access to private tables. Existing indexes provide a usable path under the test; no new index migration was retained. This is not a measured speedup claim.
- Latest full suite: 678 tests, 671 pass, 7 skipped, zero failures (`/tmp/pro7-plan-final-tests.log`). Build passed (`/tmp/pro7-plan-build.log`). The skipped tests are opt-in historical pre-apply database configurations, not seven observed feature failures.
- Shared-database browser mutation coverage still requires separately authorized test-owned fixtures per the approved plan. No real match invitation, payment, profile or membership was modified.
