# PRO7 Responsive System Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the approved PRO7 frontend readable, operable, and visually stable from 320px through wide desktop while preserving its established UX and CRUD flows.

**Architecture:** Add one final authoritative responsive CSS layer and one compact account-menu interaction instead of rewriting route components. Breakpoints are phone `<768px`, tablet `768–1023px`, and desktop `>=1024px`; browser QA verifies real computed layout after focused component and CSS contract tests pass.

**Tech Stack:** React 19, TypeScript, Next.js/Vinext, CSS, Node test runner, Vite, happy-dom, in-app browser.

**Spec:** `docs/superpowers/specs/2026-08-26-pro7-responsive-system-layer-design.md`

## Global Constraints

- Preserve existing route hierarchy, component content order, card geometry, black/white/red `#d71935` identity, light/dark behavior, and CRUD permissions.
- Do not add mock data, Supabase migrations, backend mutations, or new dashboard modules.
- Use phone `<768px`, tablet `768–1023px`, and desktop `>=1024px` as the authoritative shell modes.
- Primary interactive targets are at least 44×44px; mobile form text is at least 16px; semantic metadata/navigation labels are at least 12px.
- Keep `supabase/.temp/` untouched and unstaged.
- Observe RED before each production change and run focused GREEN before moving on.

---

### Task 1: Responsive shell and account menu

**Files:**
- Modify: `app/components/account-menu.tsx`
- Modify: `app/components/pro7-route-header.tsx`
- Modify: `app/globals.css`
- Create: `app/responsive.css`
- Modify: `app/layout.tsx`
- Modify: `tests/pro7-route-shell-mounted.test.ts`
- Create: `tests/responsive-system-mounted.test.ts`
- Create: `tests/fixtures/responsive-system-mounted-entry.ts`

**Interfaces:**
- Consumes: existing `AccountMenu({ email, settingsHref })`, `NotificationCenter`, route-shell theme/menu state.
- Produces: an accessible `.account-menu-trigger` and `.account-menu-popover`; authoritative phone/tablet/desktop shell behavior.

- [ ] **Step 1: Write failing mounted shell tests**

Add real mounted assertions that the notification button remains rendered, the account trigger exposes `aria-expanded`, click opens Profile/optional Settings/Logout, Escape closes the menu, and focus returns to the trigger.

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `npm run test:unit -- tests/responsive-system-mounted.test.ts tests/pro7-route-shell-mounted.test.ts`

Expected: FAIL because `.account-menu-trigger` and `.account-menu-popover` do not exist and the existing direct-action markup cannot satisfy the compact-menu behavior.

- [ ] **Step 3: Implement the minimal accessible account menu**

Keep the desktop identity and destinations, add a compact menu trigger for phone/tablet, use React state plus document keyboard/pointer listeners, return focus on close, and reuse the existing logout operation without changing its Supabase behavior.

- [ ] **Step 4: Add the authoritative shell CSS**

Append final rules that keep `.mobile-nav` hidden at `768–1023px`, fixed at `<768px`, retain the drawer/menu button below 1024px, keep notification visible, and reserve bottom padding only on phone.

- [ ] **Step 5: Run focused GREEN**

Run: `npm run test:unit -- tests/responsive-system-mounted.test.ts tests/pro7-route-shell-mounted.test.ts`

Expected: PASS with no hydration or focus-management errors.

### Task 2: Readability and touch-target contracts

**Files:**
- Modify: `app/globals.css`
- Modify: `app/responsive.css`
- Create: `tests/responsive-css-contract.test.ts`

**Interfaces:**
- Consumes: existing PRO7 component class names.
- Produces: final control-size, type-size, wrapping, grid, and reduced-motion behavior without changing route markup.

- [ ] **Step 1: Write failing computed-style tests**

Mount representative real markup with the compiled stylesheet and assert literal viewport outcomes: phone bottom navigation fixed with labels at least 12px, tablet bottom navigation hidden, notification visible, account/profile/auth inputs at least 16px, primary targets at least 44px, and reduced-motion rules disable animation.

- [ ] **Step 2: Run the CSS contract and verify RED**

Run: `npm run test:unit -- tests/responsive-css-contract.test.ts`

Expected: FAIL on the current 768px static navigation, hidden mobile notification, 7–10px semantic text, and sub-44px controls.

- [ ] **Step 3: Implement minimal final responsive overrides**

Normalize header spacing, search/filter wrapping, mobile/tablet grids, RSVP buttons, tactics controls, Funds/Settings panels, Profile/auth fields, navigation labels, focus states, and reduced motion. Keep desktop card ratios and existing colors unchanged.

- [ ] **Step 4: Run focused GREEN and regression tests**

Run: `npm run test:unit -- tests/responsive-css-contract.test.ts tests/pro7-shell-parity.test.ts tests/profile-page.test.ts tests/matches-pages.test.ts tests/tactics-pages.test.ts tests/settings-pages.test.ts`

Expected: PASS with existing route hierarchy and hosted component contracts intact.

### Task 3: Browser verification and completion gate

**Files:**
- Modify: `docs/audits/2026-08-26-pro7-checklist-design-audit.md`

**Interfaces:**
- Consumes: completed responsive shell and stylesheet.
- Produces: reproducible visual evidence and a final audit matrix.

- [ ] **Step 1: Run automated verification**

Run focused responsive tests, `npm run test:unit`, `npm test`, scoped ESLint, relevant TypeScript diagnostics, and `git diff --check`.

- [ ] **Step 2: Inspect real localhost routes**

Using the authenticated in-app browser, inspect Overview, Squad, Matches, Tactics, Profile, Funds, and Settings when permission allows at 375, 768, 1024, and 1440px. Verify no horizontal overflow, no obscured fixed navigation, and consistent light/dark surfaces.

- [ ] **Step 3: Exercise interactions**

Open/close the account menu by click and Escape, open the notification center on mobile, submit Squad search/filter without changing data, and verify route navigation remains functional.

- [ ] **Step 4: Update the audit and re-run completion checks**

Record fixed and role-blocked screens, restore the browser viewport, confirm `supabase/.temp/` is untouched, and run the final focused suite plus `git diff --check`.
