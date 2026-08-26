# PRO7 Typography System Design

**Date:** 2026-08-26  
**Status:** Approved in chat; awaiting written-spec review  
**Design input:** UI UX Pro Max typography and accessibility audit

## Goal

Replace the inconsistent Inter/Montserrat/Arial typography fallback with one
deliberate Vietnamese-first type system based on Be Vietnam Pro. Improve
readability and hierarchy across desktop, tablet, and mobile without changing
the approved PRO7 layouts, controls, black/white/red palette, route structure,
or backend behavior.

## Audit Baseline

The current application declares `Inter, Arial, sans-serif` for body text and
`Montserrat, Inter, Arial, sans-serif` for headings, but it loads neither Inter
nor Montserrat from a local asset or stylesheet. Rendering therefore depends on
fonts installed on the viewer's device and can fall back to Arial.

The CSS audit found 289 explicit `font-size` declarations. Of those, 160 use
6–11 px. Browser inspection of the localhost Login surface measured:

| Element | Current family declaration | Size | Weight | Line height |
|---|---|---:|---:|---:|
| Body | Inter/Arial | 16 px | 400 | 24 px |
| H1 | Montserrat/Inter/Arial | 30 px | 400 | 45 px |
| Form label | Inter/Arial | 10 px | 900 | 15 px |
| Input | Inter/Arial | 12 px | 400 | 18 px |
| Submit button | Inter/Arial | 11 px | 900 | 16.5 px |
| Uppercase kicker | Inter/Arial | 8 px | 900 | 12 px |

Many kickers use `letter-spacing` from `.14em` to `.18em`. At very small sizes
this weakens Vietnamese diacritic legibility and makes labels look disconnected.
Default line heights also vary by element because there is no semantic type
contract.

## Chosen Direction

Use **Be Vietnam Pro** as the only branded text family. Hierarchy comes from a
bounded size, weight, line-height, and tracking scale rather than mixing display
and body families.

UI UX Pro Max identified Be Vietnam Pro as the Vietnamese-friendly choice with
clean multilingual rendering. A single family also avoids cross-font metric
shifts and keeps dense dashboard surfaces visually coherent.

### Font delivery

- Self-host the official variable WOFF2 asset under `public/fonts`.
- Define explicit `@font-face` sources for normal text covering weights 400–800.
- Use `font-display: swap` and preload the primary WOFF2 from the root layout.
- The fallback stack is `system-ui, -apple-system, BlinkMacSystemFont,
  "Segoe UI", sans-serif`.
- Do not use a remote `@import`, runtime Google Fonts request, or a font that
  lacks full Vietnamese glyph coverage.
- Do not synthesize weights outside the loaded 400–800 range.

The font asset source, license, version, file hash, and subset coverage must be
recorded in the implementation report. No font binary is accepted without a
verified open-source license.

## Semantic Type Tokens

The implementation exposes the following root tokens. Values below are the
authoritative starting contract; component-specific values must resolve through
these tokens or a documented responsive `clamp()` derived from them.

### Families and numerals

| Token | Value | Use |
|---|---|---|
| `--font-sans` | `"Be Vietnam Pro", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif` | All product text |
| `--font-numeric` | `var(--font-sans)` with `font-variant-numeric: tabular-nums` | Scores, money, dates, timers, shirt numbers |

### Size scale

| Token | Desktop/tablet | Phone | Intended use |
|---|---:|---:|---|
| `--type-caption` | 12 px | 12 px | Metadata, timestamps, secondary annotations |
| `--type-label` | 12 px | 13 px | Form labels, chips, kickers, table labels |
| `--type-control` | 13 px | 14 px | Buttons, navigation, tabs, filters |
| `--type-body-sm` | 13 px | 14 px | Dense card copy and supporting content |
| `--type-body` | 14 px | 15 px | Default product copy |
| `--type-input` | 14 px | 16 px | Input, select, textarea values |
| `--type-title-sm` | 18 px | 18 px | Card and modal titles |
| `--type-title-md` | 22 px | 20 px | Section and detail titles |
| `--type-title-lg` | 28 px | 24 px | Route page heading |
| `--type-display` | 32 px | 28 px | Hero scores, balance and primary KPI emphasis |

