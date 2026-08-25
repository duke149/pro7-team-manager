# PRO7 Foundation Routing and RBAC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the first working slice of the approved full MVP: team-scoped routes, typed permission context, role-aware navigation, safe first-team setup, and a mandatory temporary-password change boundary.

**Architecture:** Vinext server pages resolve a verified Supabase user and load team membership/permissions before rendering focused client UI. PostgreSQL stays authoritative through additive schema changes and RLS; the browser receives only a serializable `TeamAccessContext`. A trusted local-only Edge Function replaces temporary passwords without exposing `service_role`; deployment waits for a separate checkpoint.

**Tech Stack:** Vinext `1.0.0-beta.2`, React `19.2.6`, TypeScript `5.9.3`, Node `>=22.13.0`, `@supabase/supabase-js@2.112.4`, `@supabase/ssr@0.12.5`, Supabase CLI `2.115.0` for migration creation only, PostgreSQL 17 for local rollback verification.

**Spec:** `docs/superpowers/specs/2026-08-25-pro7-full-mvp-crud-design.md`

## Global Constraints

- Work only in the existing linked worktree on `feature/supabase-mvp-core`; never implement on `main`.
- Preserve the black/white/red responsive UI and do not introduce neon colors.
- Never expose, commit, print, or browser-bundle `service_role`, secret keys, temporary passwords, raw tokens, or push subscription material.
- Never amend or rerun `20260824170300_supabase_mvp_core.sql`. The pending RLS correction and every new migration remain local-only until explicit remote authorization.
- Create migration files with `npx supabase@2.115.0 migration new <name>` and keep the generated timestamp.
- Use strict TDD: observe each focused test fail for the intended missing behavior before production code.
- Keep ChatGPT/Sites authentication independent. Verify Supabase identity with `auth.getUser()`.
- New files must pass focused ESLint and the production build despite documented unrelated baseline findings.
- Do not deploy Edge Functions, set secrets, apply remote DDL, or modify hosting configuration in this plan.

---

### Task 1: Add foundation permissions and first-login state

**Files:**
- Create with CLI: `supabase/migrations/*_pro7_foundation_permissions.sql` (exactly one timestamped file)
- Create: `tests/supabase-foundation-schema.test.mjs`
- Create: `tests/supabase-foundation-live-verification.sql`
- Modify: `lib/supabase/database.types.ts`

**Interfaces:**
- Consumes: core tables/RLS/system roles and the pending mutation-visibility migration.
- Produces: `profiles.requires_password_change`; membership `active/inactive` lifecycle and update timestamp; 11 new permission codes; exact Owner/Admin/Member mappings; provisional local `Database` metadata.

- [ ] **Step 1: Create the migration through the pinned CLI**

```bash
npx supabase@2.115.0 migration new pro7_foundation_permissions
```

Record the single printed path; never rename it after remote apply.

- [ ] **Step 2: Write and run the failing static contract**

Create `tests/supabase-foundation-schema.test.mjs`. It must locate exactly one migration ending `_pro7_foundation_permissions.sql` and assert these literal codes:

```js
const newCodes = [
  "players.read", "players.manage",
  "matches.read", "matches.manage", "matches.respond",
  "tactics.read", "tactics.manage",
  "news.read", "news.manage",
  "finance.read", "finance.manage",
];
const memberCodes = [
  "team.read", "members.read", "roles.read", "players.read",
  "matches.read", "matches.respond", "tactics.read", "news.read",
];
```

It must fail if `requires_password_change boolean not null default false`, `memberships.status`/`updated_at`, the status check/index, conflict-safe permission seeding, exact system-role remapping, or removal of `settings.read` from Member is absent.

```bash
node --test tests/supabase-foundation-schema.test.mjs
```

Expected: FAIL because the CLI migration is empty.

- [ ] **Step 3: Implement the minimal additive migration**

Use fully qualified statements and this exact column/catalog shape:

