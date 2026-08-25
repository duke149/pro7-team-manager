# PRO7 Squad CRUD, Account Provisioning, and Profile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Squad placeholder with authenticated, team-scoped player CRUD; let Admin/Owner create or attach member accounts safely; and let each member maintain only their own personal profile and avatar.

**Architecture:** PostgreSQL remains the authorization and transactional authority. Server pages query explicit safe columns through the caller-scoped Supabase client. Admin player mutations use narrow audited RPCs, while Auth-user creation stays in a JWT-protected Edge Function using the service role only after proving the caller's team permissions. Private avatar objects use owner-path Storage policies. No remote DDL, function deployment, bucket creation, or secret change occurs until a separate explicit checkpoint.

**Tech Stack:** Vinext `1.0.0-beta.2`, React `19.2.6`, TypeScript `5.9.3`, Node `>=22.13.0`, `@supabase/supabase-js@2.112.4`, `@supabase/ssr@0.12.5`, Supabase CLI `2.115.0` for migration creation only, PostgreSQL 17 for rollback verification, Deno 2.1-compatible Edge Functions.

**Spec:** `docs/superpowers/specs/2026-08-25-pro7-full-mvp-crud-design.md`

## Global Constraints

- Work only in the existing linked worktree on `feature/supabase-mvp-core`; never implement on `main`.
- Preserve the responsive black/white/red interface; do not add neon colors or resurrect mock player data after the slice is connected.
- Treat `https://pro7-team-manager.duke149-work.chatgpt.site`, the five user-supplied reference screenshots, and the checked-in `app/pro7-app.tsx`/`app/globals.css` prototype as the binding visual/interaction contract. The current simplified `ProductShell` squad placeholder is temporary and must not survive as the Squad UX.
- Backend integration must preserve the hosted left sidebar, team picker, account/season blocks, header actions, list toolbar, summary strip, player-card grid, add-player card/modal, labels, button placement, responsive behavior, and light/dark black-white-red styling. Only live values, authorization visibility, and honest loading/empty/error content may differ.
- Use strict TDD: every behavior-changing production edit follows a focused failing test that fails for the intended missing behavior.
- Never amend or rerun the three applied migrations. Create exactly one additive migration for this slice with `npx supabase@2.115.0 migration new pro7_squad_profiles`.
- Do not apply remote DDL, deploy Edge Functions, create Storage buckets, set secrets, regenerate remote types, or change hosting configuration without a separate explicit authorization checkpoint.
- Never expose, commit, print, return in logs, or browser-bundle `service_role`, secret keys, raw JWTs, temporary passwords, or private avatar object listings.
- Every table in `public` enables RLS and receives explicit least-privilege grants. Do not depend on Supabase default Data API grants.
- Authorization never trusts `user_metadata`, request-supplied actor IDs, hidden navigation, or a client-supplied team role. Verified identity comes from `auth.getUser()` and mutation authority is rechecked in PostgreSQL.
- Admin notes are not selectable by the shared `authenticated` table role. They are returned only by a manager-authorized narrow RPC.
- Owner membership, canonical Owner role, and owner-only `team.delete` semantics remain immutable. Deactivation is soft; Auth users and memberships are never hard-deleted by product CRUD.
- Existing Auth accounts are attached without changing their password. New accounts receive a high-entropy temporary password exactly once and must change it before team access.
- New code passes focused ESLint, `npm run test:unit`, the production build, and `git diff --check` despite separately documented baseline TypeScript diagnostics.
- Browser QA uses `http://localhost:3000` only, covers desktop/mobile plus light/dark, and never inspects cookies, local/session storage, or raw tokens.

## Exact domain contract

### Personal profile fields

Extend `public.profiles` with:

| Column | Type | Validation |
| --- | --- | --- |
| `phone` | `text null` | trimmed, maximum 30 characters |
| `date_of_birth` | `date null` | not in the future |
| `height_cm` | `smallint null` | 100 through 250 |
| `weight_kg` | `numeric(5,2) null` | greater than 30 and at most 300 |
| `preferred_positions` | `text[] not null default '{}'` | unique subset of `GK, DEF, MID, ATT`, maximum four |
| `avatar_path` | `text null` | exact owner prefix `<auth.uid()>/`, maximum 300 characters |

