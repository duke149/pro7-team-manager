# PRO7 Full MVP CRUD Design

## Objective

Turn the existing PRO7 Team Manager prototype into a usable, team-scoped MVP backed by Supabase. Preserve the established black, white, and red visual system while replacing mock data one vertical slice at a time with authenticated CRUD, role-based routes, match attendance, in-app notifications, Web Push, tactics, finance, and admin settings.

This design extends the reviewed Supabase MVP core. It does not amend migration history already applied to project `pficsujapinkmqsyvcfw`; all schema changes remain additive and require explicit remote authorization before apply.

## Approved product decisions

- Implement end-to-end vertical slices rather than table-by-table UI or a second mock-only frontend pass.
- The hosted PRO7 frontend at `https://pro7-team-manager.duke149-work.chatgpt.site` and the checked-in `app/pro7-app.tsx`/`app/globals.css` prototype are the visual and interaction source of truth. Backend, database, routing, authentication, and authorization work must preserve that shell, layout, responsive behavior, labels, buttons, and black/white/red styling. The simplified foundation `ProductShell` and route placeholders are temporary infrastructure, not an approved redesign.
- Replace mock values behind the existing UI one vertical slice at a time. Existing controls keep their placement and intent; permission checks may hide or disable an unauthorized control, and honest loading/empty/error states may replace mock content, but no slice may substitute a visually unrelated page.
- Admin creates member accounts directly; team-membership invitations are deferred.
- A trusted Supabase Edge Function creates the Auth user, confirms the email, assigns membership and returns a generated temporary password exactly once.
- A newly provisioned member must change the temporary password before accessing team routes.
- Match invitations target all active members by default; Admin can deselect individual members before sending.
- Match attendance states are `pending`, `available`, and `unavailable`. A member may attach a short note.
- Match invitations create an in-app notification and attempt Web Push. Push delivery failure never invalidates the in-app invitation.
- Web Push uses the current web/PWA application and VAPID. Native push and third-party push providers are deferred.
- Funds and Admin Settings are Admin/Owner-only surfaces.
- Members may update only their own personal profile, avatar, physical attributes, contact information, and preferred positions. Team role, shirt number, official position, membership status, finance data, and other members remain Admin-managed.

## Current-state audit

The authenticated Supabase login/logout boundary works. The dashboard still renders one client component at `/`, and all business modules are mock-backed:

- Overview navigation works, but the next match, attendance, statistics, news, and calendar are hard-coded.
- Squad search and position filters work in local component state. Sorting, details, persistence, and CRUD are absent; the add-player modal only emits a toast.
- Match RSVP changes local state only. Recent-match analysis and upcoming fixtures are hard-coded.
- Tactics formation/mode controls use local state. Dragging, drafts, and apply actions are not persisted.
- Funds data is hard-coded. Expense/payment forms only emit toasts, and members are not denied access.
- Settings has no route or screen.
- Business navigation is component state rather than real routes, so server-enforced path authorization is absent.

Mock data must remain only until the corresponding slice has loading, empty, error, and authorized data states.

## Delivery decomposition

1. Team-scoped routes, permission guards, first-login password change, and role-aware navigation.
2. Squad CRUD, Admin account provisioning, member self-service profile, and avatar storage.
3. Match CRUD, attendance invitations, in-app notifications, Supabase Realtime, and Web Push.
4. Overview aggregates, match analysis/statistics, team news, and calendar.
5. Match tactics, lineup slots, bench, drafts, and applied read-only views.
6. Admin-only finance and Admin Settings.
7. Whole-MVP role, database, browser, and advisor verification.

## Route architecture

Team business routes use the globally unique team slug:

- `/teams/[slug]/overview`
- `/teams/[slug]/squad`
- `/teams/[slug]/squad/[userId]`
- `/teams/[slug]/matches`
- `/teams/[slug]/matches/[matchId]`
- `/teams/[slug]/tactics/[matchId]`
- `/teams/[slug]/funds`
- `/teams/[slug]/admin/settings`
- `/account/profile`
- `/account/change-password`

`/` resolves the verified user, redirects users requiring a password change, and otherwise redirects to the most recently used authorized team or the first team membership. A user with no memberships gets a safe empty state rather than mock team data.

Every team route loads identity, team, membership, and effective permissions on the server before rendering. Hiding a navigation item is an additional UX measure, never the authorization boundary. RLS, explicit object/column grants, narrow RPCs, Storage policies, and Edge Function caller checks remain authoritative.

