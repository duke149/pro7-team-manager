# PRO7 Username Auth and Roster Provisioning Design

**Date:** 2026-08-26  
**Status:** Approved in chat; awaiting written-spec review  
**Project:** Supabase `pficsujapinkmqsyvcfw` / team slug `pro7-fc`

## Goal

Provision the approved 23-player roster as real Supabase Auth users and active
team members, let players sign in with a short username instead of an internal
email address, preserve relevant demo-user identities and history, and enforce
the existing mandatory first-login password replacement boundary.

This change does not invent shirt numbers, positions, dates of birth, body
measurements, avatars, or other player facts. Players or the Owner will fill
those fields later through the existing profile and Squad CRUD interfaces.

## Decisions

- The Login form accepts either a normal email address or a PRO7 username.
- A normalized username is mapped deterministically to
  `<username>@pro7.test` before calling Supabase Auth.
- Usernames are lowercase ASCII letters and digits, 3–32 characters, with no
  whitespace or punctuation. Every approved roster username already satisfies
  this rule.
- The temporary password is `<username>@123`.
- Every roster user has `profiles.requires_password_change = true` after the
  import. Team routes remain unavailable until a strong replacement password
  is successfully committed by the existing first-login flow.
- `pro7.demo.20260825@gmail.com` remains the canonical Owner. Its Auth email,
  password, user ID, and Owner membership are not changed by this roster import.
- Lê Anh Đức (`duclee`), Lê Tuấn Đạt (`datlt`), and Lê Thành Hưng (`hunglt`)
  receive the system Admin role. The other 20 roster users receive Member.
- Captain and vice-captain are operational labels for this import; they do not
  create new roles or permission codes.
- The old Phi Hùng demo membership is deactivated, not deleted. Its Auth user
  and historical rows remain intact.
- Existing user IDs are preserved for Đức Lee, Tuấn Đạt, and Trung Hiếu so
  their attendance, notification, tactics, and audit relationships survive.

## Approved Roster

| Display name | Username | Internal Auth email | Role |
|---|---|---|---|
| Lê Thành Hưng | `hunglt` | `hunglt@pro7.test` | Admin |
| Bùi Hữu Quyền | `quyenbh` | `quyenbh@pro7.test` | Member |
| Bùi Kiên | `buikien` | `buikien@pro7.test` | Member |
| Danh Tuấn | `danhtuan` | `danhtuan@pro7.test` | Member |
| Lê Tuấn Đạt | `datlt` | `datlt@pro7.test` | Admin / vice-captain |
| Lê Anh Đức | `duclee` | `duclee@pro7.test` | Admin / captain |
| Đức Mạnh | `ducmanh` | `ducmanh@pro7.test` | Member |
| Gia Khải | `giakhai` | `giakhai@pro7.test` | Member |
| Nguyễn Hùng | `nguyenhung` | `nguyenhung@pro7.test` | Member |
| Huy Lê | `lehuy` | `lehuy@pro7.test` | Member |
| Tùng Lê | `tunglk` | `tunglk@pro7.test` | Member |
| Kim Sơn | `kimson` | `kimson@pro7.test` | Member |
| Lê Trung Hiếu | `hieult` | `hieult@pro7.test` | Member |
| Lương Đức Việt | `vietld` | `vietld@pro7.test` | Member |
| Minh Lưu | `luuminh` | `luuminh@pro7.test` | Member |
| Minh Phong | `minhphong` | `minhphong@pro7.test` | Member |
| Nguyễn Công Hiếu | `hieunc` | `hieunc@pro7.test` | Member |
| Nguyễn Hữu Toàn | `toannh` | `toannh@pro7.test` | Member |
| Nguyễn Minh Quân | `quannm` | `quannm@pro7.test` | Member |
| Nguyễn Phú Thành | `thanhnp` | `thanhnp@pro7.test` | Member |
| Nguyễn Quang Minh | `minhnq` | `minhnq@pro7.test` | Member |
| Trần Lê Anh | `anhlt` | `anhlt@pro7.test` | Member |
| Long Vũ | `vulong` | `vulong@pro7.test` | Member |

The password for each row is `<username>@123`. Credentials are never written
to tracked files, application logs, audit JSON, URLs, browser storage, or a
database application column. They are delivered to the Owner once after all
verification succeeds.

## Existing Identity Reconciliation

The importer reconciles these exact identities before creating new users:

| Existing Auth email | New Auth email | New display name | Role action |
|---|---|---|---|
| `duc.lee.pro7@example.com` | `duclee@pro7.test` | Lê Anh Đức | Member → Admin |
| `tuan.dat.pro7@example.com` | `datlt@pro7.test` | Lê Tuấn Đạt | Member → Admin |
| `trung.hieu.pro7@example.com` | `hieult@pro7.test` | Lê Trung Hiếu | keep Member |

`phi.hung.pro7@example.com` is not reused for Nguyễn Hùng because those are
different people. Its membership becomes inactive. No Auth user or historical
row is hard-deleted.

The importer must abort before mutation if any target internal email already
belongs to an unexpected Auth user, if a target username is duplicated, if the
canonical system roles are missing or ambiguous, or if the three legacy users
cannot be identified exactly.

## Login Boundary

A focused, pure normalization helper accepts the user's login identifier:

1. Trim surrounding whitespace.
2. If it contains `@`, normalize it as the existing email flow does.
3. Otherwise lowercase it, require the username contract, and append
   `@pro7.test`.
4. Keep the submitted username in the visible field after a failed sign-in;
   never replace it with the internal email.
5. Preserve the existing generic Vietnamese invalid-credential response so the
   mapping does not add account enumeration.

The password field, show/hide control, Forgot Password link, safe `next` path,
loading state, and Supabase SSR session flow remain unchanged. Password reset
email is not presented as a usable delivery path for `@pro7.test` accounts;
players change the temporary password through the mandatory authenticated
first-login route.

## Provisioning and Migration Flow

### Phase 1: read-only preflight

- Confirm the exact project, team, Owner, system Admin/Member roles, and current
  active memberships.
- Confirm all 23 usernames and internal emails are unique.
- Confirm the three reusable demo identities and the one membership to
  deactivate.
- Confirm no unrelated Auth email collision and no duplicate active team-player
  relation.
- Confirm the application migrations, Edge Functions, and first-login boundary
  required by this flow are available.

### Phase 2: application change

- Add username-or-email normalization to the Login boundary with TDD coverage.
- Update labels and autocomplete help without changing the established PRO7
  black/white/red composition.
- Add a non-secret roster manifest containing only display name, username, and
  intended role. Password values must be derived in memory, never committed.
- Add preflight and post-apply verification contracts that fail closed on any
  identity, membership, or role mismatch.

### Phase 3: Auth Admin mutation

- Use Supabase Auth Admin APIs through an authenticated administrative channel;
  never update `auth.users.encrypted_password` directly.
- Update the three reusable Auth users in place with the new internal email,
  confirmed-email state, and temporary password.
- Create the other 20 Auth users with confirmed internal emails and temporary
  passwords.
- If attaching a newly created user fails, compensate only that newly created
  Auth user. Never delete or replace a pre-existing Auth user as compensation.
- Treat ambiguous Auth Admin responses as a hard stop requiring read-only
  reconciliation before retrying.

### Phase 4: application-data mutation

- Upsert only the approved display name and mandatory password-change flag in
  `profiles`; retain unrelated user-owned profile fields on reused identities.
- Attach new users using the reviewed service-authorized team attachment
  boundary or an equivalently narrow transactional import contract.
- Reassign the two reused captain identities to Admin, retain Hiếu as Member,
  and deactivate the old Phi Hùng membership.
- Preserve canonical Owner invariants, same-team role constraints, system-role
  immutability, and the Owner-only `team.delete` rule.
- Record bounded audit events for role changes and membership deactivation,
  excluding passwords and secret keys.

### Phase 5: verification and credential handoff

- Verify every username/password against Supabase sign-in, sign each verification
  session out, and verify `requires_password_change = true` remains set.
- Verify team membership totals: one Owner plus 23 active roster users; within
  the roster, exactly three Admin and twenty Member.
- Verify Phi Hùng is inactive and the three migrated users retain their original
  UUIDs and relationship counts.
- In the browser, verify one Admin and one Member first-login flow, password
  replacement, route guards, notifications, match RSVP, and role-aware nav.
- Verify Admin mobile bottom nav has five items including Funds with no overflow
  at 320, 375, and 414 px; verify Member has four items and no Funds/Settings.
- Deliver the username/password table once to the Owner only after all checks
  pass. The handoff must remind the Owner that these predictable temporary
  passwords should be distributed privately and changed immediately.

## Failure Handling and Rollback

- No mutation starts unless preflight is completely green.
- New-user creation is compensating: a just-created Auth user is removed if its
  application attachment fails and the removal result is verified.
- Existing identities are never deleted. On a partial update, stop, reconcile
  exact Auth and database state, and finish or manually remediate the named row;
  do not blindly replay the full batch.
- Database membership/profile/role changes run in an explicit transaction where
  possible and roll back together on any invariant failure.
- Credential handoff is withheld until post-apply checks prove a complete,
  internally consistent roster.
- The old Phi Hùng membership can be restored to active if the Owner later says
  it should remain; historical data is never removed.

## Security Notes

`<username>@123` is intentionally predictable and is accepted only because the
Owner explicitly chose it for temporary onboarding. The protection is the
mandatory first-login boundary, not password entropy. The import must be
performed immediately before private credential distribution, and every player
must replace the temporary password promptly. A player who has not changed it
remains a takeover risk, so the Owner should track completion and deactivate
stale onboarding accounts if necessary.

No `service_role`, secret key, access token, password hash, raw session, or
temporary password list may be printed by implementation tools or committed.

## Acceptance Criteria

1. All 23 approved usernames sign in through the Login username path.
2. All 23 are blocked at first login until setting a strong new password.
3. The three approved Admins have Admin routes and permissions; all other roster
   users have Member-only routes and permissions.
4. The Owner remains canonical and unchanged.
5. The three reused demo identities retain their UUIDs and historical links.
6. Phi Hùng is inactive without data deletion.
7. No invented profile details, duplicate active memberships, Auth email
   collisions, secret leakage, or partial-success roster is accepted.
8. Admin and Member browser checks pass in desktop, tablet, and mobile layouts,
   including the five-item Admin bottom navigation.
