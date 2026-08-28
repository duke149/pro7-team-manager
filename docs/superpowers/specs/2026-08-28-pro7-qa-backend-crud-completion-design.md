# PRO7 QA Backend CRUD Completion Design

## Objective

Turn the frontend-oriented changes from `feature/ux-ui-improvements-qa` into production-backed PRO7 workflows without replacing the approved UI. The work removes QA scripts and inferred demo values from business paths, completes the missing server mutation boundaries, and verifies every current MVP route as Admin and Member before any production update.

This design supplements `2026-08-25-pro7-full-mvp-crud-design.md`. Existing applied Supabase migrations are immutable. Any database correction is additive, receives static and live PostgreSQL verification, and requires a separate explicit authorization before remote apply.

## Reviewed current state

The QA branch is not production-ready yet:

- The production build and focused typography, Match, Squad, and Tactics tests pass.
- The complete unit command currently discovers executable files under `scripts/`; one script signs into the real Supabase project and another browser script catches its own failure. Test discovery must never execute these files.
- The complete unit suite has a real Overview permission regression: a viewer without `matches.read` receives an interactive match-history destination.
- A real Admin password is committed in `QA_CHANGELOG.md` and multiple scripts. Active files must be scrubbed immediately and the credential must be rotated before release. Rewriting published Git history is a separate destructive operation and is not implied by this design.
- Several scripts directly mutate the real Supabase project with fixed team, match, and user identifiers. They are demonstrations, not production CRUD and not safe tests.
- Match detail fabricates team metrics when no stored metrics exist.
- Squad performance is queried from the browser, ignores query failures, and can count an RSVP response as a match appearance.
- Completed-match tactics can lose historical player names because the player pool is limited to active memberships.
- VietQR uses a hard-coded bank account and a fixed amount instead of team settings and the selected due.
- The login “Remember me” control does not affect session persistence.
- `QA_CHANGELOG.md` states that the branch has zero backend behavior changes even though query and permission behavior changed.

## Approved product and architecture decisions

- Preserve the established PRO7 page structure, component order, labels, responsive navigation, and black/white/red product identity. Data-backed empty, loading, error, permission, and stale states may replace fake content.
- Browser components submit bounded intent to same-origin application APIs. They do not call business RPCs directly and do not assemble authoritative aggregates.
- Supabase RLS, column grants, and narrow RPCs remain authoritative. Hiding a control is only a UX measure.
- Match analysis is saved as one complete snapshot in a single transaction. Events, player statistics, MVP, and team metrics cannot partially commit.
- A recorded appearance comes only from authoritative completed-match player statistics. RSVP status is attendance intent, not an appearance.
- Financial rows are append/void records. “Delete” in finance means an audited void or payment reversal, not a physical delete.
- Missing values remain visibly missing. The application never invents metrics, scores, appearances, player names, bank details, or transaction outcomes.
- Automated tests use dependency doubles or disposable PostgreSQL fixtures. They never log into or mutate the shared Supabase project.
- Live browser mutation testing uses explicitly identified test-owned rows and requires action-time authorization before changing remote data.

## Considered approaches

### 1. Server command APIs over existing narrow RPCs — selected

Use strict TypeScript validation and same-origin API boundaries, then call the existing transactional RPCs. Add only the smallest forward migration needed for a missing invariant or server-side aggregate. This preserves RLS and reuses the audited schema while removing direct browser/database coupling.

### 2. Fine-grained row CRUD for every analysis child

Expose separate create/update/delete operations for each match event and player statistic. This gives immediate row saves but creates inconsistent intermediate states, expands the authorization surface, and requires more complex conflict handling. It is not selected for the MVP.

### 3. Direct Supabase mutations from client components

Keep the QA scripts/client queries and rely on RLS alone. This is not selected because it leaks persistence details into the UI, makes cross-row workflows non-atomic, complicates validation, and already produced misleading partial/fabricated states.

## Delivery slices

### Slice 0 — secure and deterministic QA baseline

Before feature implementation:

1. Restrict Node test discovery to the tracked test directories/patterns.
2. Move retained utilities to an explicitly manual namespace or delete obsolete scripts.
3. Remove passwords, fixed test-user credentials, and mutable production identifiers from documentation and executable source.
4. Replace secrets with documented environment variable names and fail closed when absent.
5. Correct `QA_CHANGELOG.md` so it distinguishes visual changes, behavior changes, and incomplete backend work.
6. Fix the Overview permission regression and the existing whitespace/diff-check failures.
7. Record the exposed Admin credential as requiring rotation before release. Rotation is performed only with explicit remote authorization.

The baseline gate is: full tests cannot authenticate against the network even when developer credentials are present.

### Slice 1 — Match lifecycle and atomic analysis CRUD

#### Existing lifecycle retained

- Admin creates, edits, cancels, completes, and corrects a match through `manage_match`.
- Admin invites selected active members through one `invite_match_attendance` transaction.
- Members respond only for themselves through `respond_match_attendance` until the live RSVP deadline.
- Notifications and reminders remain idempotent server workflows.

#### New production analysis boundary

Add a same-origin route at:

`PUT /api/teams/[slug]/matches/[matchId]/analysis`

The request is an exact, bounded object:

- `events`: at most 200 ordered events.
- `playerStats`: at most 100 unique team members.
- `teamMetrics`: only possession, shots, shots on target, and corners.
- `expectedUpdatedAt`: the authoritative match concurrency token.

Validation rejects unknown keys, malformed UUIDs/timestamps, duplicate event ordering, duplicate players, more than one MVP, non-integer counts, invalid ratings/minutes, unsafe notes, invalid event/player relationships, and payloads over the route byte limit. Empty arrays and an empty metric object are valid and mean “analysis intentionally not recorded.”

The server re-requires `matches.manage`, binds the team ID from the verified slug, calls `manage_match_analysis` exactly once, maps database errors to stable HTTP responses, and returns the new concurrency token. The RPC continues to lock the parent match, reject non-completed matches and stale tokens, replace all analysis child rows, audit the mutation, and advance `matches.updated_at` monotonically.

#### Admin editor behavior

The completed-match page gains an Admin-only editor within the existing analysis card hierarchy:

- add, edit, reorder, and remove events;
- choose team/opponent side, event type, player and secondary player when applicable;
- edit player minutes, goals, assists, rating, and MVP;
- edit the four team/opponent metrics;
- save the entire snapshot once;
- reset unsaved changes from authoritative props.

Successful saves adopt the returned token and refresh authoritative server data. A stale response keeps the draft, explains that the match changed, and offers refresh. Members see the same read-only analysis presentation without editor controls.

The current fabricated `effectiveMetrics` fallback is removed. Missing metrics render an honest empty state.

#### Cross-record truth

- Player selectors use same-team memberships available to the historic match, not only currently active members.
- Appearance totals use player-stat rows with positive recorded minutes. Attendance alone never creates an appearance.
- The UI labels partial analysis as partial; it does not claim that an omitted event or metric is zero.
- Score corrections and analysis saves share the authoritative `matches.updated_at` concurrency token. Either mutation advances it, so a score correction invalidates an older analysis draft and an analysis save invalidates an older score form.

### Slice 2 — Squad performance and player CRUD integration

Replace the client-side multi-table fetch in `squad-view` with a server-only, bounded aggregate query or narrow read RPC. It joins completed matches to `match_player_stats` and returns per player:

- appearances;
- recent W/D/L form for appearances only;
- minutes, goals, assists, MVP count, and optional average rating;
- an explicit “not recorded” state when analysis data is absent.

The server fails the whole performance enrichment closed if data is malformed or a required page is incomplete; the card never silently substitutes zero for a query error. Search, filters, sorting, player detail, Admin official-field/role changes, deactivation, and member self-profile/avatar remain on their existing validated server boundaries.

Squad summary values are calculated from authoritative rows. Average age stays `—` until complete date-of-birth data supports a truthful calculation.

### Slice 3 — Historical tactics integrity

Scheduled tactics continue to edit active, eligible players. Completed-match tactics are read-only history for Members and editable only where the existing approved Admin correction policy permits it.

Historic lineup rendering resolves every referenced slot user through team membership/profile data including inactive memberships. A missing referenced identity is a server error or an explicit “former member” fallback backed by an existing identifier; it is never the generic fake label “Chưa cập nhật tên.” No completed tactic may silently drop a slot because the player later left the team.

