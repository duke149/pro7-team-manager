# PRO7 Taste Design System Polish

**Date:** 2026-08-28
**Status:** Approved in chat
**Design input:** `Leonxlnx/taste-skill` → `redesign-existing-projects`
**Related specifications:**

- `docs/superpowers/specs/2026-08-26-pro7-typography-system-design.md`
- `docs/superpowers/specs/2026-08-26-pro7-responsive-system-layer-design.md`
- `docs/audits/2026-08-26-pro7-checklist-design-audit.md`

## Goal

Polish the existing PRO7 frontend into one coherent black, white, neutral-gray,
and red sports-management design system. Improve Vietnamese typography,
alignment, spacing, colour, sizing, responsive behaviour, and interaction
feedback without changing route structure, control order, permission gates,
data meaning, or CRUD authority.

This is a targeted upgrade of the existing product. It is not a rewrite and it
must not invent replacement dashboards, decorative modules, fake data, or new
backend behaviour.

## Audit Baseline

### Source evidence

- `app/globals.css` is currently more than 1,000 lines and combines the original
  component rules with later QA extensions.
- `app/layout.tsx` loads `globals.css`, then `responsive.css`, then
  `typography.css`. Each layer currently declares overlapping sizes and
  responsive behaviour.
- Breakpoints include 390, 420, 520, 600, 700, 720, 760, 767, 900, 1023, and
  1100 px. The overlapping 760/767/900/1023 rules create cascade ambiguity.
- The initial typography audit found competing Roboto and Be Vietnam Pro
  sources. The user subsequently approved Open Sans as the primary family and
  Barlow as the secondary display family; this later instruction is binding.
- The QA extension reintroduces `--neon-green`, `--electric-cyan`, blue Zalo,
  green success, yellow-card, and cyan substitution treatments. These colours
  do not belong to the approved PRO7 brand palette.
- Border radii, shadows, gaps, and padding use many adjacent one-off values,
  making cards and controls feel visually unrelated.

### Browser evidence

The signed-in Member account was inspected on localhost at a 390 px viewport:

- Profile, Overview, Squad, Matches, and Tactics did not create document-level
  horizontal overflow.
- Profile theme and account controls are 44×44 px and the form remains one
  column.
- The four-item Member bottom navigation distributes correctly.
- The Squad filter row clips the final quick filter and gives no clear scroll
  affordance.
- Route header composition is not optically consistent between Overview,
  Squad, Matches, and Tactics.
- Empty-state cards often preserve the dimensions of data-heavy cards, creating
  excessive unused space on mobile.
- Numerous metadata labels remain visually small and low-contrast despite the
  semantic typography layer.

The existing responsive contracts cover the five-item Admin bottom navigation;
the final browser audit must recheck an authenticated Admin session rather than
assuming Member results apply to Admin.

## Chosen Direction

Use **systematic polish**:

1. Preserve existing page composition, route markup, module order, and action
   order.
2. Use self-hosted Open Sans for body/control copy and Barlow for headings,
   branding, and numeric display while retaining the approved semantic scale.
3. Establish one token source for colour, spacing, radii, shadows, control
   sizing, and z-index.
4. Remove off-brand neon/cyan/blue presentation while retaining text and icon
   cues for semantic states.
5. Make `responsive.css` the single authoritative phone/tablet/desktop layer.
6. Fix individual layout defects only after the shared system is stable.

The alternative of rebuilding the dashboard composition was rejected because
it would undermine the already approved frontend and increase CRUD regression
risk. Continuing to append one-off overrides was rejected because it would make
the current cascade conflicts worse.

## Visual Foundation

### Typography

- Primary family: `"Open Sans Variable"`, self-hosted from the pinned Fontsource
  package, weights 300–800, `font-display: swap`.
- Secondary family: `"Barlow"`, self-hosted from the pinned Fontsource package
  at weights 600, 700, and 800 for headings, branding, and numeric display.
- Fallback: `system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI",
  sans-serif`.
- Numeric content uses Barlow with tabular numerals.
- Keep the approved semantic scale: caption 12, label 12/13, control 13/14,
  body-small 13/14, body 14/15, input 14/16, title-small 18, title-medium
  22/20, title-large 28/24, and display 32/28 px.
- Body line height is 1.5; multiline help/error text is 1.6; headings are 1.25;
  display metrics are 1.15.
- Vietnamese names and sentences never receive forced uppercase or positive
  tracking. Uppercase kickers are short, at least 12 px, and use at most
  `.075em` tracking.
- Headings use `text-wrap: balance`; descriptive copy uses
  `text-wrap: pretty` where supported.

### Colour

Primitive palette:

| Role | Light value | Dark value |
|---|---:|---:|
| Brand red | `#D71935` | `#EF4058` |
| Brand red strong | `#A60F28` | `#FF8A9A` |
| Canvas | `#F5F5F6` | `#111113` |
| Surface | `#FFFFFF` | `#1B1B1E` |
| Raised surface | `#FAFAFB` | `#242428` |
| Primary text | `#171719` | `#F4F4F5` |
| Muted text | `#66666C` | `#B1B1B7` |
| Border | `#DEDEE2` | `#38383D` |

