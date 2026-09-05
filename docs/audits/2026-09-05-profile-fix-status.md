# Avatar / admin profile implementation

## Scope approved

Admin may edit shared personal profiles of active players in a team they manage, plus existing team settings. Auth credentials and owner transfer remain separate. No production push or remote migration has been performed.

## Implemented locally

- Crop: horizontal and vertical sliders, pointer dragging, 90-degree rotation, reset to original orientation; circle preview spans the same square as output. Fixed square avatar output remains intentional (512×512), no arbitrary-aspect crop handles.
- Admin player detail: expandable personal profile/avatar editor using existing ProfileForm and crop UI. Fields: name, phone, birth date, height, weight, preferred positions. Existing membership fields remain separate. Match-derived performance statistics remain edited through match analysis, not fabricated in the personal profile.
- Dedicated team-target profile PATCH route checks authenticated team permissions and active target membership, then validates an allowlist. UPDATE verifies a returned row instead of treating zero-row RLS updates as success.
- Local migration `20260905085354_admin_player_profile.sql`: manager profile UPDATE policy, canonical avatar Storage policies, restricted helpers and profile audit trigger. Existing field-level grants and self-profile permissions remain intact. Logs omit phone/birth-date values intentionally.
- Managers can edit an owner's personal profile, but not change owner role through ordinary membership controls.

## Verification

- Failing tests reproduced missing crop control and denied same-team manager update before implementation.
- Crop regression: 9/9 passed.
- API / squad / profile regression group: 23/23 passed.
- PostgreSQL isolated cluster: 4/4 passed including authorized profile persistence, audit event, member denial, inactive target denial, outside-team denial and Storage insert/update/delete.
- Chromium component fixture: actual pointer drag X/Y, reset, 90-degree rotation verified by pixel (green quadrant moves to top-left), preview mask inset=0. No live Storage upload.
- ESLint changed TS/TSX files and git diff --check passed. Production build completed locally.
- Browser opened expanded admin editor on existing player profile read-only. No personal data was submitted.

## Required before live acceptance

Remote DB has not received the migration. The new editor must NOT be considered live-functional until migration review/application and an end-to-end QA account test against that database. Existing production remains unchanged. Do not weaken RLS or use service-role keys in the frontend to work around this gate.

Still to verify: iOS touch interaction; full two-account live avatar upload/reload across Profile and Squad; remote advisors after an approved migration. Previous unrelated “Không thể tải phong độ” requires separate diagnosis.