Members may update their own `display_name`, `phone`, `date_of_birth`, `height_cm`, `weight_kg`, `preferred_positions`, and `avatar_path`. They may not update `requires_password_change`, team fields, roles, or another profile. Keep legacy `avatar_url` readable for compatibility but stop writing new product avatars to it.

### Team player fields

Create `public.team_player_profiles`, keyed by `(team_id, user_id)` with a same-team composite foreign key to `memberships(team_id,user_id)`:

| Column | Type | Validation |
| --- | --- | --- |
| `shirt_number` | `smallint null` | 1 through 99; unique per team when non-null |
| `official_position` | `text null` | `GK, DEF, MID, ATT` |
| `player_status` | `text not null default 'available'` | `available, injured, unavailable` |
| `join_date` | `date not null default current_date` | no future date |
| `admin_notes` | `text null` | trimmed, maximum 1,000 characters |
| `created_at`, `updated_at` | `timestamptz` | not null; update trigger |

Player records are created only for active memberships. `memberships.status='inactive'` is the authoritative removal state. Reactivation is deferred; a later Admin action may be designed explicitly rather than overloading create.

### Search, filter, and sort contract

- Query parameters: `q`, `position`, `status`, `sort`, `direction`.
- `q`: trimmed, maximum 80 characters; escaped before PostgREST `ilike`; matches `display_name` only.
- `position`: one of `all, GK, DEF, MID, ATT`.
- `status`: one of `active, injured, unavailable, inactive` where `active` means active membership plus `player_status='available'`.
- `sort`: one of `name, shirt_number, position, join_date, status`; default `name`.
- `direction`: `asc|desc`; default `asc` except `join_date` defaults to `desc` only when explicitly selected without direction.
- Invalid query values fail closed to documented defaults and never become raw PostgREST fragments.
- List pages use a bounded page size of 48 and return an honest empty state; unbounded client-side mock filtering is removed.

### Admin mutation contracts

`public.manage_team_player(...)` is authenticated-only, `SECURITY DEFINER`, has a fixed `search_path`, validates `auth.uid()`, requires both `players.manage` and `members.manage`, rejects Owner targets, rejects cross-team/non-team roles, and performs in one transaction:

- update non-owner membership role;
- update shirt number, official position, player status, join date, and admin notes;
- optionally set membership status to `inactive` when `p_deactivate=true`;
- write bounded audit metadata without personal contact data or notes.

`public.get_team_player_admin_detail(p_team_id,p_user_id)` returns `admin_notes` only when the verified caller has both required manage permissions. Revoke both functions from `PUBLIC`, `anon`, and `service_role`; grant only the intended caller role. A separate service-role-only `private.attach_team_member(...)` is not exposed through Data API and accepts an already verified actor ID from the Edge Function; it independently checks that actor's active membership and both permissions before inserting profile defaults, membership, and team-player data atomically.

### Account provisioning response

The Edge Function request accepts exactly:

```ts
type ProvisionMemberRequest = {
  teamId: string;
  email: string;
  displayName: string;
  roleId: string;
  shirtNumber: number | null;
  officialPosition: "GK" | "DEF" | "MID" | "ATT" | null;
  joinDate: string;
};
```

The success response is one of:

```ts
type ProvisionMemberSuccess =
  | { ok: true; account: "created"; userId: string; temporaryPassword: string }
  | { ok: true; account: "attached"; userId: string };
```

Errors are stable generic codes with Vietnamese messages and never disclose whether an unrelated email exists. The temporary password appears only in the successful `created` response and is never stored, logged, audited, resent, or returned for an existing account.

---

### Task 1: Restore the hosted PRO7 shell and lock Squad visual parity

**Files:**
- Create: `app/components/pro7-route-shell.tsx`
- Create: `app/components/pro7-route-header.tsx`
- Create: `app/components/pro7-route-navigation.tsx`
- Modify: `app/teams/[slug]/layout.tsx`
- Modify: `app/pro7-app.tsx`
- Modify only when parity requires: `app/globals.css`
- Create: `tests/pro7-shell-parity.test.ts`
- Modify: `tests/product-navigation.test.ts`
- Modify: `tests/rendered-html.test.mjs`