- Red is the only brand accent.
- Pure black is reserved for rare high-contrast artwork; product surfaces use
  off-black neutrals.
- Success, warning, RSVP, injury, and match-event states use icon + label +
  neutral/red treatments. They must not rely on neon green, cyan, blue, or
  colour alone.
- Danger and destructive actions use red with explicit text.
- Disabled states use neutral surfaces and keep readable contrast.
- Raw colour literals remain permissible only for documented SVG artwork or a
  specific accessible semantic state that cannot be expressed by a shared
  token.

### Spacing and sizing

Shared spacing scale:

| Token | Value | Use |
|---|---:|---|
| `--space-1` | 4 px | icon/text micro-gap |
| `--space-2` | 8 px | compact control gap |
| `--space-3` | 12 px | dense card rows |
| `--space-4` | 16 px | component padding/gap |
| `--space-5` | 24 px | page-section gap |
| `--space-6` | 32 px | large card/page padding |
| `--space-7` | 40 px | desktop page gutter |

- Minimum interactive target: 44×44 px.
- Phone text inputs and primary submit controls: minimum 48 px high.
- Standard icon sizes: 16, 20, and 24 px; icon button containers use 44 px.
- Component padding resolves to 12, 16, or 24 px. One-off 14/15/17/18/19/20/22
  px padding values are migrated unless optical evidence requires an exception.
- Page gutters: 14 px phone, 18–24 px tablet, 40 px desktop.
- Section gaps: 14–16 px phone, 20–24 px tablet/desktop.

### Shape, elevation, and box sizing

- `box-sizing: border-box` remains global for all elements and pseudo-elements.
- Radius scale: 8 px inner controls, 12 px ordinary cards/panels, 16 px hero or
  modal containers. Circular avatars and score rings are explicit exceptions.
- Shadow scale: one low elevation for ordinary cards and one high elevation for
  dialogs/popovers. Shadows use neutral tinted values appropriate to each
  theme; no neon glow.
- Cards should use elevation only when it communicates grouping. Nested
  border-plus-shadow cards are simplified to spacing or a single divider.
- Focus rings use a consistent red outline with at least 3:1 contrast and are
  never removed.

## Responsive Architecture

Only three shell ranges are authoritative:

1. Phone: `0–767px`
2. Tablet: `768–1023px`
3. Desktop: `1024px+`

Narrow component queries may remain at 420/520/600/720 px only when they reflow
that component and do not redefine shell navigation, typography tokens, or page
gutters.

### Phone

- Fixed bottom navigation, one-column primary layouts, compact header, drawer
  navigation, 14 px page gutter, and safe-area padding.
- Bottom navigation uses equal flexible columns for four Member or five Admin
  items. Each link remains at least 56 px high with a readable two-line label.
- Horizontal chip/filter collections either wrap cleanly or expose deliberate
  horizontal scrolling with edge padding and a visible scroll affordance.
- Empty states collapse unused data-heavy height while maintaining a minimum
  comfortable touch area.

### Tablet

- Drawer/header shell without bottom navigation.
- One or two content columns according to a documented minimum card width.
- Header actions remain 44 px and do not force page titles into narrow columns.
- Tables and dense finance/settings rows reflow into readable cards before text
  shrinks.

### Desktop

- Preserve the 250 px sidebar and existing route content hierarchy.
- Page content remains capped at 1440 px with consistent 40 px outer gutters.
- Shared card rows align titles, metrics, and actions optically without forcing
  unrelated content to equal heights.

## Component Rules

### Product shell

- Preserve sidebar, compact header, drawer, and role-specific destinations.
- Active navigation uses red with white text in both themes.
- Account, notification, and theme controls share 44 px geometry and focus
  treatment.
- Member and Admin navigation item counts must not use separate pixel formulas.

### Overview

- Preserve hero, availability, statistics, news, and schedule order.
- Use compact honest empty states instead of retaining oversized populated-card
  dimensions.
- KPI values use tabular numerals and a consistent baseline.

### Squad

- Preserve search, position filters, advanced filters, summary, and player card
  order.
- Make the mobile filter row fully discoverable and operable without clipped
  controls.
- Normalize player-card padding, avatar geometry, metadata spacing, and status
  chips. Do not replace real data with marketing copy.

### Matches

- Preserve invitation, RSVP, analysis, upcoming schedule, and history flows.
- Keep RSVP choices visually distinct using icon, label, border, and selected
  state; do not require green/blue status colours.
- Empty upcoming cards collapse vertically on phone.
- Match-event types remain distinguishable without neon colours.

### Tactics

- Preserve the pitch, formation/mode toolbar, instructions, bench, save, and
  apply interactions.
- Controls wrap without reducing targets below 44 px.
- Pitch player labels and numbers remain legible in both themes; the pitch uses
  neutral/red grid and line tokens.

