# PRO7 Typography System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every PRO7 surface render one self-hosted Be Vietnam Pro system with readable Vietnamese typography on desktop, tablet, and mobile.

**Architecture:** A dedicated final typography CSS layer owns font loading and semantic type tokens, then replaces legacy microtext route-by-route without changing component structure. Static cascade contracts plus mounted/browser verification prevent fallback fonts, sub-12 px meaningful text, clipping, and responsive regressions.

**Tech Stack:** CSS, Be Vietnam Pro variable WOFF2, React/Vinext, Node test runner, Happy DOM, in-app browser.

**Spec:** `docs/superpowers/specs/2026-08-26-pro7-typography-system-design.md`

## Global Constraints

- Be Vietnam Pro is the only branded product family.
- Font source is self-hosted, licensed, hashed, preloaded, and independent of remote font CDNs.
- Meaningful text is never below 12 px; phone input values remain at least 16 px.
- Ordinary controls and labels do not use weight 900; tracking never exceeds `.08em`.
- Vietnamese names/sentences are not forced uppercase or positively tracked.
- Numeric scores, dates, money, timers, and shirt numbers use tabular numerals.
- Preserve existing DOM order, controls, black/white/red palette, CRUD, RBAC, dark/light themes, and breakpoints.
- Preserve unrelated worktree changes and `supabase/.temp/`.

---

### Task 1: Font Asset and Root Type Contract

**Files:**
- Create: `public/fonts/be-vietnam-pro-variable.woff2`
- Create: `public/fonts/OFL.txt`
- Create: `app/typography.css`
- Modify: `app/layout.tsx`
- Create: `tests/typography-contract.test.ts`

**Interfaces:**
- Produces: `--font-sans`, `--font-numeric`, size/weight/leading/tracking tokens from the spec.
- Consumes: root layout and existing `globals.css`/`responsive.css` import order.

- [ ] **Step 1: Write asset/token RED tests**

```ts
assert.match(css, /font-family:"Be Vietnam Pro"/u);
assert.match(css, /font-display:swap/u);
assert.match(css, /--type-caption:12px/u);
assert.match(css, /--type-input:14px/u);
assert.match(css, /font-variant-numeric:tabular-nums/u);
```

Assert checked-in WOFF2/OFL files, exact preload, no remote `@import`, and layout import order `globals.css` → `responsive.css` → `typography.css`.

- [ ] **Step 2: Run RED**

Run: `npm run test:unit -- tests/typography-contract.test.ts`  
Expected: missing typography layer/assets.

- [ ] **Step 3: Acquire and verify official asset**

Use the official Google Fonts Be Vietnam Pro repository/package, copy the variable normal WOFF2 and OFL license, record source/version, and compute SHA-256. Reject any asset without Vietnamese glyph coverage.

- [ ] **Step 4: Implement root layer**

Define `@font-face` weights 400 800, root semantic tokens, `body` family/body line height, form inheritance, heading defaults, and `.numeric`/known KPI containers with tabular numerals. Import the layer last and preload `/fonts/be-vietnam-pro-variable.woff2` as `font/woff2` with `crossOrigin="anonymous"`.

- [ ] **Step 5: Run GREEN and commit**

```bash
npm run test:unit -- tests/typography-contract.test.ts tests/rendered-html.test.mjs
npx eslint app/layout.tsx tests/typography-contract.test.ts
git diff --check
git add public/fonts app/typography.css app/layout.tsx tests/typography-contract.test.ts
git commit -m "feat: add PRO7 typography foundation"
```

---

### Task 2: Shell and Authentication Typography

**Files:**
- Modify: `app/typography.css`
- Modify: `tests/typography-contract.test.ts`
- Modify: `tests/responsive-css-contract.test.ts`
- Test: `tests/password-recovery-pages.test.ts`

**Interfaces:**
- Consumes: Task 1 tokens.
- Produces: readable shell, nav, account, notification, Login/recovery/change-password typography.