```sql
alter table public.profiles
  add column if not exists requires_password_change boolean not null default false;

alter table public.memberships
  add column if not exists status text not null default 'active',
  add column if not exists updated_at timestamptz not null default now();

insert into public.permissions (code, description) values
  ('players.read', 'View player records'),
  ('players.manage', 'Manage player records'),
  ('matches.read', 'View matches'),
  ('matches.manage', 'Manage matches'),
  ('matches.respond', 'Respond to own match attendance'),
  ('tactics.read', 'View applied tactics'),
  ('tactics.manage', 'Manage tactics'),
  ('news.read', 'View team news'),
  ('news.manage', 'Manage team news'),
  ('finance.read', 'View team finance'),
  ('finance.manage', 'Manage team finance')
on conflict (code) do update set description = excluded.description;
```

Owner gets all 21 catalog entries; Admin gets all except `team.delete`; Member is rebuilt to the exact eight-code array above. Do not alter custom roles. Do not grant authenticated users direct UPDATE of `requires_password_change`.

Add a named `memberships_status_check` for `active|inactive`, an index on `(team_id, status)`, the existing `private.set_updated_at()` trigger for `updated_at`, and audit coverage through the existing membership audit trigger. Do not grant authenticated clients direct status updates yet; the squad plan will add a narrow trusted deactivation path.

- [ ] **Step 4: Run static contracts GREEN**

```bash
node --test tests/supabase-schema.test.mjs tests/supabase-rls-mutation-visibility.test.mjs tests/supabase-foundation-schema.test.mjs
```

Expected: all PASS.

- [ ] **Step 5: Write and run PostgreSQL 17 rollback verification**

`tests/supabase-foundation-live-verification.sql` must create Owner/Admin/Member/custom-role fixtures and assert: default password flag false; default membership status active; inactive membership is excluded by later context reads; status rejects unknown values; direct authenticated status mutation remains denied; Owner all 21; Admin lacks only `team.delete`; Member has exactly eight and lacks settings/finance/manage; custom mappings stay unchanged. Use literal expected arrays, explicit `ROLLBACK`, and zero fixture counts.

Apply core, pending RLS correction, and foundation migrations in order to a fresh temporary PostgreSQL 17 database using the existing Supabase role/auth stub pattern, then run both live verifier scripts. Expected: explicit rollback and 21 permission seeds only.

- [ ] **Step 6: Update provisional local types and commit**

Add `requires_password_change` to `profiles.Row/Insert/Update` and `status`/`updated_at` to `memberships.Row/Insert/Update` in `lib/supabase/database.types.ts`; report them as provisional until remote type generation.

```bash
npm run test:unit -- tests/supabase-foundation-schema.test.mjs
node --test tests/supabase-schema.test.mjs tests/supabase-rls-mutation-visibility.test.mjs tests/supabase-foundation-schema.test.mjs
git diff --check
git add supabase/migrations tests/supabase-foundation-schema.test.mjs tests/supabase-foundation-live-verification.sql lib/supabase/database.types.ts
git commit -m "feat: add PRO7 foundation permissions"
```

---

### Task 2: Add typed team access and permission guards

**Files:**
- Create: `lib/teams/permissions.ts`
- Create: `lib/teams/context.ts`
- Create: `tests/team-permissions.test.ts`
- Create: `tests/team-context.test.ts`

**Interfaces:**
- Consumes: `createServerSupabaseClient()`, verified users, and typed reads of teams/memberships/roles/role permissions.
- Produces: `PermissionCode`, `TeamAccessContext`, `hasPermission`, `loadTeamAccessContext`, `listUserTeams`, and `requireTeamPermission`.

- [ ] **Step 1: Write and run failing permission tests**

Use literal contexts and assert true/false behavior, fail-closed unknown strings, and input immutability:

```ts
assert.equal(hasPermission(context, "matches.read"), true);
assert.equal(hasPermission(context, "finance.read"), false);
assert.equal(isPermissionCode("team.delete"), true);
assert.equal(isPermissionCode("finance.destroy"), false);
```

