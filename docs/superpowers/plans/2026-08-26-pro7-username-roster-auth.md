# PRO7 Username Auth and Roster Provisioning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let PRO7 players sign in with approved usernames and safely provision the exact 23-player roster with forced first-login password replacement.

**Architecture:** A pure normalizer maps usernames to reserved internal emails while preserving ordinary email login. A secret-free roster manifest drives a tested Auth Admin importer and an atomic database transaction for profile, membership, role, and audit data.

**Tech Stack:** TypeScript, React, Supabase Auth/Admin API, PostgreSQL 17, Node test runner, Happy DOM, Vinext.

**Spec:** `docs/superpowers/specs/2026-08-26-pro7-username-roster-auth-design.md`

## Global Constraints

- Internal emails are exactly `<username>@pro7.test`; temporary passwords are exactly `<username>@123`.
- Credentials, service keys, tokens, sessions, and password hashes are never logged or committed.
- Every roster profile ends with `requires_password_change = true`.
- Preserve the existing UUIDs for Đức Lee, Tuấn Đạt, and Trung Hiếu.
- Preserve `pro7.demo.20260825@gmail.com` and canonical Owner invariants.
- Exactly `duclee`, `datlt`, and `hunglt` receive Admin; the other 20 receive Member.
- Deactivate Phi Hùng without deleting Auth or history.
- Never write `auth.users.encrypted_password` directly.
- No remote mutation runs before a green read-only preflight.
- Preserve unrelated changes and `supabase/.temp/`.

---

### Task 1: Username-or-email Login Boundary

**Files:**
- Create: `lib/account/login-identifier.ts`
- Modify: `app/login/login-form.tsx`
- Create: `tests/login-identifier.test.ts`
- Create: `tests/login-username-mounted.test.ts`
- Create: `tests/fixtures/login-username-browser-client.ts`

**Interfaces:**
- Produces: `normalizeLoginIdentifier(input)` returning either `{ ok: true, authEmail, visibleIdentifier, kind }` or `{ ok: false, code }`.
- Consumes: existing browser Supabase client and generic sign-in error.

- [ ] **Step 1: Write pure failing tests**

```ts
assert.deepEqual(normalizeLoginIdentifier("  DucLee  "), {
  ok: true,
  authEmail: "duclee@pro7.test",
  visibleIdentifier: "DucLee",
  kind: "username",
});
assert.equal(normalizeLoginIdentifier("đức lee").ok, false);
```

Also cover 3/32-character bounds, punctuation, blank input, and preserving a normalized real email.

- [ ] **Step 2: Run RED**

Run: `npm run test:unit -- tests/login-identifier.test.ts`  
Expected: missing module.

- [ ] **Step 3: Implement the normalizer**

Normalize Unicode, trim, lowercase only the Auth identity, enforce `/^[a-z0-9]{3,32}$/u`, and export `PRO7_LOGIN_EMAIL_DOMAIN = "pro7.test"`.

- [ ] **Step 4: Write mounted failing tests**

Assert username submit calls `signInWithPassword({ email: "duclee@pro7.test", password })`; email passes through; invalid username never calls Auth; failure retains visible `DucLee`.

- [ ] **Step 5: Implement Login UI**

Use a text input labeled `Email hoặc username`, name `identifier`, autocomplete `username`, and placeholder `duclee hoặc email@example.com`. Preserve password toggle, Forgot Password, safe `next`, loading, and generic errors.

- [ ] **Step 6: Run GREEN and commit**

```bash
npm run test:unit -- tests/login-identifier.test.ts tests/login-username-mounted.test.ts tests/password-recovery-pages.test.ts
npx eslint lib/account/login-identifier.ts app/login/login-form.tsx tests/login-identifier.test.ts tests/login-username-mounted.test.ts
git diff --check
git add lib/account/login-identifier.ts app/login/login-form.tsx tests/login-identifier.test.ts tests/login-username-mounted.test.ts tests/fixtures/login-username-browser-client.ts
git commit -m "feat: support PRO7 username login"
```