Save/apply validation, seven-starter/goalkeeper invariants, version sequencing, pointer/keyboard interaction, and stale-write behavior remain unchanged.

### Slice 4 — Funds, team payment settings, and VietQR

Existing finance entry and member-due workflows remain RPC-backed:

- create income/expense;
- void an entry with a reason;
- create a member due;
- record payment;
- waive a due;
- reverse a payment with a reason.

Add a bounded `payments` object to `team_settings.settings`, writable only with `settings.update`:

- bank identifier/code;
- account number;
- account holder;
- optional transfer-prefix template.

The Admin Settings UI validates and saves these values. The mutation locks the team-settings row, checks its expected `updated_at`, merges only the `payments` key, and preserves notification and future settings keys. Parallel settings edits therefore fail stale instead of losing one another. The Funds route reads payment settings on the server. VietQR is generated only when settings are complete, from the selected pending due amount and a deterministic, bounded transfer description. If payment settings are absent, the UI shows “Chưa cấu hình tài khoản nhận quỹ” and links an authorized Admin to Settings. Members never receive the Admin-only Funds route or its bank configuration.

No QR data is hard-coded. A QR display does not mark a due paid; Admin still records the confirmed payment through the authoritative due workflow.

### Slice 5 — Overview, news, notifications, settings, and authentication completeness

#### Overview

All destinations are permission-gated. Match, tactics, funds, settings, and news controls become links only when the corresponding read permission exists. Aggregates use the same server sources as their detail routes and preserve honest empty/error states.

#### Team news

Complete Admin create/update/publish/archive behavior with a bounded same-origin API and an audited narrow RPC. Members read published items only. Draft content never enters Member Overview responses.

#### Notifications

Users list and mark only their own notifications. Match invitation and reminder creation stays in the match RPC transaction. Links are validated local team paths. Notification failures never fabricate an RSVP or roll back a successfully created invitation.

#### Admin Settings and roles

Retain team name/slug, notification defaults, audit history, deletion confirmation, and payment settings. Complete custom role create/update/delete and eligible member assignment only if the existing settings screen exposes those controls. Canonical Owner and system roles remain immutable; custom roles cannot obtain `team.delete`.

#### Login and password recovery

Show-password is presentation-only and does not log or persist the password. Forgot-password uses the existing verified recovery boundary and a canonical same-origin return path. “Remember me” must either control a real documented session lifetime or be removed; a cosmetic checkbox is prohibited. Auth error messages remain non-enumerating.

## Authorization matrix

| Capability | Owner/Admin | Member | Authority |
| --- | --- | --- | --- |
| Read match and published analysis | With `matches.read` | With `matches.read` | RLS plus server route guard |
| Create/edit/cancel/complete match | With `matches.manage` | No | `manage_match` |
| Save complete analysis snapshot | With `matches.manage` | No | `manage_match_analysis` |
| Invite/remind attendance | With `matches.manage` | No | invitation/reminder RPC |
| Respond to attendance | Own invite if `matches.respond` | Own invite if `matches.respond` | own-user binding plus RPC |
| Read Squad/performance | With `players.read` | With `players.read` | RLS plus bounded server query |
| Manage official player fields | `players.manage` and membership rule | No | `manage_team_player` |
| Edit own personal profile/avatar | Own row | Own row | own-user API and Storage policy |
| Edit/apply tactics | With `tactics.manage` | No | tactics RPC |
| Read historical applied tactics | With `tactics.read` | With `tactics.read` | RLS plus server route guard |
| Read/manage funds | `finance.read/manage` | No | route guard, RLS, finance RPC |
| Configure bank settings | With `settings.update` | No | team settings RLS/API |
| Manage news | With `news.manage` | No | news RPC |
| Read published news | With `news.read` | With `news.read` | RLS/server query |
| Read/mark notification | Own rows only | Own rows only | own-user RLS/API |

Custom roles are evaluated by permission code rather than role slug. Every mutation rechecks the exact permission even if the page already hid or showed its control.

## Error, privacy, and concurrency behavior

