# SDD ledger — plan: docs/superpowers/plans/2026-08-26-pro7-remaining-mvp-slices.md

## Preflight scan

| Task(s) | Producer → consumer / self-consistency | Finding |
| --- | --- | --- |
| 1 | SQL tables/RPCs → Tasks 2–6 typed queries/actions | Clean; Task 1 owns every shared database interface and generated types. |
| 2 | Match list/detail/attendance/analysis → Task 3 Overview and Task 4 Tactics | Clean; route IDs and scheduled/completed state are explicit consumers. |
| 3 | Overview reads Task 1/2 sources only | Clean; no duplicate write path or derived balance is introduced. |
| 4 | Tactics consumes active players plus scheduled match IDs | Clean; applied/draft visibility is specified at SQL and UI layers. |
| 5 | Funds consumes finance tables/RPCs only | Clean; isolated from match/overview/tactics files except shared CSS. |
| 6 | Seed consumes every schema; browser matrix consumes every route | Clean; stable marker, idempotency, cleanup, and no real-row deletion are explicit. |
| 7 | Review consumes Tasks 1–6 evidence and ledger rulings | Clean; no new production behavior is added during handoff. |
| 2 & 3 | `app/globals.css`; match model → overview cards | Shared CSS may conflict; preserve existing selectors and scope new declarations by route class. |
| 2 & 4 | match ID/status → tactics detail; `app/globals.css` | Task 2 must commit stable match identifiers before Task 4. |
| 2,3,4,5 | route shell/header/navigation | All consume existing shell; none may change navigation identity or shell layout. |
| 4 & 5 | `app/globals.css` | Shared CSS must be appended/scoped and verified with desktop/mobile light/dark parity. |
| 1 & 6 | migration filename/version → remote history | Normalize only the one matching migration row if MCP assigns a different timestamp. |

Ruling: The existing approved full-MVP design is the binding design approval for these remaining slices; no new visual or product behavior is invented — cost if wrong: a slice may need spec/design rework before final approval.

Ruling: Demo fixtures will attach only to already provisioned demo memberships; the seed will not create Auth users or expose temporary passwords — cost if wrong: fewer browser identities may require separate Admin/Member provisioning during QA.

Remote checkpoint completed before this plan: `20260826035128_preserve_existing_profile_attachment` applied and normalized; `provision-team-member` Edge Function v1 ACTIVE with `verify_jwt=true`.

Remote evidence: attachment function preserves existing display name, keeps `requires_password_change` monotonic, is service-role-only, has fixed empty search path, and profile gap count is zero. Unauthenticated Edge invocation returns HTTP 401 with `UNAUTHORIZED_NO_AUTH_HEADER`. Security advisors retain five intentional authenticated SECURITY DEFINER RPC warnings plus leaked-password protection disabled; performance advisors retain two unindexed legacy composite FKs and four currently unused indexes.

Task 1: fix round 1/5 (7 addressed, 0 open — NULL atomicity, optimistic token, lifecycle locks, due correction, tactic audit, composite-FK behavior, invite idempotency; commits 85321e9..3e30cb7)

Task 1: complete (commits b110456..3e30cb7, review clean)

Task 2: fix round 1/5 (5 addressed, 2 open — strict parsers, bounded complete queries, RSVP state, deadline behavior, invite coverage, ISO validation, modal focus; commits 393d0ed..ff78333)

Task 2: fix round 2/5 (2 addressed, 0 open — live deadline transition and single-transaction 1–400 invite; commits ff78333..d734829)

Task 2: complete (commits 3e30cb7..d734829, review clean)

Ruling: Task 3 review exposed a plan gap: the approved design requires match invitations/reminders to create own-user in-app notifications, but Task 1 omitted `notifications`. Reopen the still-unapplied Task 1 migration to add the table, RLS, invitation upsert, and a narrow pending-only reminder RPC before fixing Overview — cost if wrong: schema and types gain one additional MVP surface and Task 3 review takes an extra backend round.

Task 1: fix round 2/5 (notification schema, own-user RLS, transactional invite notification, reminder RPC addressed; commits 30a6962..e52a586)

Task 1: fix round 3/5 (atomic full pending-recipient derivation addressed; commits 30a6962..1eff435)

Task 1: complete after reopen (commits b110456..1eff435, review clean)

Task 3: fix round 1/5 (hosted controls, live RSVP deadline, permission-aware links, real reminder UI; atomicity moved to schema; commits 50c2574..30a6962)

Task 3: fix round 2/5 (recipient pre-read removed; exact two-argument atomic reminder RPC; commits 1eff435..6b2a50c)

Task 3: complete (commits d734829..6b2a50c, review clean)

Task 4: fix round 1/5 (save reconciliation, starter/bench, formation, active membership, pointer capture, hosted copy, loading/a11y; 3 open; commits 5f74a02..ea23fdb)

Task 4: fix round 2/5 (apply fork, exact readback, generated-click suppression; 1 open version conflict; commits ea23fdb..6d577a6)

Task 4: fix round 3/5 (bounded N+1 tactic version sequence and 23505 conflict; 0 open; commits 6d577a6..e4624e7)

Task 4: complete (commits 6b2a50c..e4624e7, review clean)

Task 5: fix round 1/5 (waive/income/due flows, contextual CTA, hosted empty cards, loading/a11y; 1 open CTA regression; commits 827b75d..ad5fe50)

Task 5: fix round 2/5 (non-Funds Admin player CTA restored; 0 open; commits ad5fe50..fca11f7)

Task 5: complete (commits e4624e7..fca11f7, review clean)

Ruling: Remote project currently has one Auth user and one active membership, insufficient for a seven-player tactic and role matrix. Use the already approved/protected provisioning flow to create clearly named demo-only members before seeding domain fixtures; cleanup will deactivate/remove their demo memberships and document Auth-user deletion separately because the seed SQL must not manipulate `auth.users` — cost if wrong: demo Auth accounts persist until explicitly removed through a trusted Admin cleanup/dashboard step.

Ruling: Browser security policy prevents submitting account-creation flows, so the removable seed requires only one active `pro7-fc` membership, selects at most eight active memberships in UUID order, and emits explicit player/starter/bench/injury coverage. Both tactics use the first seven as starters and only the eighth as bench; below seven both remain parser-valid incomplete drafts, at seven both are board-ready without bench, and at eight both expose the real bench player. Existing player profiles remain untouched — cost if wrong: sparse data intentionally cannot exercise board mutations, but reported coverage, production's apply invariant, and reversible cleanup remain truthful.

Task 6 local artifact phase: complete (seed/cleanup SQL, disposable-PG17 safety harness, Owner/Admin/Member route matrix; remote apply/import and browser QA intentionally remain with the controller)

Task 6: fix round 1/5 (sparse applied invariant, separate-draft bench coverage, truthful injured deferral, actual route parser integration, and exact per-due marker lineage addressed; local fix committed)

Task 6: fix round 2/5 (eight-player selection, seven-starter readiness for both tactics, eighth-only bench, explicit starter/bench coverage output, and parsed board-readiness contract addressed; local fix committed)