```bash
npm run test:unit -- tests/team-permissions.test.ts
```

Expected: FAIL because the module is absent.

- [ ] **Step 2: Implement the exact permission catalog and run GREEN**

Export a readonly `PERMISSION_CODES` with all 21 codes and derive:

```ts
export type PermissionCode = (typeof PERMISSION_CODES)[number];
export function isPermissionCode(value: string): value is PermissionCode;
export function hasPermission(
  context: { permissions: readonly PermissionCode[] },
  code: PermissionCode,
): boolean;
```

Rerun the focused test; expect PASS.

- [ ] **Step 3: Write and run failing context tests**

Use complete Supabase response doubles `{ data, error, count, status, statusText }`. Cover authorized active membership, inactive/missing membership returning `null`, missing role/error failing closed, active team sorting, and verified-user permission denial. The exact serialized contract is:

```ts
export type TeamAccessContext = {
  team: { id: string; name: string; slug: string };
  userId: string;
  membership: { roleId: string; roleSlug: string; roleName: string };
  permissions: readonly PermissionCode[];
};
```

```bash
npm run test:unit -- tests/team-context.test.ts
```

Expected: FAIL because `context.ts` is absent.

- [ ] **Step 4: Implement fail-closed sequential typed reads**

Read team by slug, current user's active membership, role, then role-permission codes. Validate every permission with `isPermissionCode`. Dependency-inject the client for tests; production defaults to `createServerSupabaseClient()`. `requireTeamPermission` must obtain identity through `getCurrentUser()` and never accept route-supplied user IDs.

- [ ] **Step 5: Run focused verification and commit**

```bash
npm run test:unit -- tests/team-permissions.test.ts tests/team-context.test.ts
npx eslint lib/teams/permissions.ts lib/teams/context.ts tests/team-permissions.test.ts tests/team-context.test.ts
git diff --check
git add lib/teams tests/team-permissions.test.ts tests/team-context.test.ts
git commit -m "feat: add typed team access guards"
```

---

### Task 3: Enforce temporary-password replacement

**Files:**
- Create: `lib/account/password.ts`
- Create: `app/account/change-password/page.tsx`
- Create: `app/account/change-password/change-password-form.tsx`
- Create: `supabase/functions/change-temporary-password/index.ts`
- Create: `supabase/functions/change-temporary-password/deno.json`
- Create: `tests/password-policy.test.ts`
- Create: `tests/first-login-boundary.test.ts`
- Create: `tests/change-password-edge.test.mjs`
- Modify: `lib/supabase/auth.ts`
- Modify: `tests/rendered-html.test.mjs`

**Interfaces:**
- Consumes: verified user, profile flag, public browser credentials, and Edge runtime-only URL/publishable/service credentials.
- Produces: `validateNewPassword`, `getProductUser`, `requireProductUser`, the change-password page, and local-only `change-temporary-password` Edge Function.

- [ ] **Step 1: Write and run failing password-policy tests**

Use literal cases for fewer than 12 characters, missing uppercase/lowercase/digit/symbol, containing normalized email local-part, matching the temporary password, and one valid value. Exact result:

```ts
type PasswordValidation =
  | { ok: true }
  | { ok: false; code: "length" | "complexity" | "email" | "unchanged" };
```

```bash
npm run test:unit -- tests/password-policy.test.ts
```

Expected: FAIL because `lib/account/password.ts` is absent.

- [ ] **Step 2: Implement the pure validator and run GREEN**

Implement `validateNewPassword({ password, email, temporaryPassword })` with no logging or side effects. Rerun Step 1; expect PASS.

- [ ] **Step 3: Write and run failing first-login boundary tests**

Cover: unauthenticated safe login redirect; flagged profile redirect from any product route to `/account/change-password`; no loop on the change-password route; unflagged verified user returned; missing profile fails closed with a generic application error.

```bash
npm run test:unit -- tests/first-login-boundary.test.ts
```