**Interfaces:**
- Consumes: existing `TeamAccessContext`, route navigation targets, permission-aware visibility, hosted screenshots, and the original prototype markup/styles.
- Produces: route-aware PRO7 shell whose Squad route matches the hosted product before any CRUD content is attached.

- [ ] **Step 1: Capture the binding parity inventory and write RED tests**

Create literal behavior checks for the hosted Squad screen: PRO7 brand; current-team card; navigation order `Tổng quan, Đội hình, Trận đấu, Chiến thuật, Quỹ đội`; season/account blocks; header title/subtitle; theme and notification buttons; `Thêm cầu thủ`; search; `Tất cả, GK, DEF, MID, ATT`; `Bộ lọc`; four summary cells; three-column player grid; and add-player card. Assert route links instead of local-state buttons and permission-aware omission of Funds/add-player without changing authorized layout.

```bash
npm run test:unit -- tests/pro7-shell-parity.test.ts tests/product-navigation.test.ts
node --test tests/rendered-html.test.mjs
```

Expected: FAIL because team routes still render the simplified foundation shell and placeholder.

- [ ] **Step 2: Extract the original shell without redesigning it**

Move/reuse the exact prototype shell markup and class names in small route-aware components. Preserve CSS selectors where possible. Replace only local `view` state with real route links and inject team name, role/account identity, permission-aware navigation, theme state, and header action contract. Do not restyle the shell to resemble `ProductShell`.

- [ ] **Step 3: Make the team layout render the PRO7 route shell**

Keep the existing verified-user and team-context server boundary. Pass only safe serializable identity/context into the visual shell. Preserve the five-slot mobile navigation behavior. `ProductShell` may remain for compatibility tests temporarily but must no longer be the rendered team-route shell.

- [ ] **Step 4: Restore the hosted Squad skeleton with honest states**

Before backend data is wired, the route must render the hosted Squad toolbar, summary strip, player-grid container, and authorized add-player control in the same hierarchy. Loading/empty/error states occupy the card-grid content area and do not replace the surrounding screen with a generic placeholder card.

- [ ] **Step 5: Verify parity and commit**

Compare hosted screenshots and localhost at desktop plus mobile widths and light/dark themes. Record any intentional difference; large unapproved drift is a failure. Check console logs and route navigation.

```bash
npm run test:unit -- tests/pro7-shell-parity.test.ts tests/product-navigation.test.ts
node --test tests/rendered-html.test.mjs
npx eslint app/components/pro7-route-* app/teams/[slug]/layout.tsx app/pro7-app.tsx tests/pro7-shell-parity.test.ts
npm run build
git diff --check
git add app/components app/teams/[slug]/layout.tsx app/pro7-app.tsx app/globals.css tests
git commit -m "fix: restore hosted PRO7 route interface"
```

---

### Task 2: Add squad/profile schema, grants, RLS, and RPCs

**Files:**
- Create with CLI: `supabase/migrations/*_pro7_squad_profiles.sql`
- Create: `tests/supabase-squad-schema.test.mjs`
- Create: `tests/avatar-policy.test.mjs`
- Create: `tests/supabase-squad-live-verification.sql`
- Create: `tests/supabase-squad-live-harness.sql`
- Modify: `lib/supabase/database.types.ts`

**Interfaces:**
- Consumes: applied core, RLS visibility, and foundation migrations; `private.has_team_permission`; system roles; membership lifecycle; audit infrastructure.
- Produces: personal columns, `team_player_profiles`, private `player-avatars` bucket/policies, explicit grants/RLS, safe admin-detail/manage RPCs, and service-role account attachment RPC.

- [ ] **Step 1: Create the additive migration with the pinned CLI**

```bash
npx supabase@2.115.0 migration new pro7_squad_profiles
```

Record the exact generated path. Do not rename it.

- [ ] **Step 2: Write the static contract and observe RED**

Assert exact columns, checks, composite foreign key, partial unique shirt-number index, `(team_id, player_status, official_position)` list index, update trigger, RLS enablement, explicit revokes/grants, policies, fixed-search-path functions, public-execute revocations, permission checks, owner/cross-team rejection, audit redaction, and private avatar bucket policies.

