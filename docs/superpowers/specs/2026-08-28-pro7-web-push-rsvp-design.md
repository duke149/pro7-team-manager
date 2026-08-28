# PRO7 Account-bound Web Push and Shared RSVP Design

## Objective

Add real browser Web Push to PRO7 and complete the match invitation flow without changing the established black, white, and red product interface. An Admin can invite active members, share one generic match link through the device share sheet (including Zalo or Messenger when installed), and see account-bound RSVP responses. Each invited member can receive push notifications on subscribed devices, log in when necessary, respond on a dedicated screen, and then continue to the match detail.

Calendar/OAuth integration is explicitly deferred.

## Approved product decisions

- One shared URL per match; no per-member token is embedded in the link.
- The authenticated account is the only RSVP identity. The server ignores any caller-supplied user ID and derives the user from the verified session.
- Link flow: open shared link, authenticate if needed, show the dedicated `Có / Có thể / Không` screen, save the response, then open the match detail.
- Web Push is offered through a soft in-app prompt. The browser permission request occurs only after an explicit user click.
- Each user can register multiple browser/device subscriptions.
- Push is attempted for the initial invitation, each manual Admin reminder, the configurable pre-match reminder, and the fixed two-hour reminder.
- Automatic reminders target only active members whose attendance remains `pending`. Each milestone is emitted at most once per match/member.
- If the configurable reminder is exactly two hours, the fixed two-hour milestone wins and only one push is emitted at that time.
- In-app notifications and attendance writes remain authoritative. Push delivery failure never rolls them back.
- The existing notification bell remains as a durable fallback.
- Production Web Push requires HTTPS; loopback localhost remains valid for development.

## User flows

### Enable notifications

1. An authenticated user enters a team route.
2. PRO7 checks browser capabilities, permission state, and whether this browser already has a current subscription.
3. If permission is still `default`, PRO7 shows a soft product modal. It does not trigger the operating-system/browser prompt automatically.
4. The user presses `Bật thông báo`; PRO7 registers the root Service Worker, requests permission, creates a Push API subscription with the public VAPID key, and posts the exact subscription to a same-origin API.
5. The API verifies the session and stores only that user's subscription through RLS.
6. A denial or dismissal is remembered locally so PRO7 does not repeatedly interrupt the user. The profile/settings surface remains an explicit place to retry.
7. On iOS/iPadOS outside standalone Home Screen mode, PRO7 explains that the app must first be added to the Home Screen instead of showing a permission button that cannot succeed.

### Invite and push

1. An Admin invites one or more active team members through the existing match UI.
2. `invite_match_attendance` locks the match, validates all selected memberships, inserts missing attendance rows, upserts durable in-app notifications, and enqueues push events in the same database transaction.
3. A database wake-up calls the push Edge Function asynchronously. A minute-level Cron call provides recovery if the immediate wake-up is lost.
4. The Edge Function claims a bounded batch, expands each event into per-subscription deliveries, encrypts and sends Web Push with VAPID, then records only bounded status/error codes.
5. Expired endpoints (`404`/`410`) are deleted. Transient failures are retried with bounded exponential backoff. No subscription secret or message content is logged.

### Open and respond

1. A notification click or shared link opens `/teams/[slug]/matches/[matchId]/rsvp`.
2. Existing middleware preserves the complete `next` path through login.
3. The RSVP page resolves the verified user, team membership, match permission, and that user's own attendance row.
4. A non-invitee sees an honest `Bạn chưa được mời` state and cannot create an attendance response.
5. An invited user sees `Có`, `Có thể`, and `Không` while the match and deadline permit responses.
6. `Có` maps to `available`; `Có thể` maps to `available` with a stable bounded note indicating uncertainty; `Không` maps to `unavailable`. The account-bound RPC remains authoritative.
7. After a successful authoritative response, the client replaces the RSVP route with the match-detail route.

### Share one match link

1. `Chia sẻ lời mời` builds the canonical absolute RSVP URL from the current origin and match identity.
2. When Web Share is available, PRO7 invokes the native share sheet with a bounded Vietnamese title, match summary, and URL. Zalo/Messenger availability is controlled by the operating system and installed apps.
3. Otherwise PRO7 copies the same text and URL to the clipboard; a final visible/selectable URL fallback remains available when clipboard access is blocked.
4. The link grants no authority. A recipient still has to authenticate as an invited active member.

## Data model

### `public.push_subscriptions`

One row per user/browser subscription:

- `id uuid` primary key
- `user_id uuid` bound to `profiles`
- bounded HTTPS `endpoint`
- `endpoint_hash bytea`, generated from the endpoint and unique per user
- bounded `p256dh` and `auth` keys
- nullable bounded `expiration_time`
- bounded optional `user_agent`
- `failure_count`, `last_success_at`, `created_at`, `updated_at`

Authenticated users receive explicit `SELECT`, `INSERT`, `UPDATE`, and `DELETE` grants and own-user RLS policies. They cannot set another user ID. The browser uses the same-origin API rather than direct table access, while RLS remains the final boundary.

### `private.push_outbox`

One logical event per match/user/milestone:

- source notification, team, match, and recipient IDs
- event kind: `invitation`, `manual_reminder`, `configured_reminder`, `two_hour_reminder`
- a bounded `event_key` used for idempotency
- local RSVP target path and bounded notification payload
- claim/retry timestamps, attempt count, terminal status, and bounded error code

Automatic and invitation keys are unique per match/user/milestone. Manual reminder keys use a UTC minute bucket, allowing an Admin to issue later reminders while retries or double-submits within the same minute remain idempotent.

### `private.push_deliveries`

One row per outbox/subscription pair, unique on both IDs. It tracks pending/sent/permanent-failure state and retry metadata. This prevents a successful device from receiving duplicates when another device has a transient failure.