- [ ] **Step 1: Add cascade RED fixtures**

At 320/375/768/1024 px assert page heading, sidebar/drawer/mobile nav, account popover, notification text, Login labels/inputs/buttons/errors/kickers, recovery fields, and password-change fields resolve to the spec tokens. Assert five Admin bottom-nav labels remain at least 12 px.

- [ ] **Step 2: Run RED**

Run: `npm run test:unit -- tests/typography-contract.test.ts tests/responsive-css-contract.test.ts tests/password-recovery-pages.test.ts`  
Expected: legacy microtext mismatches.

- [ ] **Step 3: Implement shell/auth mappings**

Map brand/nav/control/page heading/form/error/popover selectors to semantic tokens. Replace 900 weights and `.14em–.18em` tracking; preserve widths, 44 px targets, and phone 16 px field values.

- [ ] **Step 4: Run GREEN and commit**

```bash
npm run test:unit -- tests/typography-contract.test.ts tests/responsive-css-contract.test.ts tests/password-recovery-pages.test.ts tests/product-navigation.test.ts
git diff --check
git add app/typography.css tests/typography-contract.test.ts tests/responsive-css-contract.test.ts
git commit -m "fix: normalize shell and auth typography"
```

---

### Task 3: Overview, Squad, and Profile Typography

**Files:**
- Modify: `app/typography.css`
- Modify: `tests/typography-contract.test.ts`
- Test: `tests/overview-page.test.ts`
- Test: `tests/squad-pages.test.ts`
- Test: `tests/profile-page.test.ts`

**Interfaces:**
- Consumes: Task 1 tokens.
- Produces: semantic card, player, KPI, news, fixture, modal, and profile text.

- [ ] **Step 1: Add route RED fixtures**

Assert Overview card kickers/titles/news/fixtures/KPIs, Squad toolbar/summary/player cards/chips/stats/dialogs, and Profile labels/fields/helper/status text. Include `Lê Tuấn Đạt`, `Nguyễn Hữu Toàn`, and long validation error wrapping.

- [ ] **Step 2: Run RED**

Run: `npm run test:unit -- tests/typography-contract.test.ts tests/overview-page.test.ts tests/squad-pages.test.ts tests/profile-page.test.ts`

- [ ] **Step 3: Implement route mappings**

Use 12 px minimum metadata/chips, 13–15 px card copy, 16 px phone inputs, 18–22 px card titles, and tabular numeral KPIs. Permit names/errors to wrap; keep email/reference ellipsis only.

- [ ] **Step 4: Run GREEN and commit**

```bash
npm run test:unit -- tests/typography-contract.test.ts tests/overview-page.test.ts tests/squad-pages.test.ts tests/profile-page.test.ts tests/squad-provisioning-ui.test.ts
git diff --check
git add app/typography.css tests/typography-contract.test.ts
git commit -m "fix: normalize roster and profile typography"
```

---

### Task 4: Matches and Tactics Typography

**Files:**
- Modify: `app/typography.css`
- Modify: `tests/typography-contract.test.ts`
- Test: `tests/matches-pages.test.ts`
- Test: `tests/tactics-pages.test.ts`
- Test: `tests/tactics-mounted.test.ts`

**Interfaces:**
- Consumes: Task 1 tokens.
- Produces: readable match metadata, RSVP, analysis, tactics board, modes, player slots, and bench.

- [ ] **Step 1: Add route RED fixtures**

Assert opponent/venue/date, RSVP choices/progress/deadline, event/stat rows, tactic mode/formation/instruction, pitch labels, player tokens, and bench items at phone and desktop widths. Scores/timers use tabular numerals.

- [ ] **Step 2: Run RED**

Run: `npm run test:unit -- tests/typography-contract.test.ts tests/matches-pages.test.ts tests/tactics-pages.test.ts tests/tactics-mounted.test.ts`

- [ ] **Step 3: Implement route mappings**