### Funds and Settings

- Remain Admin-only.
- Bottom navigation must distribute five Admin destinations at 320, 375, and
  414 px without overlap.
- Money, due counts, and transaction values use tabular numerals.
- Dense rows reflow before truncating names, amounts, or destructive actions.

### Auth and Profile

- Preserve show-password, forgot/reset/change-password, avatar, profile, theme,
  and account-menu behaviours.
- Use the same global tokens as the product shell instead of a separate visual
  language.
- Phone inputs remain 16 px/48 px to prevent browser zoom.

### Loading, empty, error, modal, and popover states

- Every state keeps its existing semantic meaning and ARIA role.
- Skeletons match the final card geometry.
- Errors are inline and direct; no `window.alert()`.
- Modals retain focus trap, Escape handling, focus restoration, and a maximum
  viewport-safe height.
- Non-essential motion respects `prefers-reduced-motion`.

## CSS Architecture

1. Add `app/design-tokens.css` as the single primitive and semantic token
   source, including font face, colour, spacing, radius, shadow, control size,
   and z-index tokens.
2. Load `design-tokens.css` before component styles in `app/layout.tsx`.
3. Keep `app/globals.css` as the component layer, but remove duplicate root
   token declarations, off-brand QA colour variables, and rules superseded by
   the authoritative layers.
4. Keep `app/responsive.css` as the only shell breakpoint layer. Remove
   overlapping shell media queries from `globals.css`.
5. Keep `app/typography.css` as semantic component-to-type-token mapping, but
   move family/token ownership into `design-tokens.css`.
6. Do not add a fourth catch-all override stylesheet.

This architecture improves the cascade rather than hiding defects under more
specific selectors.

## Behaviour and Data Boundaries

- No Supabase migration, Auth change, RLS policy, RPC, Edge Function, data seed,
  or remote mutation belongs to this work.
- No API route, server query, mutation payload, router destination, permission
  condition, or CRUD copy may change unless a focused regression test proves a
  purely presentational accessibility defect requires it.
- Existing component DOM may receive semantic wrappers, ARIA attributes, or
  state classes, but action order and visible functionality remain unchanged.
- No hardcoded demo player, opponent, score, transaction, or notification may
  be introduced.

## Verification Matrix

### Automated

- Token contract proves one primitive/semantic source and rejects neon/cyan/blue
  QA variables.
- Typography contract proves bundled Open Sans/Barlow assets and licenses,
  primary/secondary token mapping, tabular numeric mapping, and minimum sizes.
- Responsive contract proves the phone/tablet/desktop shell boundaries,
  44×44 px controls, phone 16 px inputs, and flexible four/five-item bottom nav.
- CSS contract proves global pseudo-element box sizing, bounded radius/shadow
  scales, reduced motion, visible focus, and no forbidden catch-all stylesheet.
- Existing unit, mounted, rendered HTML, authorization, and CRUD tests remain
  green.
- Production build succeeds with no remote font request.

### Browser QA

Use localhost with one authenticated Admin and one authenticated Member.
Inspect light and dark themes at 320, 375, 390, 414, 768, 1024, and 1440 px.

Required routes:

- Login, forgot/reset/change-password;
- Overview;
- Squad list and player detail;
- Matches list and detail;
- Tactics landing and board;
- Admin Funds and Settings;
- Member Profile;
- notification popover, account menu, modal, loading, empty, and error states.

For each representative surface record:

- viewport and document width;
- computed font family/size/line height;
- touch-target dimensions;
- visible focus behaviour;
- wrapping of Vietnamese names;
- mobile bottom-nav geometry;
- horizontal overflow;
- before/after screenshot.

No production data mutation is required for visual verification. Existing safe
demo/read-only states should be used unless a specific interaction already has
an isolated test fixture.

## Acceptance Criteria

1. The complete application uses self-hosted Open Sans as the primary family
   and Barlow as the secondary family, both with Vietnamese rendering and no
   remote font dependency.
2. The visible design uses only black/off-black, white, neutral gray, and PRO7
   red as brand colours; no neon green, electric cyan, or generic blue accent
   remains.
3. Colour, spacing, radius, shadow, control size, typography, and z-index values
   resolve through documented tokens with bounded exceptions.
4. Phone, tablet, and desktop layouts have no document-level horizontal
   overflow on the required routes.
5. Four-item Member and five-item Admin bottom navigation align without clipped
   labels or pixel-specific role variants.
6. Buttons, inputs, icon controls, filters, tabs, and navigation satisfy the
   minimum target and font-size contracts.
7. Light/dark themes remain readable and visually consistent across shell,
   Profile, Auth, dialogs, popovers, and every product module.
8. Route structure, component order, permissions, CRUD behaviour, and real data
   binding remain unchanged.
9. Focus, reduced motion, loading, empty, error, modal, and popover behaviour
   remain accessible.
10. Focused contracts, the full unit suite, production build, rendered HTML
    tests, and authenticated browser QA pass before completion is claimed.