Meaningful text must never render below 12 px. Decorative logo microcopy may be
12 px but receives no smaller exception. Icons and color cannot substitute for
a readable text label.

### Weight scale

| Token | Value | Use |
|---|---:|---|
| `--weight-regular` | 400 | Body copy and field values |
| `--weight-medium` | 500 | Secondary emphasis and metadata values |
| `--weight-semibold` | 600 | Labels, navigation and card titles |
| `--weight-bold` | 700 | Page headings, CTA labels and KPI values |
| `--weight-extrabold` | 800 | Brand mark and rare score emphasis only |

Weight 900 is removed from ordinary labels, buttons, kickers, and headings. The
type hierarchy must not rely on heavy weight alone.

### Line-height scale

| Token | Value | Use |
|---|---:|---|
| `--leading-tight` | 1.15 | Large scores and compact display numerals |
| `--leading-heading` | 1.25 | H1–H3 and card titles |
| `--leading-control` | 1.3 | Buttons, navigation, tabs and chips |
| `--leading-body` | 1.5 | Default body and field helper copy |
| `--leading-relaxed` | 1.6 | Multiline descriptions, errors and empty states |

### Tracking scale

| Token | Value | Use |
|---|---:|---|
| `--tracking-tight` | `-.02em` | Large headings only |
| `--tracking-normal` | `0` | Body, controls, fields and Vietnamese names |
| `--tracking-label` | `.035em` | Short labels and non-uppercase chips |
| `--tracking-caps` | `.075em` | Short uppercase kickers only |

No production rule may exceed `.08em`. Vietnamese names and sentences never use
forced uppercase or positive tracking.

## Component Mapping

| Surface | Typography contract |
|---|---|
| Brand/logo | 800, title-small; subtitle caption with caps tracking |
| Sidebar and drawer nav | control size, 600, control line height |
| Mobile bottom nav | caption/control responsive size, 600, maximum two lines |
| Page header | title-large, 700, tight tracking and heading line height |
| Card/section title | title-small or title-medium, 600–700 |
| Kicker/eyebrow | label, 600–700, caps tracking; no text below 12 px |
| Body and descriptions | body or body-small, 400–500, body line height |
| Buttons/tabs/filters | control, 600–700, control line height |
| Inputs/selects/textareas | input size, 400–500; phone value text remains 16 px |
| Form label | label, 600, normal or label tracking |
| Helper/error text | caption/body-small, 400–500, relaxed line height |
| Chips/status badges | caption, 600–700, no forced narrow uppercase |
| KPI values/scores/balance | title-large/display, 700–800, tabular numerals |
| Dates/timers/money/shirt numbers | tabular numerals, semantic size for context |
| Tables/audit/transactions | body-small with caption metadata; never microtext |
| Toast/modal/popover | body and control scale, explicit line heights |

Text truncation is permitted only for genuinely bounded single-line identifiers
such as an email or transaction reference. Player names, opponent names,
validation errors, RSVP states, and critical finance labels must wrap rather
than clip.

## Responsive Behavior

### Phone: below 768 px

- Default content is 15 px; interactive field values are 16 px to avoid mobile
  browser zoom.
- Bottom-nav labels remain readable with four Member or five Admin destinations
  at 320, 375, and 414 px.
- Headings use the phone column of the token scale and wrap without obscuring
  header actions.
- Card metadata and table-like rows reflow before reducing text below 12 px.
- Vietnamese names may wrap to two lines; role/status chips stay adjacent only
  when space permits.

### Tablet: 768–1023 px