Expected: FAIL because product-user helpers are absent.

- [ ] **Step 4: Implement verified product-user helpers and run GREEN**

Preserve current `getCurrentUser()` behavior and add:

```ts
export type ProductUser = { user: User; requiresPasswordChange: boolean };
export async function getProductUser(next: string): Promise<ProductUser | null>;
export async function requireProductUser(next: string): Promise<ProductUser>;
```

After `auth.getUser()`, read `profiles.requires_password_change` with the authenticated server client. Validate `next` with the existing return-path helper. Never use user metadata for this flag. Rerun boundary tests; expect PASS.

- [ ] **Step 5: Write and run failing Edge handler tests**

`tests/change-password-edge.test.mjs` imports an exported handler factory and covers POST-only, origin allow-list, missing/invalid Bearer token, invalid current temporary password, unchanged new password, validation failure, Admin API update failure, profile-clear failure, and success. Assert observable HTTP status/generic JSON, never mock existence.

```bash
node --test tests/change-password-edge.test.mjs
```

Expected: FAIL because the function is absent.

- [ ] **Step 6: Implement the local-only Edge Function and run GREEN**

Pin dependencies in `deno.json`. Export `createChangeTemporaryPasswordHandler(deps)` and call `Deno.serve()` only under `import.meta.main`. The request carries `currentTemporaryPassword` and `newPassword` over HTTPS. Verify the Bearer caller with a JWT-scoped client and `auth.getUser()`, verify the current password with a separate non-persisting `signInWithPassword({ email: user.email, password: currentTemporaryPassword })` client, reject equality, validate the new password, use a service client only to call `auth.admin.updateUserById(user.id, { password: newPassword })`, then clear only that profile flag. Never return/log upstream errors, credentials, sessions, or password values. Use `ALLOWED_ORIGINS` and generic Vietnamese codes. Rerun Step 5; expect PASS.

- [ ] **Step 7: Build the accessible page/form and extend render contracts**

The server page calls `requireProductUser("/account/change-password")`. The form keeps the temporary password only in component memory, collects new/confirmation values, retrieves the current access token, sends current/new passwords once to the Edge Function, clears every field, refreshes the session, and redirects to `/` after success. Use `autocomplete="current-password"` and `autocomplete="new-password"`; disabled/loading and generic Vietnamese errors are mandatory. Add a real rendered/source boundary proving no `SUPABASE_SERVICE_ROLE_KEY` reaches browser code.

- [ ] **Step 8: Verify and commit**

```bash
npm run test:unit -- tests/password-policy.test.ts tests/first-login-boundary.test.ts
node --test tests/change-password-edge.test.mjs
npm test
npx eslint lib/account/password.ts lib/supabase/auth.ts app/account/change-password tests/password-policy.test.ts tests/first-login-boundary.test.ts
git diff --check
git add lib/account lib/supabase/auth.ts app/account/change-password supabase/functions/change-temporary-password tests/password-policy.test.ts tests/first-login-boundary.test.ts tests/change-password-edge.test.mjs tests/rendered-html.test.mjs
git commit -m "feat: require temporary password replacement"
```

---

### Task 4: Add first-team setup and team-scoped server routes

**Files:**
- Create: `lib/teams/slug.ts`
- Create: `app/setup/team/page.tsx`
- Create: `app/setup/team/team-setup-form.tsx`
- Create: `app/api/teams/route.ts`
- Create: `app/teams/[slug]/layout.tsx`
- Create: `app/teams/[slug]/overview/page.tsx`
- Create: `app/teams/[slug]/squad/page.tsx`
- Create: `app/teams/[slug]/matches/page.tsx`
- Create: `app/teams/[slug]/funds/page.tsx`
- Create: `app/teams/[slug]/admin/settings/page.tsx`
- Create: `app/components/team-placeholder.tsx`
- Create: `tests/team-slug.test.ts`
- Create: `tests/team-route-boundary.test.ts`
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: product-user guard, team list/access guard, existing bootstrap trigger, and the reviewed plain-insert-then-select workaround.
- Produces: normalized slug helpers, authenticated team-create API, setup flow, root team redirect, and permission-protected route skeletons.