Neither private table is exposed through the Data API. Only hardened service functions can claim or settle deliveries.

## Database workflows

### Invitation and manual reminder RPCs

The additive migration replaces the existing functions without changing their public signatures. Both functions continue to validate identity, team permission, match lifecycle, and active memberships.

- Invitation notification targets change to the dedicated RSVP path.
- Each inserted/refreshed notification produces a matching outbox event in the same transaction when the team's corresponding notification setting is enabled.
- Manual reminders continue to update the single durable in-app reminder row but create a new idempotent push event keyed to the current UTC minute bucket.
- Existing callers and response shapes remain compatible.

### Scheduled reminders

A private scheduler function runs once per minute:

- selects scheduled matches that have not started;
- reads the bounded notification settings with safe defaults;
- finds active invited members still `pending`;
- enqueues the configured milestone when the match enters its reminder window;
- enqueues the fixed two-hour milestone when the match enters that window;
- excludes the configured milestone when it equals two hours;
- relies on unique event keys for overlap/retry idempotency.

The scheduler never changes attendance and never sends over the network inside the match transaction.

### Queue claiming and settlement

Public-schema Data API RPCs callable only by `service_role`, implemented as `SECURITY DEFINER` functions with a fixed empty `search_path`:

- claim a bounded event/delivery batch with `FOR UPDATE SKIP LOCKED`;
- reclaim locks after a bounded timeout;
- settle individual deliveries as sent, retryable, expired, or permanent failure;
- mark an outbox event complete only when no unfinished delivery remains;
- mark events with no active subscription as `no_subscription` rather than retrying forever.

All functions revoke `PUBLIC`, `anon`, and `authenticated`; only `service_role` can execute them. Exact table privileges remain private.

## Edge Function and secrets

`send-web-push` is a Supabase Edge Function with a pinned Web Push dependency. It:

- accepts only `POST`;
- validates an internal invocation secret before doing work;
- uses a server-only Supabase secret key;
- claims a bounded batch;
- sends VAPID-encrypted notifications to every pending delivery;
- deletes expired subscriptions;
- maps provider responses to stable retry/permanent categories;
- returns aggregate counts without recipient, endpoint, or key material.

Secrets:

- `PRO7_VAPID_PUBLIC_KEY` may be exposed to the browser through the app environment.
- `PRO7_VAPID_PRIVATE_KEY`, `PRO7_VAPID_SUBJECT`, and `PRO7_PUSH_INTERNAL_SECRET` exist only in Supabase Edge Function secrets/Vault.
- The private VAPID key, service key, subscription keys, and internal secret are never committed or printed in reports.

## Service Worker and browser boundary

The stable root-scoped worker `/pro7-sw.js`:

- accepts only bounded JSON push payloads with known event types and local RSVP paths;
- displays a visible notification with a stable tag and PRO7 icon/badge;
- closes and focuses an existing PRO7 window on click, otherwise opens a new same-origin window;
- rejects external URLs and falls back to `/`;
- contains no environment secret.

A web manifest supplies product name, standalone display mode, theme colors, and installable icons. Existing visual styles and navigation remain unchanged; only the permission modal, notification state, and share/RSVP surfaces are added.

## Authorization and privacy

- Subscription API requests are same-origin JSON, size-bounded, exact-key validated, and bound to the verified caller.
- An RSVP URL contains no user ID, email, access token, or secret.
- The RSVP API and `respond_match_attendance` use the session user ID; a payload cannot override it.
- Non-invitees, inactive members, unrelated-team users, closed deadlines, and cancelled/completed matches fail closed.
- Push payloads contain only the bounded match invitation summary already visible to the recipient after authentication; no phone, email, notes, role, or other player profile data is included.
- Notification settings gate product events, but authorization never depends on a client-side setting.

## Error and fallback behavior

- Unsupported Push API: show `Trình duyệt chưa hỗ trợ thông báo đẩy`; keep in-app notifications and share links working.
- Permission denied: do not re-prompt automatically; show browser-settings guidance.
- Subscription/API failure: show a retryable inline state; do not affect match invitation success.
- No subscriptions: queue event completes as `no_subscription`; in-app notification remains unread until opened.
- Edge/Cron outage: queued events remain retryable and are processed after recovery.
- Shared link opened by the wrong account: show `Tài khoản này chưa được mời`, with safe logout/switch-account guidance.
- Match/RSVP closed: render read-only current response and link to match detail.

## Verification and deployment gates

1. Strict RED/GREEN unit tests for subscription payloads, RSVP identity, share behavior, permission states, Service Worker messages, and Edge retry classification.
2. Static migration contracts plus a PostgreSQL 17 transactional verifier for grants, RLS, invitation/outbox atomicity, automatic milestones, idempotency, service-only claims, expired subscription cleanup, and rollback-zero fixtures.
3. Edge Function native type-check/tests with pinned dependencies.
4. Full unit, build, rendered HTML, scoped lint/type checks, and `git diff --check`.
5. Authenticated localhost browser verification for Admin and Member, desktop/mobile, permission prompt states, share fallback, RSVP redirect, notification click, and existing bottom navigation.
6. Read-only remote preflight; apply the additive migration once; set secrets without output; deploy the Edge Function; install Cron/wake configuration; run post-apply catalog/RLS/advisor checks.
7. Production smoke test using one invited test member: subscription stored, invitation queued, push received/clicked, login/RSVP account binding enforced, Admin sees the authoritative response, and no duplicate two-hour/configured event.

## Deferred scope

- Google/Apple/Outlook calendar OAuth and automatic calendar writes
- native iOS/Android application push
- email/SMS/OTT bot delivery
- per-recipient invitation links or unauthenticated RSVP
- arbitrary marketing/broadcast notifications