## Authorization model

### Existing permissions retained

- `team.read`, `team.update`, `team.delete`
- `members.read`, `members.invite`, `members.manage`
- `roles.read`, `roles.manage`
- `settings.read`, `settings.update`

Membership-invitation creation remains deferred, so `members.invite` is not exposed through a UI in this delivery.

### New permissions

- `players.read`, `players.manage`
- `matches.read`, `matches.manage`, `matches.respond`
- `tactics.read`, `tactics.manage`
- `news.read`, `news.manage`
- `finance.read`, `finance.manage`

Notifications and push subscriptions use own-user RLS rather than team role permissions.

### System roles

- Owner receives all permissions.
- Admin receives all permissions except `team.delete`.
- Member receives `team.read`, `members.read`, `roles.read`, `players.read`, `matches.read`, `matches.respond`, `tactics.read`, and `news.read`.
- Member no longer receives `settings.read`; settings is an Admin/Owner-only surface in the approved product model.

Custom roles remain supported. Canonical ownership, system-role immutability, same-team role assignment, and the owner-only `team.delete` rule from the core design remain unchanged.

### Route access

| Route | Minimum permission |
| --- | --- |
| Overview | `team.read` |
| Squad list/detail | `players.read` |
| Squad mutations/account provisioning | `players.manage` plus `members.manage` where membership changes |
| Match list/detail | `matches.read` |
| Own attendance response | `matches.respond` plus own-row RLS |
| Match creation/edit/invite/analysis | `matches.manage` |
| Applied tactics | `tactics.read` |
| Tactics edit/apply | `tactics.manage` |
| Funds | `finance.read`; all mutations require `finance.manage` |
| Admin Settings | `settings.read`; mutations require `settings.update` or the narrower role/team permissions |

Unauthorized routes return a safe not-found/forbidden boundary without rendering protected data. Mutating functions independently re-check authorization.

## Data model

### Existing tables extended

`profiles` remains global and keyed by `auth.users.id`. Add bounded personal fields: phone, date of birth, height, weight, preferred positions, avatar path, and `requires_password_change`. Authenticated users may update only their own presentation/personal columns. They cannot clear `requires_password_change` directly.

`memberships` gains an active/inactive lifecycle and update timestamps. Removing a player from a team deactivates the membership; it does not delete the Auth user because one account may belong to multiple teams.

`team_settings` remains the bounded settings object for non-secret team configuration. Push private keys never enter this table.

### New tables

#### `team_player_profiles`

One row per membership, keyed by `(team_id, user_id)`. Holds team-controlled shirt number, official position, player status, join date, and Admin notes. Same-team composite foreign keys bind it to membership. Admin/Owner may mutate it; members may read allowed fields but never Admin notes.

#### `matches`

Team-scoped fixture/result records with opponent, start time, venue, home/away, RSVP deadline, status (`scheduled`, `completed`, `cancelled`), scores, and timestamps. Completed matches are immutable except through an explicitly audited correction path; scheduled matches are cancelled rather than hard-deleted after invitations exist.

#### `match_attendance`

Keyed by `(match_id, user_id)` and redundantly bound to `team_id` for tenant policies. Stores `pending`, `available`, or `unavailable`, an optional bounded note, response timestamp, invitation timestamp, and who created or last administratively overrode the row. Members update only their own response/note; `matches.manage` may create rows, remind pending users, and record an audited override.

#### `match_events`

Ordered, team/match-scoped timeline events for goals, cards, substitutions, and notes. Admin manages events; authorized team members read them.

#### `match_player_stats`

One row per match/player with minutes, goals, assists, rating, and MVP flag. Aggregate queries supply top scorer and player summaries. Admin manages completed-match stats; members read.

#### `match_team_stats`

One row per match with bounded team/opponent comparison metrics used by recent-match analysis. The initial metrics are possession, shots, shots on target, and corners; the JSON payload is schema-versioned and size-bounded.

#### `notifications`

Own-user notifications with team, type, title, body, local target path, read timestamp, and source entity. Match invitations use a unique source/user key so retrying an invite does not create duplicates. Users select/update only their own rows; trusted match workflows insert.

#### `push_subscriptions`

One row per user/device subscription with endpoint hash, encrypted browser subscription material, timestamps, and failure count. Users manage only their own subscriptions. Delivery code never returns another user's endpoint or key material.

