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

## Review-fix round 1/5

### Findings verified and fixed

- Added the guarded `/teams/[slug]/tactics` landing page. It requires `tactics.read`, renders an honest no-match state, and allows a tactics-only membership to resolve to that stable route. A local unauthenticated request to `/teams/falcons/tactics` returned `307 Location: /login?next=%2Fteams%2Ffalcons%2Ftactics`, rather than 404.
- Replaced the premature `/account/profile` anchor with the same non-interactive hosted account block.
- Reused the existing `resolveBrowserTheme` contract in `Pro7RouteShell` after hydration, with deferred state resolution and timer cancellation to avoid hydration mismatch and stale queued preference writes.
- Restored white active text on the red desktop navigation item.
- Added explicit coverage that a member without `players.manage` receives neither the Squad add card nor the header CTA.

### RED evidence

```bash
npm run test:unit -- tests/pro7-shell-parity.test.ts tests/product-navigation.test.ts tests/team-navigation.test.ts
# 14 pass, 2 fail: account block still linked to /account/profile; tactics-only landing resolved null.

npm run test:unit -- tests/pro7-route-shell-mounted.test.ts
# 0 pass, 1 fail: persisted pro7-theme=dark hydrated as "pro7-shell light".
```

The CSS render contract was also added before the style token change and failed against `color:var(--navy)`.

### GREEN verification

```bash
npm run test:unit -- tests/pro7-shell-parity.test.ts tests/product-navigation.test.ts tests/team-navigation.test.ts tests/pro7-route-shell-mounted.test.ts tests/tactics-route.test.ts
# 18 pass, 0 fail

node --test tests/rendered-html.test.mjs
# 6 pass, 0 fail

npx eslint app/components/pro7-route-* app/teams/[slug]/tactics/page.tsx lib/teams/navigation.ts tests/pro7-shell-parity.test.ts tests/product-navigation.test.ts tests/team-navigation.test.ts tests/pro7-route-shell-mounted.test.ts tests/tactics-route.test.ts tests/rendered-html.test.mjs
# exit 0

npm run build
# exit 0; route table includes /teams/:slug/tactics

git diff --check
# exit 0
```

The combined unit invocation emitted a non-fatal Vite HMR port-24678-in-use warning while all 18 tests passed. The existing Vinext middleware deprecation warning also remains.

### Review-fix commit

- `278af40a270f51f0197716b391743903b384e072` (`fix: stabilize PRO7 tactics and theme routes`)