- [ ] **Step 1: Write and run failing slug tests**

Cover Vietnamese diacritics, repeated separators, uppercase, leading/trailing punctuation, empty output, 48-character limit, and reserved `setup`, `account`, `api`, `login`, `auth`.

```ts
assert.equal(normalizeTeamSlug("  Đội Bóng Số 7  "), "doi-bong-so-7");
assert.equal(normalizeTeamSlug("---FC---DUKE---"), "fc-duke");
```

```bash
npm run test:unit -- tests/team-slug.test.ts
```

Expected: FAIL because the helper is absent. Implement `normalizeTeamSlug`/`validateTeamSlug`, rerun, expect PASS.

- [ ] **Step 2: Write and run failing API behavior tests**

Test exported `createTeamHandler(request, deps)` with complete doubles: unauthenticated 401, password-change 403, invalid name/slug 422, duplicate 409, insert failure generic 500, success 201. The success double must reject `.insert().select()`/`RETURNING`; allow plain insert followed by an independent select after bootstrap.

```bash
npm run test:unit -- tests/team-route-boundary.test.ts
```

Expected: FAIL because the route is absent.

- [ ] **Step 3: Implement authenticated team creation and run GREEN**

Accept only `{ name, slug? }`; derive/validate slug; get verified product user; plain-insert only `name` and `slug`; select by slug after bootstrap. Never accept owner, role, permissions, IDs, or timestamps. Return only `{ team: { id, name, slug } }` with bounded Vietnamese errors. Rerun Step 2; expect PASS.

- [ ] **Step 4: Add setup UI and root entry behavior**

`app/page.tsx` calls `requireProductUser("/")`, then `listUserTeams(user.id)`, redirects no-team users to `/setup/team`, otherwise redirects to the encoded first team slug overview. Setup form posts to `/api/teams`, handles duplicate/validation errors, and redirects on 201.

- [ ] **Step 5: Add permission-protected server route skeletons**

Use `params: Promise<{ slug: string }>` and exact permissions:

```txt
overview -> team.read
squad -> players.read
matches -> matches.read
funds -> finance.read
admin/settings -> settings.read
```

Render `TeamPlaceholder` with real team/role and an honest pending-slice empty state. Member funds/settings attempts must not render protected content.

- [ ] **Step 6: Extend behavior tests, verify, and commit**

Add root redirect, no-team, exact route-permission, and member-denial cases through injected behaviors rather than source grep.

```bash
npm run test:unit -- tests/team-slug.test.ts tests/team-route-boundary.test.ts tests/team-context.test.ts tests/team-permissions.test.ts
npm test
npx eslint lib/teams app/setup/team app/api/teams app/teams app/components/team-placeholder.tsx tests/team-slug.test.ts tests/team-route-boundary.test.ts
git diff --check
git add app/page.tsx app/setup app/api/teams app/teams app/components/team-placeholder.tsx lib/teams/slug.ts tests/team-slug.test.ts tests/team-route-boundary.test.ts
git commit -m "feat: add team-scoped product routes"
```

---

### Task 5: Make navigation route-aware and permission-aware