#### `team_news`

Team-scoped posts with title, bounded body, status, publish time, author, and timestamps. Admin manages; authorized members read published posts.

#### `match_tactics`

One draft/applied tactics record per match and mode, with formation, instructions, pressing intensity, defensive-line setting, version, status, and timestamps. Admin manages drafts/applied versions. Members read applied versions only.

#### `lineup_slots`

Relational assignment of a team member to an applied/draft tactic with starter/bench status, role label, shirt number snapshot, and bounded normalized pitch coordinates. Unique constraints prevent one player or one slot appearing twice in a tactic.

#### `finance_entries`

Team-scoped income/expense records with amount in integer VND, category, occurred date, description, actor, void metadata, and timestamps. Records are voided with a reason rather than deleted. Only `finance.read/manage` roles can access them.

#### `member_dues`

Team/member/period dues with amount, due date, payment state, finance-entry reference, and timestamps. Admin manages; the Admin-only funds route aggregates paid/pending totals.

## Trusted account-provisioning flow

The browser never receives a service-role or secret key. A Supabase Edge Function performs Admin member creation:

1. Validate the caller's Supabase JWT with `getUser()`.
2. Validate normalized email and bounded member fields.
3. Prove current `members.manage` and `players.manage` authority for the target team using the caller's authorization context.
4. Reject owner-role assignment, cross-team roles, duplicate active membership, and unsafe custom roles.
5. Generate a high-entropy temporary password in the function.
6. Use the server-only Admin API to create and email-confirm the Auth user with non-authoritative presentation metadata.
7. Create membership, global profile defaults, and team-player profile through a narrow transactional database RPC.
8. If database attachment fails after Auth creation, delete the newly created Auth user as a compensating action and return a generic failure.
9. Return the temporary password exactly once over the authorized response; never store, log, audit, or resend it.

Existing Auth users are attached without resetting their password. A duplicate email response must not reveal whether an unrelated account exists beyond what the authorized Admin workflow needs.

The first-login guard checks `profiles.requires_password_change`. `/account/change-password` calls a second trusted Edge Function that verifies the current user, updates the password through the Admin API, and clears the flag only after success. Team routes stay blocked until the flag is false.

## Match invitation, notification, and push flow

1. Admin creates or updates a scheduled match.
2. The invite panel loads all active memberships selected by default; Admin may deselect individual users.
3. A narrow, idempotent RPC creates or refreshes `match_attendance` rows and own-user `notifications` in one transaction.
4. The calling Edge Function attempts Web Push for each active subscription and records bounded delivery outcomes. Database invitation success is not rolled back when push delivery fails.
5. The service worker opens the validated local match-detail path when a notification is clicked.
6. Members respond `available` or `unavailable` and may change the response until the RSVP deadline. Admin override remains possible and audited.
7. Supabase Realtime updates the match detail, Admin attendance panel, notification badge, and Overview availability aggregate. A normal refetch remains the fallback when Realtime is unavailable.

Push UI explicitly distinguishes unsupported browser, permission not requested, permission denied, subscribed, and expired subscription states. HTTP is used only for loopback development; production Web Push requires HTTPS. VAPID private material is stored only in Edge Function secrets.

## Screen behavior

### Overview

- Load the next scheduled match, countdown, attendance counts, latest completed-match form, top scorer, published news, and upcoming team calendar.
- `Chốt đội hình` opens tactics for the next match; `Chi tiết trận` opens its match route.
- Admin can remind pending members. Members only see their own RSVP action and authorized aggregates.
- Statistics show an honest empty state until completed results/stats exist.

### Squad

- Server-backed search, position/status filters, and sorting by name, shirt number, position, join date, or status.
- Player card opens a detail route/drawer.
- Admin creates accounts, edits team-player data, changes eligible non-owner roles, and deactivates membership.
- Member can edit only their own global profile, avatar, contact fields, physical attributes, and preferred positions.
- Avatar upload uses a private Supabase Storage bucket with owner-path policies and signed/authenticated reads.

### Matches

- Admin creates, edits, cancels, completes, and analyses matches.
- Invite selection defaults to all active members.
- Member sees only their own RSVP controls but may see team attendance aggregates allowed by the product.
- Recent-match analysis is driven by result, events, player stats, and team stats.
- Upcoming fixtures and Overview calendar use the same `matches` source.

### Tactics

