# Task 1 — PRO7 route shell and Squad skeleton

## Delivered behavior

- Replaced the rendered team-route `ProductShell` with `Pro7RouteShell`, while preserving the verified-user and `TeamAccessContext` server boundary in `app/teams/[slug]/layout.tsx`.
- Added route-aware hosted-prototype navigation, header, theme/menu controls, current-team, season, and account blocks. Navigation now uses real team-scoped links in this order: `Tổng quan`, `Đội hình`, `Trận đấu`, `Chiến thuật`, `Quỹ đội`.
- Restored the Squad hierarchy: toolbar/search, position tabs, filter control, four summary cells, three-column grid container, an honest empty card, and the authorized add-player card. Funds and every add-player affordance are omitted without changing the remaining authorized layout.
- Kept `ProductShell` unchanged for compatibility coverage but no longer render it from team routes.

## Files

- Added: `app/components/pro7-route-shell.tsx`, `app/components/pro7-route-header.tsx`, `app/components/pro7-route-navigation.tsx`, `app/components/pro7-squad-skeleton.tsx`, `tests/pro7-shell-parity.test.ts`.
- Updated: `app/teams/[slug]/layout.tsx`, `app/teams/[slug]/squad/page.tsx`, `app/pro7-app.tsx`, `app/globals.css`, `tests/product-navigation.test.ts`, and `tests/rendered-html.test.mjs`.

## TDD evidence

### RED

Command:

```bash
npm run test:unit -- tests/pro7-shell-parity.test.ts tests/product-navigation.test.ts
```

Observed 2 failing parity tests. The rendered Squad output was the `TeamPlaceholder`; it lacked `Tìm theo tên cầu thủ...` and `player-grid`. This was the expected failure caused by the simplified placeholder, not a test harness error. An earlier direct-import attempt was discarded because the unit runner could not resolve `next`; the final test uses Vinext SSR with only a `next/navigation` test shim.

### GREEN

Fresh final verification:

```bash
npm run test:unit -- tests/pro7-shell-parity.test.ts tests/product-navigation.test.ts
# 13 pass, 0 fail

node --test tests/rendered-html.test.mjs
# 6 pass, 0 fail

npm run test:unit -- tests/team-route-boundary.test.ts tests/team-context.test.ts tests/team-navigation.test.ts tests/pro7-shell-parity.test.ts tests/product-navigation.test.ts
# 47 pass, 0 fail

npm run build
# exit 0

git diff --check
# exit 0
```

## Self-review

- The server layout still calls `requireProductUser`, loads exactly one verified team context, and passes only team, role, effective permissions, and email into the client shell.
- The Squad page still checks `players.read` before emitting any UI. Add-player requires `players.manage`; Funds requires `finance.read`.
- The empty state remains inside `player-grid`; it does not replace the hosted shell with a generic page.
- Route navigation uses anchors rather than the prototype's local view-state buttons. Mobile keeps the hosted `mobile-nav` five-slot grid CSS.
- No Supabase remote state, secrets, migrations, hosting, or pre-existing `supabase/.temp/` files were touched.

## Commit

- Implementation: `91a0438a7ba42762f0931ac3c18694e71756200a` (`fix: restore hosted PRO7 route interface`)

## Concerns

- Full authenticated screenshot comparison was not possible: the hosted reference opened only the ChatGPT sign-in gate, and no user session was provided. Automated desktop/mobile class, hierarchy, link-order, light/dark control, and permission contracts passed.
- The required scoped ESLint invocation still reports 7 pre-existing accessibility errors and 1 warning in the retained standalone `app/pro7-app.tsx` prototype (lines 123, 190, 214, and 230). The new route components produced no lint findings. Build passes; the existing Vinext middleware deprecation warning remains.