**Files:**
- Create: `app/components/product-shell.tsx`
- Create: `app/components/product-nav.tsx`
- Create: `app/components/account-menu.tsx`
- Create: `tests/product-navigation.test.ts`
- Modify: `app/teams/[slug]/layout.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: serialized `TeamAccessContext`, `hasPermission`, real team/role values, and existing Supabase logout.
- Produces: `ProductShell`, desktop/mobile `ProductNav`, authorized route links, theme toggle, account/profile/logout controls, and a reusable layout for later slices.

- [ ] **Step 1: Write and run failing navigation tests**

Render real components with literal Member/Admin contexts and assert links/hrefs, not mock calls:

```txt
Member: overview, squad, matches; no funds or admin settings.
Admin: overview, squad, matches, funds, admin settings.
Tactics: omitted until a real match ID exists.
```

All hrefs must begin `/teams/<encoded slug>/`; active links use `aria-current="page"`; desktop/mobile expose identical authorized destinations.

```bash
npm run test:unit -- tests/product-navigation.test.ts
```

Expected: FAIL because components are absent.

- [ ] **Step 2: Implement shell/navigation and run GREEN**

`ProductNav` accepts only:

```ts
type ProductNavProps = {
  team: TeamAccessContext["team"];
  roleName: string;
  permissions: readonly PermissionCode[];
  currentPath: string;
  mobile?: boolean;
};
```

Use real links and construct Funds/Admin items only when authorized. Preserve accessible labels, responsive black/white/red light/dark styles, and verified logout. Rerun Step 1; expect PASS.

- [ ] **Step 3: Wire the shared team layout**

Load one context for the verified user and pass real team/role data to `ProductShell`. Never display `FC Spartans` or `Coach Miller` unless returned by the database. Render child pages within the shell.

- [ ] **Step 4: Verify and commit**

```bash
npm run test:unit -- tests/product-navigation.test.ts tests/team-route-boundary.test.ts
npm test
npx eslint app/components/product-shell.tsx app/components/product-nav.tsx app/components/account-menu.tsx app/teams/[slug]/layout.tsx tests/product-navigation.test.ts
git diff --check
git add app/components app/teams/[slug]/layout.tsx app/globals.css tests/product-navigation.test.ts tests/rendered-html.test.mjs
git commit -m "feat: add permission-aware product shell"
```

---

### Task 6: Verify and hand off the complete foundation slice

**Files:**
- Create: `docs/pro7-foundation-handoff.md`
- Modify: `docs/superpowers/plans/2026-08-25-pro7-foundation-routing-rbac.md`

**Interfaces:**
- Consumes: Tasks 1-5, current localhost/browser session, and existing core handoff.
- Produces: clean local evidence and an exact remote authorization checkpoint. It performs no remote apply/deploy.

- [ ] **Step 1: Run the clean local gate**

Record an empty `git status --short`, then run:

```bash
npm run test:unit
npm test
node --test tests/supabase-schema.test.mjs tests/supabase-rls-mutation-visibility.test.mjs tests/supabase-foundation-schema.test.mjs
git diff --check
```

Record exact pass/failure counts and keep unrelated baseline lint/typecheck findings separate.

- [ ] **Step 2: Re-run PostgreSQL 17 verification**

Apply core, pending RLS, and foundation migrations to a fresh temporary database; run both rollback verifiers; record assertion counts, explicit `ROLLBACK`, and zero fixtures. Do not run remote SQL.

- [ ] **Step 3: Run localhost browser QA**

Check desktop and 390x844 mobile, light/dark, root no-team redirect, setup validation, authorized overview after a controlled local fixture, Member denial of funds/settings, logout, first-login redirect, console errors/warnings, and horizontal overflow.

- [ ] **Step 4: Document the checkpoint**

`docs/pro7-foundation-handoff.md` must list exact commits/migration filenames/hashes; local DB/test/build/browser evidence; pending remote operations (RLS correction, foundation migration, remote type regeneration, Edge deployment/secrets); required secret names without values; and the next squad/account-provisioning plan. It must not claim remote behavior changed.

- [ ] **Step 5: Mark checkboxes accurately and commit**

```bash
git add docs/pro7-foundation-handoff.md docs/superpowers/plans/2026-08-25-pro7-foundation-routing-rbac.md
git commit -m "docs: hand off PRO7 foundation slice"
```

- [ ] **Step 6: Complete SDD review gates**

Run per-task reviews throughout, then generate the whole-plan review package. Resolve Critical/Important findings through the single final-fix wave and one scoped re-review. Keep all remote operations pending even when local review is clean.