---

### Task 2: Secret-free Roster Manifest

**Files:**
- Create: `lib/roster/pro7-roster.ts`
- Create: `tests/pro7-roster.test.ts`

**Interfaces:**
- Produces: immutable `PRO7_ROSTER`, `PRO7_LEGACY_RECONCILIATION`, `PRO7_INACTIVE_LEGACY_EMAIL`, and `internalEmailForUsername()`.
- Consumes: Task 1 domain constant.

- [ ] **Step 1: Write failing exact-data tests**

```ts
assert.equal(PRO7_ROSTER.length, 23);
assert.deepEqual(
  PRO7_ROSTER.filter((row) => row.role === "admin").map((row) => row.username).sort(),
  ["datlt", "duclee", "hunglt"],
);
assert.equal(new Set(PRO7_ROSTER.map((row) => row.username)).size, 23);
```

Assert 20 Members, exact display names, three legacy mappings, inactive Phi Hùng email, no password or invented profile field.

- [ ] **Step 2: Run RED**

Run: `npm run test:unit -- tests/pro7-roster.test.ts`  
Expected: missing module.

- [ ] **Step 3: Implement immutable manifest**

Use `as const satisfies readonly Pro7RosterEntry[]`; store only display name, username, and intended role. Derive internal emails.

- [ ] **Step 4: Run GREEN and commit**

```bash
npm run test:unit -- tests/pro7-roster.test.ts tests/login-identifier.test.ts
npx eslint lib/roster/pro7-roster.ts tests/pro7-roster.test.ts
git diff --check
git add lib/roster/pro7-roster.ts tests/pro7-roster.test.ts
git commit -m "feat: define PRO7 roster contract"
```

---

### Task 3: Supabase Auth Admin Importer

**Files:**
- Create: `lib/roster/auth-import.ts`
- Create: `scripts/provision-pro7-auth.mjs`
- Create: `tests/pro7-auth-import.test.ts`

**Interfaces:**
- Produces: `planAuthImport(existingUsers, roster)` and `executeAuthImport(plan, deps)`.
- Consumes: Task 2 manifest and runtime-only Supabase URL/service key.

- [ ] **Step 1: Write planning RED tests**

Cover three exact legacy ID reuses, twenty creates, target-email collision, missing/duplicate legacy identities, unrelated-user preservation, and deterministic ordering.

- [ ] **Step 2: Write execution RED tests**

Require preflight mode to make zero mutations; explicit project ref plus apply confirmation; in-place update with confirmed email/password; create with confirmed email; compensation deleting only a just-created user; hard stop on ambiguous update; output containing usernames/status only.

- [ ] **Step 3: Run RED**

Run: `npm run test:unit -- tests/pro7-auth-import.test.ts`  
Expected: missing modules.

- [ ] **Step 4: Implement dependency-injected importer**

Derive `` `${entry.username}@123` `` only inside each Auth mutation. CLI accepts only `--project-ref`, `--preflight`, `--apply`, and `--verify`; it never accepts or prints credentials.

- [ ] **Step 5: Run GREEN and commit**

```bash
npm run test:unit -- tests/pro7-auth-import.test.ts tests/pro7-roster.test.ts
npx eslint lib/roster/auth-import.ts scripts/provision-pro7-auth.mjs tests/pro7-auth-import.test.ts
git diff --check
git add lib/roster/auth-import.ts scripts/provision-pro7-auth.mjs tests/pro7-auth-import.test.ts
git commit -m "feat: add safe PRO7 Auth importer"
```

---

### Task 4: Atomic Application-data Import

**Files:**
- Create: `supabase/seed/pro7-roster-preflight.sql`
- Create: `supabase/seed/pro7-roster-apply.sql`
- Create: `tests/pro7-roster-sql-contract.test.mjs`
- Create: `tests/pro7-roster-live-verification.sql`
- Create: `tests/pro7-roster-live.test.mjs`

**Interfaces:**
- Consumes: Task 3 Auth identities and current team/role schema.
- Produces: one Owner plus 23 active roster memberships, 3 Admin/20 Member, and inactive Phi Hùng.