- Use the desktop/tablet scale with fluid page headings.
- Drawer labels, popovers, modal copy, and two-column dashboard cards must not
  regress to the legacy microtext sizes.
- Typography changes may increase card height; fixed heights must yield to
  content rather than clipping.

### Desktop: 1024 px and above

- Preserve the hosted sidebar width and established card composition.
- Use compact but readable 13–14 px dashboard body text.
- Large metrics use tabular numerals so digits do not shift as data changes.
- The route header, Admin CTA, notification trigger, and account controls remain
  vertically aligned after the font metric change.

## Migration Strategy

1. Add and verify the self-hosted font asset and license.
2. Define font and semantic typography tokens in a dedicated final CSS layer.
3. Set the root family, default body size/line height, heading defaults, form
   inheritance, and numeric variant.
4. Add contract tests that parse the final cascade and fail if meaningful text
   resolves below 12 px or legacy Inter/Montserrat families remain.
5. Replace route and component microtext rules in bounded groups: shell/auth,
   Overview, Squad, Matches, Tactics, Funds, Settings, Profile, dialogs and
   notifications.
6. Adjust only the spacing, min-height, wrapping, and overflow rules required by
   new font metrics. Do not redesign component order, colors, controls, or data
   density beyond readability requirements.
7. Remove obsolete typography declarations after every migrated surface is
   covered by the semantic layer and browser QA.

The responsive CSS layer remains authoritative for breakpoints. Typography
tokens must not reintroduce conflicting phone/tablet/desktop media queries.

## Verification Matrix

### Automated contracts

- The Be Vietnam Pro `@font-face` source, weight range, preload, and fallback
  stack are present and reference a checked-in asset.
- `Inter`, `Montserrat`, remote font imports, 6–11 px meaningful text, weight
  900 controls, and tracking above `.08em` are absent from the final cascade.
- Input values resolve to at least 16 px on phones.
- Admin and Member mobile-nav labels resolve to at least 12 px and all items
  retain 44 px minimum touch targets.
- Heading, body, form, status, numeric, error, modal, toast and table fixtures
  map to the expected semantic tokens.
- Existing rendered HTML, authorization, CRUD and responsive tests stay green.

### Browser QA

Inspect the actual localhost render at 320, 375, 414, 768, 1024, and 1440 px in
both light and dark themes. Test at least:

- Login, forgot/reset password and first-login replacement;
- Overview, Squad list/detail and member provisioning dialog;
- Matches list/detail, invitation and RSVP states;
- Tactics landing/board;
- Admin Funds and Settings;
- Member Profile, account menu, notifications, errors, loading and empty states.

Use one Admin and one Member account. Verify computed family, size, weight,
line-height, wrapping, horizontal overflow, 200% browser zoom, keyboard focus,
and Vietnamese samples including `Lê Tuấn Đạt`, `Nguyễn Hữu Toàn`, `Lương Đức
Việt`, and `Trần Lê Anh`.

Capture before/after screenshots for the Login, Overview, Squad, Match detail,
Funds, Settings and Profile surfaces. The final audit must explicitly record any
remaining exception rather than hiding it with a smaller size.

## Acceptance Criteria

1. Every product surface renders Be Vietnam Pro from the checked-in variable
   font asset, with no dependency on a locally installed font.
2. All meaningful text is at least 12 px and follows the semantic size, weight,
   line-height and tracking scale.
3. Vietnamese names and sentences render complete diacritics without clipping,
   forced uppercase, or excessive tracking.
4. Forms remain readable and do not trigger phone auto-zoom.
5. Scores, timers, money and statistics use stable tabular numerals.
6. No desktop, tablet or mobile horizontal overflow is introduced, including
   the five-item Admin bottom navigation.
7. Dark/light themes, Admin/Member role variants and existing CRUD interaction
   behavior remain intact.
8. Automated tests, production build, rendered HTML checks and browser QA pass
   before the typography audit is marked complete.