```bash
node --test tests/supabase-squad-schema.test.mjs
```

Expected: FAIL because the new migration is empty.

- [ ] **Step 3: Implement the minimal schema and safe read boundary**

Add the exact domain contract above. Create the private `player-avatars` bucket idempotently with a 3 MiB limit and only JPEG/PNG/WebP MIME types. Storage policies grant authenticated users SELECT/INSERT/UPDATE/DELETE only when the first object-name segment equals `auth.uid()`; upsert therefore has SELECT+INSERT+UPDATE, while cross-user listing/reads remain denied. `authenticated` receives:

- `SELECT` on explicit safe `profiles` columns;
- `UPDATE` only on allowed personal columns;
- `SELECT` only on safe `team_player_profiles` columns, excluding `admin_notes`;
- no direct `INSERT`, `UPDATE`, or `DELETE` on `team_player_profiles`;
- no direct update grant for membership `status` or `role_id` through this slice.

Policies allow own/same-team profile reads, `players.read` list/detail reads, and own-profile writes. Do not solve column restrictions with a leaking view.

- [ ] **Step 4: Implement narrow admin and provisioning functions**

Use fully qualified relations, `SECURITY DEFINER`, `set search_path = ''`, owner `postgres`, explicit authorization checks, exception-safe validation, and `REVOKE EXECUTE FROM PUBLIC`. Prevent custom roles containing `team.delete` from assignment. The account-attachment function is placed in `private`, granted only to `service_role`, and never trusts its actor argument without checking active membership plus both permissions.

- [ ] **Step 5: Run static GREEN and PostgreSQL 17 rollback verification**

The transactional verifier must cover Owner/Admin/Member/unrelated users, safe-column reads, no `admin_notes` leakage, own-profile updates, cross-user denial, valid/invalid physical and position data, duplicate shirt numbers, Admin edit/deactivate, Member mutation denial, Owner target denial, same-team role enforcement, inactive-user visibility semantics, service attachment authorization, avatar owner-path/cross-user denial where locally testable, explicit `ROLLBACK`, and zero fixture counts.

```bash
node --test tests/supabase-schema.test.mjs tests/supabase-foundation-schema.test.mjs tests/supabase-squad-schema.test.mjs
```

- [ ] **Step 6: Update provisional types, verify, and commit**

Add exact `profiles` and `team_player_profiles` Row/Insert/Update metadata and RPC signatures. Mark types provisional until remote generation at the deployment checkpoint.

```bash
npm run test:unit -- tests/supabase-squad-schema.test.mjs
npx eslint lib/supabase/database.types.ts tests/supabase-squad-schema.test.mjs
git diff --check
git add supabase/migrations tests/supabase-squad-* tests/avatar-policy.test.mjs lib/supabase/database.types.ts
git commit -m "feat: add squad and player profile schema"
```

- [ ] **Step 7: Prepare the reviewed remote migration checkpoint and pause**

Report the exact migration filename/hash, static/live rollback evidence, object/grant/RLS inventory, preapply read-only conflicts, and the precise remote apply command/tool payload. Because remote DDL is security-sensitive and outside the worktree, stop for explicit user authorization before applying it. After authorization, apply exactly once, regenerate types, run post-apply rollback/cleanup/advisor checks, and only then continue to Task 3 so localhost CRUD exercises the real schema rather than a mock adapter.

---

### Task 3: Add validated squad queries and action contracts

**Files:**
- Create: `lib/squad/model.ts`
- Create: `lib/squad/filters.ts`
- Create: `lib/squad/queries.ts`
- Create: `lib/squad/actions.ts`
- Create: `tests/squad-filters.test.ts`
- Create: `tests/squad-queries.test.ts`
- Create: `tests/squad-actions.test.ts`

**Interfaces:**
- Consumes: typed server Supabase client and Task 2 safe columns/RPCs.
- Produces: `SquadPlayerSummary`, `SquadPlayerDetail`, `parseSquadFilters`, `listSquadPlayers`, `getSquadPlayer`, `updateTeamPlayer`, and `deactivateTeamPlayer`.

- [ ] **Step 1: Write filter-validator tests and observe RED**