- API errors expose stable product codes and Vietnamese messages, never raw Supabase messages, SQL names, credentials, or private audit content.
- Unsupported media type, cross-origin requests, malformed JSON, oversized bodies, validation errors, forbidden actions, missing rows, lifecycle conflicts, stale tokens, and server failures are distinct responses.
- Mutation controls disable only while their own request is pending and reconcile to authoritative data after success.
- Stale writes never overwrite newer state. The user draft is preserved for comparison or retry after refresh.
- Client components receive only the fields needed to render. Admin notes, bank settings, role metadata, and other protected fields are not serialized to Member routes.
- Passwords, JWTs, service keys, and temporary credentials never enter source, fixtures, screenshots, logs, audit rows, or response snapshots.

## UI and design-system constraints

- No backend slice may replace the approved page with a generic dashboard, table, or form.
- Existing card order, page headings, navigation, primary actions, and black/white/red theme remain the parity baseline.
- New analysis and payment controls reuse existing form, modal, button, alert, typography, spacing, and focus styles.
- Interactive targets are at least 44 by 44 CSS pixels on touch layouts.
- Dialogs trap focus, close with Escape when safe, restore focus, and have accessible names/descriptions.
- Form errors bind to their fields with `aria-invalid` and `aria-describedby`; success messages use a polite status region.
- Light/dark, 1440px desktop, 768px tablet, and 390px mobile are mandatory checkpoints. Both Admin and Member bottom navigation are checked because their visible item counts differ.

## Verification matrix

### Automated gates

1. Secret scan of tracked files and generated test output.
2. Test-discovery contract proving `scripts/` cannot execute under the unit command.
3. Unit tests for every validator, error mapping, permission branch, malformed row, bounded pagination, and stale token.
4. Mounted tests for pending/success/error reconciliation, analysis editing, deadline behavior, dialogs, keyboard interaction, and Member control omission.
5. Render contracts for hosted component order, labels, permissions, light/dark classes, and honest empty/error states.
6. Static migration tests, pre-apply contract, disposable PostgreSQL live verification, RLS/grant/RPC assertions, and rollback-zero fixtures for every new migration.
7. Production build, full unit suite, rendered HTML suite, changed-file ESLint, TypeScript diagnostics for changed modules, and `git diff --check`.

### Browser walkthrough on localhost

For Admin and Member, verify at desktop and mobile widths:

- login, logout, password visibility, recovery, and session behavior;
- Overview permission links, next match, RSVP summary, statistics, news, calendar, and notification badge;
- Squad search/filter/sort, detail, official CRUD, deactivation, own profile, and avatar;
- Match create/edit/invite/remind/respond/complete/correct/analysis and history;
- Tactics draft/save/apply/read-only history and inactive-player identity;
- Funds entry/due/payment/waive/reversal, payment settings, and VietQR;
- Admin Settings team, notification, payment, role, audit, and protected deletion states;
- light/dark contrast, focus order, keyboard operation, no horizontal overflow, and Admin/Member bottom-navigation alignment.

Browser QA begins with read-only navigation. Any test that would alter the shared Supabase project names the exact test rows and asks for explicit authorization immediately before the mutation. Production is not updated by this design phase.

## Rollout and recovery

1. Commit the secure QA baseline before feature work.
2. Deliver slices in order: Match, Squad, Tactics, Funds/Settings, then remaining Overview/News/Notifications/Auth gaps.
3. Each slice follows RED/GREEN/refactor and receives an independent scoped review.
4. Forward migrations stop at a local verified checkpoint. Remote preflight is read-only.
5. Remote migration apply, Edge Function deploy, credential rotation, test-data mutation, branch merge, and production deploy are separate explicit-authority checkpoints.
6. After remote apply, regenerate database types, rerun post-apply verification and advisors, then run the complete localhost browser matrix against the real project.
7. Production release occurs only when there are no Critical/Important review findings, no tracked credential, no unsafe automatic script, and all applicable gates are green.

## Deferred items

- Native mobile push, third-party push providers, bank transaction reconciliation, payment webhooks, and automatic confirmation from VietQR are outside this MVP.
- Rewriting public Git history is not automatic. Credential rotation is still mandatory because deletion from the latest tree does not invalidate leaked history.
- Cloudflare/other hosting deployment is a later release step after functional completion and production approval.