- Admin drags active members between starter slots, pitch positions, and bench; saves drafts and applies a version to a match.
- Applying validates seven unique starters, a goalkeeper, same-team active memberships, and no duplicate player assignment.
- Member receives a read-only applied lineup. Drafts remain Admin-only.

### Funds

- Route and navigation are absent for members.
- Admin records income/expense, member dues, payment links, and void reasons.
- Balance and monthly summaries are derived from non-void entries; no client-provided balance is trusted.

### Admin Settings

- Team presentation/settings, role and permission management, Admin membership management, notification defaults, and push status.
- Canonical owner and owner membership remain immutable.
- Custom roles cannot obtain `team.delete`; assigning Admin-equivalent authority is visibly warned and audited.

## UI composition

Refactor the single `app/pro7-app.tsx` prototype into route-aware server pages and focused client islands without visually redesigning it. The hosted screens and checked-in prototype remain the parity baseline: preserve the left rail, team picker, season/account blocks, page header actions, cards, forms, typography hierarchy, spacing, labels, buttons, modal interaction, responsive navigation, and exact black/white/red visual language. Shared navigation, cards, forms, empty/loading/error states, permission helpers, and validated action results live in small modules with explicit contracts, but component extraction must not change the rendered UX. Neon colors are not introduced.

Each vertical slice gets a visual parity contract before its data work: compare the route against the hosted reference at desktop and mobile widths in light and dark modes; test the presence and order of its existing controls; and treat large layout, styling, label, or interaction drift as a blocking regression. Backend state may change the content and allowed actions, not the product identity.

Server reads compose typed Supabase queries. Mutations use validated Server Actions or narrow Edge Functions/RPCs according to privilege needs. UI components never import raw environment variables, service credentials, or authorization metadata.

## Error and concurrency behavior

- Forms return Vietnamese field-level validation and a generic operation-level error; raw SQL, tokens, subscriptions, and credentials never reach logs or UI.
- Create-member, match-invite, RSVP, finance, and apply-tactics actions reject duplicate submissions and use database uniqueness/idempotency constraints.
- Attendance updates use update timestamps/version checks to prevent stale Admin/member writes from silently overwriting a newer response.
- Empty/loading/error states replace mock data independently for each vertical slice.
- Realtime failure falls back to refetch and never blocks core CRUD.
- Push failure is recorded, increments bounded failure count, and expires invalid subscriptions without failing the in-app notification.

## Verification strategy

Each slice uses test-driven development:

1. Unit tests for validators, permission mapping, aggregates, route targets, and action-result contracts.
2. Source/render contracts for protected routes, role-aware navigation, first-login guard, service worker registration, and no secret keys in browser bundles.
3. SQL contracts for tables, constraints, indexes, grants, RLS, Storage policies, RPC hardening, audit redaction, and exact permissions.
4. Fresh PostgreSQL 17 transactional tests for Owner/Admin/Member/unrelated users, cross-tenant denial, own-profile updates, Admin-only funds/settings, RSVP ownership, tactics visibility, and void/deactivation semantics.
5. Edge Function tests for authorization, member creation compensation, password change, invite idempotency, and push partial failure.
6. Browser QA on `localhost:3000` for desktop/mobile and dark/light themes with Owner/Admin/Member sessions.
7. After explicit remote authorization: apply each reviewed additive migration once, refresh generated types, run rollback verification and cleanup counts, and rerun Supabase security/performance advisors.

Known baseline lint/typecheck issues remain separately documented and cannot be used to hide new regressions.

## Rollout and remote-change boundaries

- Never amend or rerun the applied core migration.
- The pending local RLS visibility correction remains unapplied remotely until explicitly authorized.
- Each new schema slice is a separately reviewed additive migration.
- Edge Function deployment, VAPID secret configuration, Storage bucket creation, and hosting/runtime environment changes require explicit authorization at their respective checkpoints.
- No production data is deleted to make tests pass. Remote verification fixtures are transactional or explicitly cleaned and counted.
- The existing demo Auth user and any future demo team data are identified as fixtures and never mistaken for production content.

## Deferred beyond this MVP

- Membership-by-email invitation and email delivery.
- Native iOS/Android push and third-party push providers.
- Ownership transfer.
- Automated league standings imports, advanced analytics, payment gateway integration, accounting exports, and compliance-grade audit reporting.
- Native mobile packaging; the current deliverable is responsive Web/PWA.