Raise legacy 6–11 px text to semantic caption/control/body values, remove 900 weights, constrain only numeric display line heights, and allow opponent/player names to wrap without changing board coordinates.

- [ ] **Step 4: Run GREEN and commit**

```bash
npm run test:unit -- tests/typography-contract.test.ts tests/matches-pages.test.ts tests/tactics-pages.test.ts tests/tactics-mounted.test.ts
git diff --check
git add app/typography.css tests/typography-contract.test.ts
git commit -m "fix: normalize match and tactics typography"
```

---

### Task 5: Funds, Settings, Shared States, and Legacy Cleanup

**Files:**
- Modify: `app/typography.css`
- Modify: `app/globals.css`
- Modify: `app/responsive.css`
- Modify: `tests/typography-contract.test.ts`
- Test: `tests/funds-pages.test.ts`
- Test: `tests/settings-pages.test.ts`

**Interfaces:**
- Consumes: complete semantic mappings.
- Produces: zero meaningful production declarations below 12 px and no legacy branded families.

- [ ] **Step 1: Add Funds/Settings/state RED fixtures**

Cover balance/actions/dues/transactions, settings tabs/modules/roles/audit/danger zone, loading/error/empty/toast/modal text, light/dark variants, long VND values, and long Vietnamese names.

- [ ] **Step 2: Add global legacy scanner RED**

Parse final production CSS and fail on Inter/Montserrat, remote imports, meaningful 6–11 px declarations, control weight 900, or tracking above `.08em`. Permit `font-size:0` only for documented non-text layout helpers.

- [ ] **Step 3: Implement final mappings and remove obsolete declarations**

Map Funds/Settings/shared states, then replace or remove superseded microtext/family rules in `globals.css` and `responsive.css`. Keep the final typography layer authoritative and avoid `!important` except a documented cascade conflict proven by a test.

- [ ] **Step 4: Run focused and full GREEN**

```bash
npm run test:unit -- tests/typography-contract.test.ts tests/funds-pages.test.ts tests/settings-pages.test.ts tests/responsive-css-contract.test.ts
npm run test:unit
npm test
npx eslint app/layout.tsx tests/typography-contract.test.ts tests/responsive-css-contract.test.ts
git diff --check
```

- [ ] **Step 5: Commit**

```bash
git add app/globals.css app/responsive.css app/typography.css tests/typography-contract.test.ts tests/responsive-css-contract.test.ts
git commit -m "fix: complete PRO7 typography migration"
```

---

### Task 6: Browser Typography Acceptance

**Files:**
- Modify: `docs/audits/2026-08-26-pro7-checklist-design-audit.md`
- Create ignored report: `.superpowers/sdd/2026-08-26-pro7-typography-system/execution-report.md`

- [ ] **Step 1: Member browser matrix**

At 320/375/414/768/1024/1440 px and light/dark, inspect Login, Overview, Squad/detail, Match/detail, Tactics, Profile, notifications, modal, error/loading/empty states. Record computed family/size/weight/line-height, wrapping, overflow, and 200% zoom.

- [ ] **Step 2: Admin browser matrix**

Inspect Funds and Settings plus five-item bottom nav at 320/375/414 px. Confirm every item remains readable and no font metric causes clipping or horizontal scroll.

- [ ] **Step 3: Font loading and visual evidence**

Confirm the WOFF2 request succeeds, computed family is Be Vietnam Pro rather than fallback, no remote font request exists, and screenshots show Vietnamese diacritics correctly.

- [ ] **Step 4: Final regression and audit update**

```bash
npm run test:unit
npm test
npx eslint app/layout.tsx tests/typography-contract.test.ts tests/responsive-css-contract.test.ts
git diff --check
```

Update the audit with before/after findings, exact viewport/account coverage, asset hash/license, and any explicit exception.

- [ ] **Step 5: Commit evidence**

```bash
git add docs/audits/2026-08-26-pro7-checklist-design-audit.md
git commit -m "docs: record PRO7 typography audit"
```
