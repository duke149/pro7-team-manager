# PRO7 Responsive System Layer Design

Date: 2026-08-26

## Goal

Make the approved PRO7 frontend reliable from 320px through wide desktop without redesigning its navigation, route hierarchy, cards, controls, black/white/red identity, or CRUD workflows.

## Browser evidence

- At 768px the Squad grid correctly becomes two columns, but `.mobile-nav` is `position: static`, 138px tall, and falls below page content because the later 900px media query only switches it to `display: grid`.
- At 320–375px the notification button is hidden even when the signed-in member has an unread notification.
- Squad search/filter controls measure 17–38px high at 768px; the visible search icon is 19×19px.
- Profile inputs measure 43px high with 10px text, and field labels use 8px text at 375–414px.
- Mobile bottom-navigation labels use 7px text.
- At 1024px the route header is crowded by email, Profile, and Logout controls.
- The audited pages do not horizontally overflow at 320, 375, 414, 768, 1024, or 1440px.
- Light and dark themes preserve the approved black/white/red palette and contain no neon accent.

## Responsive architecture

PRO7 uses three shell modes:

1. Phone (`0–767px`): compact header, fixed bottom navigation, drawer navigation, one-column primary content, and a compact account overflow.
2. Tablet (`768–1023px`): compact header and drawer navigation without bottom navigation. Content may use two columns where cards remain readable.
3. Desktop (`1024px+`): fixed sidebar, existing desktop header, and current multi-column content grids.

The final responsive layer is appended after legacy component rules so one authoritative breakpoint family resolves the current overlapping 720/760/900 rules. It must not duplicate route markup or introduce a second design language.

## Header behavior

- Theme and notification controls remain directly accessible at every viewport.
- Phone/tablet replace separate Profile, Settings, and Logout controls with one accessible account-menu trigger.
- The account menu exposes identity, Profile, optional team Settings, and Logout.
- The account menu closes with Escape, outside click, and item selection; focus returns to its trigger.
- Desktop may keep the visible identity and direct actions while preserving the same underlying destinations.

## Interaction and typography

- Primary interactive targets are at least 44×44px.
- Mobile form controls use at least 16px input text to prevent iOS zoom.
- Semantic metadata and navigation labels use at least 12px; ordinary body and form label text uses at least 14px.
- Purely decorative brand microcopy may remain compact when it is not required to operate or understand the product.
- Keyboard focus remains visible with a 2px or stronger outline.
- `prefers-reduced-motion: reduce` removes non-essential animation and smooth scrolling.

## Visual system

- Retain the existing PRO7 red `#d71935`, neutral black/white surfaces, and current light/dark themes.
- Retain existing card radii, borders, shadows, content order, button order, and route-specific visual hierarchy.
- Use the existing spacing rhythm, normalized to 4/8px increments in the final responsive layer.
- Do not add gradients, neon glows, decorative illustrations, or new dashboard modules.

## Component behavior

- Overview: one-column phone layout, two-column tablet layout where card minimum widths permit, existing desktop ratios.
- Squad: horizontally comfortable search/filter controls, one-column phone cards, two-column tablet cards, existing desktop grid.
- Matches: RSVP controls stack or remain a three-column group only when every target stays at least 44px high.
- Tactics: the pitch and bench remain within the viewport; controls wrap without horizontal overflow.
- Funds and Settings: dense data panels become stacked cards on phone and retain multi-column layouts on tablet/desktop.
- Profile and auth: one-column mobile forms, 16px controls, readable labels, and full-width primary submit actions.

## Verification contract

- Every production change begins with a focused failing test.
- Mounted tests prove account-menu accessibility and mobile notification availability.
- CSS contract tests execute the compiled stylesheet and assert final computed behavior, not source-line presence alone.
- Browser QA covers Overview, Squad, Matches, Tactics, Profile, Funds, and Settings where the signed-in role permits, at 375, 768, 1024, and 1440px in light and dark themes.
- No production data, Supabase schema, or CRUD authority changes are part of this slice.

