# PRO7 Overview, News, Notification, and Auth Completion Plan

**Goal:** Complete Slice 5 of the approved QA backend CRUD design without replacing the PRO7 frontend: permission-safe Overview data, audited Team News lifecycle CRUD, reliable self-only notifications, and an honest login/session UI.

**Architecture:** The Overview server route passes its verified permission snapshot into bounded server-only reads. Team News mutations cross one same-origin API and one narrow `SECURITY DEFINER` RPC with optimistic concurrency. Existing notification RLS/API remain authoritative while the client adopts only validated server results. The cosmetic Remember Me control is removed because Supabase SSR session persistence is not varied by that checkbox.

**Spec:** `docs/superpowers/specs/2026-08-28-pro7-qa-backend-crud-completion-design.md`

## Global constraints

- Preserve the existing Overview card order, copy hierarchy, black/white/red theme, responsive shell, and Admin/Member navigation.
- Never query a protected Overview source unless the verified context contains its read/manage permission.
- Members receive published Team News only. Draft and archived rows never enter Member props.
- News archive is a reversible lifecycle state, not a physical delete.
- Existing applied migrations remain immutable. The new migration stays local until a separately authorized remote apply.
- Every mutation uses exact keys, bounded UTF-8 bodies, same-origin JSON, stable Vietnamese errors, a verified team permission, and an optimistic `updated_at` token.
- Do not implement custom-role mutation controls because the accepted Settings screen exposes role summaries only; this follows the conditional Slice 5 ruling.

## Task 1 — Lock permission-safe Overview and Team News contracts

**Files:**
- Modify: `lib/overview/model.ts`
- Modify: `lib/overview/queries.ts`
- Modify: `app/teams/[slug]/overview/page.tsx`
- Create: `lib/news/model.ts`
- Create: `lib/news/validation.ts`
- Create/modify focused Overview and News tests

1. Add RED tests proving a `team.read`-only caller never invokes Match, stats, profile, or News queries; `news.read` receives only currently published rows; `news.manage` can receive bounded draft/published/archived management rows; malformed/overflow data fails closed.
2. Add exact immutable models for published summaries and Admin management rows with `status`, nullable `publishedAt`, and `updatedAt`.
3. Pass permission booleans from the verified page context. Skip unavailable sources instead of relying on RLS errors and expose honest permission-empty states.
4. Keep match/news controls as links only when the corresponding permission exists.

## Task 2 — Add the atomic Team News lifecycle RPC

**Files:**
- Create: `supabase/migrations/<timestamp>_manage_team_news.sql`
- Modify: `lib/supabase/database.types.ts`
- Create: `tests/supabase-team-news-schema.test.mjs`
- Create: `tests/team-news-live.test.mjs`

1. Generate the migration with pinned Supabase CLI `2.55.8`; do not hand-invent its timestamp.
2. Write static RED tests for an additive `archived` status constraint and `manage_team_news` RPC.
3. Implement one `SECURITY DEFINER`, fixed-search-path RPC supporting `create`, `update`, `publish`, and `archive`. It rechecks `news.manage`, locks the target row, rejects cross-team/missing/stale/lifecycle-invalid input, and returns one authoritative bounded row.
4. Revoke execution from `PUBLIC`, `anon`, `authenticated`, and `service_role`, then grant only `authenticated`. Keep direct authenticated News writes revoked.
5. Run a disposable PostgreSQL 17 verifier covering Admin success, Member/anon/cross-team denial, stale rejection, published Member visibility, draft/archive non-visibility, audit behavior, and cleanup/rollback sentinels.

## Task 3 — Connect same-origin News CRUD to the existing Overview card

**Files:**
- Create: `lib/news/actions.ts`
- Create: `app/api/teams/[slug]/news/route.ts`
- Modify: `app/teams/[slug]/overview/overview-view.tsx`
- Modify: `app/globals.css`
- Create: `tests/news-actions.test.ts`
- Create: `tests/news-mounted.test.ts`
- Modify: Overview page/mounted tests

1. RED-test cross-origin, content type, body size, exact keys, validation, permission, stale/lifecycle/error mapping, and authoritative RPC output.
2. Implement `POST` create and `PATCH` update/publish/archive adapters over the single RPC.
3. Add an Admin-only News management dialog inside the existing `Tin mới` card. Reuse the shared modal/form/button/error styles; support create, select/edit, publish, and archive without changing card order.
4. After success, adopt the returned row/token and refresh authoritative route data. Preserve drafts and show an explicit stale message on conflict.
5. Trap focus, close with Escape when safe, restore focus, use 44px touch targets, and bind field errors with `aria-invalid`/`aria-describedby`.

## Task 4 — Make notification and login behavior honest

**Files:**
- Modify: `app/components/notification-center.tsx`
- Modify: `app/login/login-form.tsx`
- Modify focused notification/login mounted tests

1. RED-test that notification read state changes only after a valid authoritative `readAt`, malformed success fails closed, deep-link navigation remains local, and the popover supports Escape/focus restoration.
2. Reconcile the client only from a validated API timestamp; never substitute a client clock. Navigate to the validated existing local target after the bounded mark-read attempt.
3. Remove the cosmetic Remember Me state/control and its obsolete CSS/tests. Retain show-password, forgot-password, non-enumerating errors, and Supabase SSR persistence.

## Task 5 — Verify localhost, review, and checkpoint

1. Run focused validator/action/query/mounted tests and the PostgreSQL 17 static/live migration gates.
2. Run the complete unit suite, production build/render suite, changed-file ESLint, changed-production TypeScript diagnostic filter, secret scan, and `git diff --check`.
3. On `localhost:3000`, inspect Admin Overview/News/notification/login at desktop and 390px, light/dark, and confirm no horizontal overflow. Inspect a Member session read-only when an existing safe session is available; do not mutate shared remote data.
4. Self-review authorization, tenant isolation, stale writes, draft leakage, accessible modal behavior, and UI parity. Fix every Critical/Important issue before commit.
5. Commit the slice. Stop before remote migration apply, remote CRUD, merge, push, or production deploy; each remains a separate authorization checkpoint.

## Acceptance criteria

- Overview never errors merely because a caller lacks `matches.read` or `news.read`, and it never queries/serializes data outside verified permissions.
- Admin can create, edit, publish, and archive Team News through a real API/RPC flow; Member Overview sees only published items.
- News mutations are atomic, tenant-bound, audited, stale-safe, and direct authenticated table writes remain unavailable.
- Notification read state is authoritative and keyboard-operable; no fabricated timestamp is shown.
- Login has no cosmetic persistence control; show-password and recovery remain functional.
- Existing PRO7 frontend structure and responsive black/white/red visual identity remain intact.