- [ ] **Step 1: Write static RED contracts**

Require SELECT-only preflight for exact team, Owner, system roles, legacy IDs, collisions, profile gaps, and memberships. Require apply SQL to lock targets, assert literal cardinalities, protect Owner, preserve unrelated profile fields, set password flags, attach missing users, reassign roles, deactivate Phi Hùng, and write password-free audit events.

- [ ] **Step 2: Run static RED**

Run: `node --test tests/pro7-roster-sql-contract.test.mjs`  
Expected: missing SQL artifacts.

- [ ] **Step 3: Implement preflight/apply SQL**

Use an explicit transaction and raise before commit on any unexpected count. Select users by exact internal/legacy email and never update Auth password/hash columns.

- [ ] **Step 4: Write PostgreSQL 17 behavior tests**

Fixture Owner, three legacy users, unrelated user, roles, attendance, and notifications. Assert UUID/history preservation, no Owner mutation, exact counts, no invented fields, audit redaction, collision rollback, and clean/idempotent verification.

- [ ] **Step 5: Run GREEN and commit**

```bash
node --test tests/pro7-roster-sql-contract.test.mjs tests/pro7-roster-live.test.mjs
git diff --check
git add supabase/seed/pro7-roster-preflight.sql supabase/seed/pro7-roster-apply.sql tests/pro7-roster-sql-contract.test.mjs tests/pro7-roster-live-verification.sql tests/pro7-roster-live.test.mjs
git commit -m "feat: add atomic PRO7 roster import"
```

---

### Task 5: Authorized Remote Apply

**Files:**
- Update ignored report: `.superpowers/sdd/2026-08-26-pro7-username-roster-auth/execution-report.md`

**Interfaces:**
- Consumes: Tasks 2–4 and an authenticated Supabase administrative channel.
- Produces: verified remote Auth/application roster.

- [ ] **Step 1: Run read-only remote preflight**

Execute only `pro7-roster-preflight.sql`; record counts/hashes and stop on mismatch.

- [ ] **Step 2: Establish Auth Admin safely**

Use authenticated Dashboard or a local service-key environment variable. Never paste the key into chat or echo it.

- [ ] **Step 3: Run Auth preflight/apply**

Review exact 3 updates/20 creates before explicit apply. Stop and reconcile any ambiguous result; never replay blindly.

- [ ] **Step 4: Apply database transaction and verify**

Execute `pro7-roster-apply.sql` once as DML, not a migration. Repeat read-only SQL, verify 23/23 username/password sign-ins, sign out every verification session, and confirm all password flags remain true.

Expected: 24 active memberships including Owner, roster 3 Admin/20 Member, Phi Hùng inactive, zero gaps/collisions.

---

### Task 6: Browser Acceptance and Handoff

**Files:**
- Modify: `docs/audits/2026-08-26-pro7-checklist-design-audit.md`
- Update ignored execution report.

- [ ] **Step 1: Admin browser QA**

Use `duclee`: verify first-login replacement, Overview/Squad/Matches/Tactics/Funds/Settings/notifications, and five-item bottom nav at 320/375/414 px.

- [ ] **Step 2: Member browser QA**

Use one Member: verify first-login replacement, four-item nav, no Funds/Settings, profile edit, `fc nat` notification/deep link, RSVP, and Admin response count.

- [ ] **Step 3: Full regression**

```bash
npm run test:unit
npm test
npx eslint app/login lib/account/login-identifier.ts lib/roster scripts/provision-pro7-auth.mjs tests/login-* tests/pro7-*
git diff --check
```

- [ ] **Step 4: One-time credential handoff**

Send the Owner the deterministic username/password table once, mark it temporary, and remind private distribution and immediate change. Do not persist it in a tracked file or browser storage.

- [ ] **Step 5: Commit evidence**

```bash
git add docs/audits/2026-08-26-pro7-checklist-design-audit.md
git commit -m "docs: record PRO7 roster verification"
```