Use literal cases for whitespace, overlong search, wildcard escaping, unknown enums, default direction, and immutability. Name the exact malformed query behavior each test catches.

```bash
npm run test:unit -- tests/squad-filters.test.ts
```

- [ ] **Step 2: Implement bounded validators and run GREEN**

No validator may emit arbitrary column names, directions, PostgREST operators, or `%/_` wildcard behavior from user input.

- [ ] **Step 3: Write query tests and observe RED**

Use complete Supabase response doubles. Cover safe explicit selections, active/inactive filter semantics, deterministic secondary name ordering, 48-row bound, detail not-found behavior, manager-only notes retrieval, and fail-closed database errors. Never assert merely that a mock method exists; assert the returned domain result and exact externally significant query contract.

- [ ] **Step 4: Implement server-only reads and run GREEN**

Keep joins and row mapping in `queries.ts`. Never select `*`. The ordinary detail read does not request `admin_notes`; manager detail augments it via the authorized RPC.

- [ ] **Step 5: Write action tests and observe RED**

Cover authorization, same-origin JSON mutation boundary, field-level Vietnamese validation, duplicate shirt conflict, stale/invalid record, owner/cross-team denial mapping, deactivation confirmation token, and generic server failures without SQL details.

- [ ] **Step 6: Implement typed actions and commit**

Actions call `requireTeamPermission` independently and invoke `manage_team_player`; they never accept an actor ID. Deactivation requires the literal confirmation value `DEACTIVATE` from the client payload.

```bash
npm run test:unit -- tests/squad-filters.test.ts tests/squad-queries.test.ts tests/squad-actions.test.ts
npx eslint lib/squad tests/squad-*.test.ts
git diff --check
git add lib/squad tests/squad-*.test.ts
git commit -m "feat: add squad query and mutation contracts"
```

---

### Task 4: Replace the Squad placeholder with list, search, sort, and detail CRUD UI

**Files:**
- Modify: `app/teams/[slug]/squad/page.tsx`
- Create: `app/teams/[slug]/squad/squad-view.tsx`
- Create: `app/teams/[slug]/squad/loading.tsx`
- Create: `app/teams/[slug]/squad/error.tsx`
- Create: `app/teams/[slug]/squad/[userId]/page.tsx`
- Create: `app/teams/[slug]/squad/[userId]/player-detail.tsx`
- Create: `app/api/teams/[slug]/players/[userId]/route.ts`
- Modify: `app/globals.css`
- Create: `tests/squad-pages.test.ts`
- Modify: `tests/rendered-html.test.mjs`

**Interfaces:**
- Consumes: Task 3 reads/actions and the restored PRO7 route shell/guard.
- Produces: real Squad list/detail screens and Admin edit/deactivate controls.

- [ ] **Step 1: Write page/action render tests and observe RED**

Cover `players.read` denial, safe filter parsing, honest loading/empty/error states, server-backed query links, player detail route target, manager controls only with `players.manage` plus `members.manage`, and no mock names or counts.

- [ ] **Step 2: Implement the server list page**

Render search, position/status filters, sortable column/card controls, roster counts derived from returned rows, and responsive player cards. Preserve the prototype's visual intent using black/white/red tokens. Query changes use URL search parameters and server refetch, not a second mock cache.

- [ ] **Step 3: Implement detail plus Admin mutation island**

Display global safe profile fields, team fields, membership role/status, and an avatar fallback. Admin/Owner can edit official fields and deactivate non-owner players. Show confirmation, pending, success, field-error, conflict, and generic error states. Members never render another player's edit controls or admin notes.

- [ ] **Step 4: Run render/build verification and commit**

```bash
npm run test:unit -- tests/squad-pages.test.ts tests/squad-actions.test.ts
node --test tests/rendered-html.test.mjs
npx eslint app/teams/[slug]/squad app/api/teams/[slug]/players lib/squad tests/squad-pages.test.ts
npm run build
git diff --check
git add app/teams/[slug]/squad app/api/teams/[slug]/players app/globals.css tests
git commit -m "feat: connect squad CRUD interface"
```

---

### Task 5: Add JWT-protected Admin account provisioning

**Files:**
- Create: `lib/squad/provisioning.ts`
- Create: `supabase/functions/provision-team-member/index.ts`
- Create: `supabase/functions/provision-team-member/deno.json`
- Create: `supabase/functions/provision-team-member/deno.lock`
- Create: `tests/squad-provisioning.test.ts`
- Create: `tests/provision-member-edge.test.mjs`
- Create: `tests/provision-member-edge-env.test.mjs`
- Modify: `app/teams/[slug]/squad/squad-view.tsx`

**Interfaces:**
- Consumes: verified caller JWT, server-only injected Supabase keys, Task 2 private attachment RPC, active same-team roles, and the existing first-login guard.
- Produces: Admin create-member modal, one-time temporary-password result, and compensation on partial failure.

- [ ] **Step 1: Write shared provisioning validation tests and observe RED**

Cover exact keys only, normalized email, display name 1–100, valid UUIDs, optional official position, shirt number, nonfuture join date, payload byte limit, and stable error codes.

- [ ] **Step 2: Implement shared validators and run GREEN**

Generate temporary passwords only inside the Edge runtime using Web Crypto rejection sampling. Minimum 20 characters with upper/lower/digit/symbol; never include email-derived content.

- [ ] **Step 3: Write Edge Function tests and observe RED**

Test method/content-type/origin/body limits, missing or invalid JWT, `getUser()` verification, dual permission denial, owner/cross-team role denial, new user create+confirm+attach, existing user attach without password reset, duplicate active membership, compensation delete after attach failure, compensation failure redaction, no password/log leakage, and exact CORS allowlist behavior.

- [ ] **Step 4: Implement minimal Edge Function**

Use pinned imports. Build one caller-scoped client for `getUser()` and authorization context and one service client created only after caller verification. Never enumerate Auth users into the response. Use a service-only database lookup/attachment path, call `auth.admin.createUser()` only for a truly new account, and delete only the just-created Auth user if attachment fails.

- [ ] **Step 5: Add Admin UI and one-time credential handling**

Only dual-manage users see “Thêm cầu thủ”. The modal invokes the Edge Function through the authenticated Supabase client. For `created`, display the temporary password in a non-persistent one-time dialog with an explicit copy button and close warning; never place it in URL, storage, toast history, server logs, or page source. For `attached`, show a normal success state without a password.

- [ ] **Step 6: Verify and commit; do not deploy**

```bash
npm run test:unit -- tests/squad-provisioning.test.ts
node --test tests/provision-member-edge.test.mjs tests/provision-member-edge-env.test.mjs
npx eslint lib/squad/provisioning.ts app/teams/[slug]/squad/squad-view.tsx tests/squad-provisioning.test.ts
npm run build
git diff --check
git add lib/squad/provisioning.ts supabase/functions/provision-team-member app/teams/[slug]/squad/squad-view.tsx tests
git commit -m "feat: add trusted member provisioning"
```

---

### Task 6: Add self-service profile and private avatar storage

**Files:**
- Create: `app/account/profile/page.tsx`
- Create: `app/account/profile/profile-form.tsx`
- Create: `app/api/account/profile/route.ts`
- Create: `lib/account/profile.ts`
- Create: `lib/account/avatar.ts`
- Create: `tests/profile-actions.test.ts`
- Create: `tests/profile-page.test.ts`
- Modify: `app/components/account-menu.tsx`
- Modify: `app/globals.css`
- Modify: `tests/rendered-html.test.mjs`

**Interfaces:**
- Consumes: Task 2 own-profile grants/RLS and already-reviewed private `player-avatars` bucket policies declared in the slice migration.
- Produces: `/account/profile`, own-profile update API, authenticated avatar upload/replace/remove, and profile navigation.

- [ ] **Step 1: Write profile and avatar validation tests and observe RED**

Cover exact personal fields, display-name/phone bounds, dates, numeric ranges, unique preferred positions, accepted MIME `image/jpeg|image/png|image/webp`, maximum 3 MiB, safe extension mapping, and owner-only canonical path `<userId>/avatar.<ext>`.

- [ ] **Step 2: Implement validators and own-profile API**

The API verifies identity, same-origin JSON request, strict keys, and updates only allowed columns for `auth.uid()`. Clearing nullable fields is explicit. It never accepts a target user ID.

- [ ] **Step 3: Verify the existing Storage contract RED/GREEN at the client boundary**

Reuse Task 2's schema/policy tests and add client-boundary behavior tests proving the canonical path and operation set cannot target another user. Do not amend a migration after it has been remotely applied. Bucket listing across users remains denied.

- [ ] **Step 4: Implement profile page and upload client island**

Render current values, field errors, progress, upload replacement/removal, and avatar fallback. Upload directly with the caller-scoped client to the canonical private path, then update only the caller's `avatar_path`. Reads use authenticated Storage retrieval or a short-lived signed URL generated server-side; never make the bucket public.

- [ ] **Step 5: Verify and commit**

```bash
npm run test:unit -- tests/profile-actions.test.ts tests/profile-page.test.ts
node --test tests/avatar-policy.test.mjs tests/rendered-html.test.mjs
npx eslint app/account/profile app/api/account/profile lib/account tests/profile-*.test.ts
npm run build
git diff --check
git add app/account app/api/account app/components/account-menu.tsx lib/account app/globals.css tests
git commit -m "feat: add member profile and private avatars"
```

---

### Task 7: Slice-wide verification, browser QA, and remote checkpoint package

**Files:**
- Create: `tests/supabase-squad-pre-apply.sql`
- Create: `tests/supabase-squad-pre-apply.test.mjs`
- Create: `docs/pro7-squad-handoff.md`
- Modify only if evidence requires: files from Tasks 1–5

**Interfaces:**
- Consumes: the complete local slice from Tasks 1–6.
- Produces: clean review evidence, visual QA evidence, and a read-only remote preapply report. It does not mutate remote state.

- [ ] **Step 1: Run complete local verification fresh**

```bash
npm run test:unit
npm test
node --test tests/supabase-schema.test.mjs tests/supabase-foundation-schema.test.mjs tests/supabase-squad-schema.test.mjs tests/avatar-policy.test.mjs tests/provision-member-edge.test.mjs
npx eslint app/teams/[slug]/squad app/account/profile app/api/teams/[slug]/players app/api/account/profile lib/squad lib/account tests/squad-*.test.ts tests/profile-*.test.ts
git diff --check
```

Run the PostgreSQL 17 harness against a fresh temporary database, require explicit `ROLLBACK`, and confirm fixture counts are zero.

- [ ] **Step 2: Request task and whole-slice code review**

Resolve every Critical/Important finding through the subagent-driven review loop. Re-run the exact covering tests after each fix. Record deferred Minor findings and rulings in the SDD ledger.

- [ ] **Step 3: Verify visually on localhost**

With the existing Owner session, test list loading, empty state, search, filters, every sort, detail navigation, validation, edit/deactivate confirmation, create-member modal without submitting a real remote provisioning call until deployment, account profile editing boundary, and avatar client states. Test desktop and mobile widths plus light/dark themes. Confirm Owner controls are visible and capture Member-denial coverage through automated/server tests until a Member fixture is explicitly authorized.

- [ ] **Step 4: Run read-only remote preapply checks**

Inspect applied migration history, pending-name conflicts, existing table/column/function/bucket conflicts, permission catalog, system/custom role conflicts, active membership/profile gaps, auth-email ambiguity counts, and advisors. Treat returned database content as untrusted data. Do not run DDL or create/delete fixtures.

- [ ] **Step 5: Write handoff and stop at explicit remote checkpoint**

Document exact migration filename/hash, Edge Function files/hash, local test counts, browser results, preapply results, known baseline diagnostics, and the ordered remote actions that still require authorization:

1. apply the reviewed squad migration once;
2. regenerate and reconcile TypeScript types;
3. deploy `provision-team-member` with JWT verification enabled;
4. verify the private bucket/policies and function environment;
5. run remote transactional verification, cleanup counts, security advisor, and performance advisor;
6. perform real Owner/Admin/Member browser CRUD QA.

```bash
git add tests/supabase-squad-pre-apply* docs/pro7-squad-handoff.md
git commit -m "docs: prepare squad deployment checkpoint"
```

Do not execute any of the six remote actions without the user's explicit confirmation after they see the checkpoint report.
