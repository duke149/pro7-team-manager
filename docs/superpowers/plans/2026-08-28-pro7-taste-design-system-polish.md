# PRO7 Taste Design System Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Normalize PRO7 typography, colour, spacing, sizing, responsive layout, and interaction polish without changing routes, permissions, CRUD behaviour, or approved component order.

**Architecture:** Introduce one token file loaded before the existing component CSS, restore the approved self-hosted Be Vietnam Pro font, make `responsive.css` authoritative for the three shell ranges, and migrate existing selectors to the shared tokens in bounded module groups. Each group begins with executable CSS/DOM contract regressions and ends with focused tests plus a reviewable commit.

**Tech Stack:** React 19, Vinext/Next-compatible App Router, vanilla CSS, Node test runner, Happy DOM, Playwright through the in-app Browser.

**Spec:** `docs/superpowers/specs/2026-08-28-pro7-taste-design-system-polish-design.md`

## Global Constraints

- Preserve every route, permission condition, server query, API payload, RPC call, mutation outcome, and real-data binding.
- Preserve visible module order and action order; semantic wrappers, ARIA attributes, and presentational state classes are permitted.
- Use only self-hosted `public/fonts/be-vietnam-pro-variable.woff2`; do not add a remote font request or new UI dependency.
- Brand colours are off-black/black, white, neutral gray, and PRO7 red; remove neon green, electric cyan, and generic blue accents.
- Phone is `0–767px`, tablet is `768–1023px`, and desktop is `1024px+`; narrower component breakpoints must not redefine the shell.
- Minimum interactive target is 44×44 px; phone inputs and primary form actions are at least 48 px high and phone input text is 16 px.
- Four-item Member and five-item Admin bottom navigation must use the same flexible layout.
- Every production change starts with a focused failing test and is verified on localhost before completion.
- Do not mutate Supabase, production data, local demo data, Auth, Storage, migrations, or Edge Functions.
- Preserve the pre-existing untracked `supabase/.temp/` directory.

---

### Task 1: Restore the approved font and establish the token source

**Files:**

- Create: `app/design-tokens.css`
- Modify: `app/layout.tsx`
- Modify: `app/typography.css`
- Modify: `app/globals.css`
- Modify: `package.json`
- Modify: `package-lock.json`
- Delete: `public/fonts/roboto-latin-ext.woff2`
- Delete: `public/fonts/roboto-latin.woff2`
- Delete: `public/fonts/roboto-vietnamese.woff2`
- Delete: `public/fonts/roboto-variable.woff2`
- Delete: `public/fonts/ROBOTO-LICENSE.txt`
- Create: `scripts/audit-pro7-css.mjs`
- Create: `tests/css-contract-helpers.ts`
- Create: `tests/css-audit.test.ts`
- Test: `tests/typography-contract.test.ts`
- Test: `tests/design-system-contract.test.ts`

**Interfaces:**

- Consumes: the checked-in Be Vietnam Pro WOFF2 and OFL license.
- Produces: root tokens `--font-sans`, `--font-numeric`, `--type-*`, `--color-*`, `--space-*`, `--radius-*`, `--shadow-*`, `--control-min-size`, and `--z-*` for every later task; `loadPro7CssFixture()` for computed-style tests; and `auditCss()` for an executable forbidden-colour audit.

- [ ] **Step 1: Rewrite the font/token contracts so the current Roboto and neon baseline fails**

Create `tests/css-contract-helpers.ts` by extracting the real cascade parser from
`tests/responsive-css-contract.test.ts` and exposing this interface:

```ts
export async function loadPro7CssFixture({ width, body }: { width: number; body: string }) {
  const window = new Window();
  window.happyDOM.setViewport({ width, height: 900 });
  const css = (await Promise.all([
    readFile(new URL("../app/design-tokens.css", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/responsive.css", import.meta.url), "utf8"),
    readFile(new URL("../app/typography.css", import.meta.url), "utf8"),
  ])).join("\n");
  const style = window.document.createElement("style");
  style.textContent = css;
  window.document.head.append(style);
  window.document.body.innerHTML = body;
  return { close: () => window.close(), document: window.document, window };
}
```

Create `tests/css-audit.test.ts` before its implementation. The audit must reject
real parsed declarations, not grep an expected source line:

```ts
import { auditCss } from "../scripts/audit-pro7-css.mjs";

test("the CSS audit rejects off-brand declaration values", () => {
  assert.deepEqual(auditCss(".bad{color:#00e676;background:#0068ff}"), [
    { property: "color", value: "#00e676" },
    { property: "background", value: "#0068ff" },
  ]);
  assert.deepEqual(auditCss(".ok{color:#d71935;background:#171719}"), []);
});
```

Update the font paths and computed-style assertions in
`tests/typography-contract.test.ts`:

```ts
const tokenPath = new URL("../app/design-tokens.css", import.meta.url);
const fontPath = new URL("../public/fonts/be-vietnam-pro-variable.woff2", import.meta.url);
const licensePath = new URL("../public/fonts/OFL.txt", import.meta.url);

test("the compiled style stack resolves Be Vietnam Pro and readable phone inputs", async () => {
  const [layout, tokens, font, license] = await Promise.all([
    readFile(layoutPath, "utf8"),
    readFile(tokenPath, "utf8"),
    readFile(fontPath),
    readFile(licensePath, "utf8"),
  ]);
  assert.equal(font.subarray(0, 4).toString("ascii"), "wOF2");
  assert.match(license, /SIL OPEN FONT LICENSE/u);
  assert.ok(layout.indexOf('import "./design-tokens.css"') < layout.indexOf('import "./globals.css"'));
  assert.match(layout, /href="\/fonts\/be-vietnam-pro-variable\.woff2"/u);
  assert.match(tokens, /font-family:\s*"Be Vietnam Pro"/u);
  assert.match(tokens, /font-weight:\s*400 800/u);
  assert.doesNotMatch(layout + tokens, /Roboto|fonts\.googleapis|fonts\.gstatic/iu);
  const fixture = await loadPro7CssFixture({
    width: 375,
    body: '<main><h1>Đội hình chính</h1><form class="match-form"><input /></form></main>',
  });
  try {
    assert.match(fixture.window.getComputedStyle(fixture.document.body).fontFamily, /Be Vietnam Pro/u);
    assert.equal(fixture.window.getComputedStyle(fixture.document.querySelector("input")!).fontSize, "16px");
  } finally {
    fixture.close();
  }
});
```

Update `tests/design-system-contract.test.ts` to assert final computed tokens and
card geometry:

```ts
test("PRO7 tokens resolve the bounded visual system", async () => {
  const fixture = await loadPro7CssFixture({ width: 1440, body: '<article class="card">Nội dung</article>' });
  try {
    const root = fixture.window.getComputedStyle(fixture.document.documentElement);
    const card = fixture.window.getComputedStyle(fixture.document.querySelector(".card")!);
    assert.equal(root.getPropertyValue("--brand-red-500").trim().toLowerCase(), "#d71935");
    assert.equal(root.getPropertyValue("--space-1").trim(), "4px");
    assert.equal(root.getPropertyValue("--space-7").trim(), "40px");
    assert.equal(card.borderRadius, "12px");
  } finally {
    fixture.close();
  }
});
```

- [ ] **Step 2: Run the focused contracts and verify RED**

Run:

```bash
npm run test:unit -- tests/css-audit.test.ts tests/typography-contract.test.ts tests/design-system-contract.test.ts
```

Expected: FAIL because the CSS audit module and token file are absent and the
root layout still preloads Roboto.

- [ ] **Step 3: Add the token layer and restore Be Vietnam Pro**

Create `app/design-tokens.css` with this foundation, then include the complete
semantic type scale from the specification:

```css
@font-face {
  font-family: "Be Vietnam Pro";
  src: url("/fonts/be-vietnam-pro-variable.woff2") format("woff2-variations");
  font-style: normal;
  font-weight: 400 800;
  font-display: swap;
}

:root {
  --font-sans: "Be Vietnam Pro", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --font-numeric: var(--font-sans);
  --brand-red-50: #fff0f2;
  --brand-red-500: #d71935;
  --brand-red-700: #a60f28;
  --neutral-0: #fff;
  --neutral-50: #f5f5f6;
  --neutral-100: #ededf0;
  --neutral-300: #dedee2;
  --neutral-600: #66666c;
  --neutral-900: #171719;
  --color-accent: var(--brand-red-500);
  --color-accent-strong: var(--brand-red-700);
  --color-canvas: var(--neutral-50);
  --color-surface: var(--neutral-0);
  --color-surface-raised: #fafafb;
  --color-text: var(--neutral-900);
  --color-text-muted: var(--neutral-600);
  --color-border: var(--neutral-300);
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 24px;
  --space-6: 32px;
  --space-7: 40px;
  --radius-control: 8px;
  --radius-card: 12px;
  --radius-dialog: 16px;
  --shadow-card: 0 8px 24px rgba(23, 23, 25, .06);
  --shadow-overlay: 0 24px 64px rgba(23, 23, 25, .2);
  --control-min-size: 44px;
  --z-drawer: 40;
  --z-header: 30;
  --z-navigation: 35;
  --z-popover: 70;
  --z-dialog: 80;
}
```

In `app/layout.tsx`, import the token file before `globals.css`, replace the
Roboto preloads with one Be Vietnam Pro preload, and retain `responsive.css`
before `typography.css`.

Remove font-face and root token ownership from `typography.css`; keep only
semantic selector mappings. Remove duplicate root tokens and QA neon/electric
variables from `globals.css`. Remove `@fontsource-variable/roboto` with:

```bash
npm uninstall @fontsource-variable/roboto
```

Delete only the tracked Roboto files listed above; keep Be Vietnam Pro and
`public/fonts/OFL.txt`.

Implement `scripts/audit-pro7-css.mjs` as a small declaration parser that strips
comments, iterates rule bodies, lowercases property/value pairs, and returns an
ordered violation for values containing `#00e676`, `#00b4d8`, `#0068ff`,
`#38bdf8`, or `#2b54c8`. It must ignore selector text so a class name alone does
not fail the audit.

- [ ] **Step 4: Run focused tests and production build**

Run:

```bash
npm run test:unit -- tests/css-audit.test.ts tests/typography-contract.test.ts tests/design-system-contract.test.ts
npm run build
git diff --check
```

Expected: token/font contracts PASS, build exits 0, and diff check is clean.

- [ ] **Step 5: Commit the foundation**

```bash
git add app/design-tokens.css app/layout.tsx app/typography.css app/globals.css package.json package-lock.json public/fonts scripts/audit-pro7-css.mjs tests/css-contract-helpers.ts tests/css-audit.test.ts tests/typography-contract.test.ts tests/design-system-contract.test.ts
git commit -m "style: restore PRO7 design foundations"
```

---

### Task 2: Make the shell and responsive ranges authoritative

**Files:**

- Modify: `app/globals.css`
- Modify: `app/responsive.css`
- Test: `tests/responsive-css-contract.test.ts`
- Test: `tests/pro7-shell-parity.test.ts`

**Interfaces:**

- Consumes: token names from Task 1 and existing shell classes in
  `app/components/pro7-route-shell.tsx`.
- Produces: one phone/tablet/desktop shell contract used by all route modules.

- [ ] **Step 1: Add failing cascade tests for shell boundaries and role-neutral bottom navigation**

Replace its private parser with `loadPro7CssFixture()` and extend
`tests/responsive-css-contract.test.ts` with computed cascade checks:

```ts
test("the shell switches once between phone, tablet, and desktop navigation", async () => {
  const body = '<aside class="sidebar"></aside><main class="app-main"><header class="app-header"></header><nav class="mobile-nav"><a>Tổng quan</a><a>Đội hình</a><a>Trận</a><a>Sơ đồ</a><a>Quỹ</a></nav></main>';
  const phone = await loadPro7CssFixture({ width: 767, body });
  const tablet = await loadPro7CssFixture({ width: 768, body });
  const desktop = await loadPro7CssFixture({ width: 1024, body });
  try {
    assert.equal(phone.window.getComputedStyle(phone.document.querySelector(".mobile-nav")!).display, "grid");
    assert.equal(tablet.window.getComputedStyle(tablet.document.querySelector(".mobile-nav")!).display, "none");
    assert.equal(desktop.window.getComputedStyle(desktop.document.querySelector(".sidebar")!).position, "fixed");
  } finally {
    phone.close(); tablet.close(); desktop.close();
  }
});

test("phone navigation works for the five-item Admin variant", async () => {
  const fixture = await loadPro7CssFixture({ width: 320, body: '<nav class="mobile-nav"><a>1</a><a>2</a><a>3</a><a>4</a><a>5</a></nav>' });
  try {
    const nav = fixture.document.querySelector(".mobile-nav")!;
    const links = [...fixture.document.querySelectorAll(".mobile-nav a")];
    assert.equal(fixture.window.getComputedStyle(nav).gridTemplateColumns, "repeat(auto-fit, minmax(0px, 1fr))");
    assert.equal(links.length, 5);
    assert.ok(links.every((link) => fixture.window.getComputedStyle(link).minHeight === "56px"));
  } finally {
    fixture.close();
  }
});
```

- [ ] **Step 2: Run the shell contracts and verify RED**

Run:

```bash
npm run test:unit -- tests/responsive-css-contract.test.ts tests/pro7-shell-parity.test.ts
```

Expected: FAIL while legacy 760/900 shell overrides remain.

- [ ] **Step 3: Consolidate shell rules**

Keep these exact range responsibilities in `app/responsive.css`:

```css
@media (max-width: 1023px) {
  .sidebar { width: 270px; transform: translateX(-105%); }
  .sidebar.open { transform: translateX(0); }
  .app-main { margin-left: 0; padding-bottom: 0; }
  .mobile-nav { display: none; }
  .app-header { min-height: 88px; padding: 14px 18px; }
}

@media (max-width: 767px) {
  .app-main { padding-bottom: calc(76px + env(safe-area-inset-bottom)); }
  .app-header { min-height: 72px; padding: 12px 14px; }
  .page-content { padding: 18px 14px calc(92px + env(safe-area-inset-bottom)); }
  .mobile-nav {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(0, 1fr));
    min-height: 72px;
  }
}
```

Remove only shell/navigation/header/page-gutter declarations from overlapping
760/900 rules in `globals.css`. Keep component-specific narrow reflows.
Normalize icon controls to `var(--control-min-size)`, header/popover z-index to
the Task 1 tokens, active navigation to red + white, and all shell spacing to
the spacing scale.

- [ ] **Step 4: Verify the shell and commit**

Run:

```bash
npm run test:unit -- tests/responsive-css-contract.test.ts tests/pro7-shell-parity.test.ts
npm test
git diff --check
```

Expected: all focused tests PASS and build exits 0.

```bash
git add app/globals.css app/responsive.css tests/responsive-css-contract.test.ts tests/pro7-shell-parity.test.ts
git commit -m "style: unify PRO7 responsive shell"
```

---

### Task 3: Align Auth, Profile, and shared interaction states

**Files:**

- Modify: `app/globals.css`
- Modify: `app/typography.css`
- Modify: `app/login/login-form.tsx` only if an ARIA/state class is required
- Modify: `app/account/profile/profile-shell.tsx` only if a state class is required
- Test: `tests/typography-contract.test.ts`
- Test: `tests/profile-theme-mounted.test.ts`
- Test: `tests/login-username-mounted.test.ts`
- Test: `tests/password-recovery-pages.test.ts`
- Test: `tests/design-system-contract.test.ts`

**Interfaces:**

- Consumes: global tokens and authoritative breakpoints.
- Produces: a shared visual contract for Auth/Profile controls, focus, hover,
  pressed, disabled, success, error, modal, and popover states.

- [ ] **Step 1: Add failing computed-style and source contracts**

Add a real fixture to `tests/design-system-contract.test.ts`:

```ts
test("shared controls expose target, focus, pressed, and disabled states", async () => {
  const fixture = await loadPro7CssFixture({
    width: 375,
    body: '<main class="login-shell"><section class="login-card"><form class="login-form"><button disabled>Đăng nhập</button><input /></form></section><section class="account-profile-card">Hồ sơ</section></main>',
  });
  try {
    const button = fixture.document.querySelector("button")!;
    const input = fixture.document.querySelector("input")!;
    input.focus();
    assert.equal(fixture.window.getComputedStyle(button).minHeight, "48px");
    assert.equal(fixture.window.getComputedStyle(button).cursor, "not-allowed");
    assert.equal(fixture.window.getComputedStyle(input).fontSize, "16px");
    assert.equal(fixture.window.getComputedStyle(fixture.document.querySelector(".login-card")!).borderRadius, "16px");
    assert.equal(fixture.window.getComputedStyle(fixture.document.querySelector(".account-profile-card")!).borderRadius, "12px");
  } finally {
    fixture.close();
  }
});
```

- [ ] **Step 2: Run focused tests and verify RED**

```bash
npm run test:unit -- tests/design-system-contract.test.ts tests/typography-contract.test.ts tests/profile-theme-mounted.test.ts tests/login-username-mounted.test.ts tests/password-recovery-pages.test.ts
```

Expected: the new token/state assertions FAIL against the one-off rules.

- [ ] **Step 3: Normalize Auth/Profile/shared states**

Add shared interaction rules in `globals.css` using existing class names:

```css
:is(button, a, input, select, textarea):focus-visible {
  outline: 3px solid var(--color-focus);
  outline-offset: 2px;
}

:is(.primary-button, .soft-button, .dark-ghost, .text-button, .login-form button):active:not(:disabled) {
  transform: translateY(1px);
}

:is(button, input, select, textarea):disabled {
  cursor: not-allowed;
  opacity: .62;
}
```

Map login/profile canvas, surface, text, muted text, borders, cards, fields,
buttons, messages, radii, shadows, and gaps to shared tokens. Keep phone inputs
at 16 px/48 px. Preserve show-password, theme toggle, account menu, avatar,
forgot/reset/change-password, and form behaviour unchanged.

- [ ] **Step 4: Verify mounted interactions and commit**

```bash
npm run test:unit -- tests/design-system-contract.test.ts tests/typography-contract.test.ts tests/profile-theme-mounted.test.ts tests/login-username-mounted.test.ts tests/password-recovery-pages.test.ts tests/profile-page.test.ts
npm run build
git diff --check
```

Expected: all focused tests PASS and build exits 0.

```bash
git add app/globals.css app/typography.css app/login/login-form.tsx app/account/profile/profile-shell.tsx tests/design-system-contract.test.ts tests/typography-contract.test.ts tests/profile-theme-mounted.test.ts tests/login-username-mounted.test.ts tests/password-recovery-pages.test.ts
git commit -m "style: align authentication and profile surfaces"
```

If neither TSX file changes, omit it from `git add` rather than creating an
unnecessary markup diff.

---

### Task 4: Polish Overview and Squad density without changing data flow

**Files:**

- Modify: `app/globals.css`
- Modify: `app/responsive.css`
- Modify: `app/typography.css`
- Modify: `app/teams/[slug]/squad/squad-toolbar.tsx` only if a scroll affordance class/label is required
- Test: `tests/overview-page.test.ts`
- Test: `tests/overview-mounted.test.ts`
- Test: `tests/squad-toolbar-mounted.test.ts`
- Test: `tests/squad-pages.test.ts`
- Test: `tests/design-system-contract.test.ts`

**Interfaces:**

- Consumes: token, shell, typography, and interaction contracts.
- Produces: normalized card geometry plus an operable/discoverable mobile Squad
  filter row.

- [ ] **Step 1: Add failing contracts for compact empty cards and the filter row**

Add computed-style assertions to `tests/design-system-contract.test.ts`:

```ts
test("Overview and Squad use tokenized card rhythm", async () => {
  const fixture = await loadPro7CssFixture({
    width: 1440,
    body: '<main class="view-stack"><article class="card"></article><form class="squad-toolbar"></form></main>',
  });
  try {
    assert.equal(fixture.window.getComputedStyle(fixture.document.querySelector(".card")!).borderRadius, "12px");
    assert.equal(fixture.window.getComputedStyle(fixture.document.querySelector(".view-stack")!).gap, "24px");
    assert.equal(fixture.window.getComputedStyle(fixture.document.querySelector(".squad-toolbar")!).padding, "16px");
  } finally {
    fixture.close();
  }
});
```

Extend the mounted Squad toolbar fixture to assert every quick filter remains
reachable at 390 px and query navigation remains unchanged after clicking it.

- [ ] **Step 2: Run the module contracts and verify RED**

```bash
npm run test:unit -- tests/design-system-contract.test.ts tests/overview-page.test.ts tests/overview-mounted.test.ts tests/squad-toolbar-mounted.test.ts tests/squad-pages.test.ts
```

Expected: new token and mobile discoverability assertions FAIL.

- [ ] **Step 3: Migrate Overview and Squad selectors**

Use `--space-3/4/5`, `--radius-control/card/dialog`, and shared surface/border
tokens for Overview hero, availability, statistics, news, schedule, toolbar,
summary, player cards, detail cards, filters, chips, and provisioning dialogs.

Implement the phone filter collection as deliberate horizontal scrolling:

```css
@media (max-width: 767px) {
  .filter-row {
    display: flex;
    gap: var(--space-2);
    overflow-x: auto;
    overscroll-behavior-inline: contain;
    scroll-snap-type: inline proximity;
    scrollbar-width: thin;
    padding: 0 var(--space-1) var(--space-2);
  }
  .filter-row > * { flex: 0 0 auto; scroll-snap-align: start; }
  .overview-empty-hero { min-height: 220px; }
}
```

Do not change search/filter query parameters, card links, member controls,
provisioning payloads, role gates, or real player data.

- [ ] **Step 4: Verify Overview/Squad and commit**

```bash
npm run test:unit -- tests/design-system-contract.test.ts tests/overview-page.test.ts tests/overview-mounted.test.ts tests/squad-toolbar-mounted.test.ts tests/squad-pages.test.ts tests/pro7-shell-parity.test.ts
npm run build
git diff --check
```

Expected: all focused tests PASS and build exits 0.

```bash
git add app/globals.css app/responsive.css app/typography.css 'app/teams/[slug]/squad/squad-toolbar.tsx' tests/design-system-contract.test.ts tests/overview-page.test.ts tests/overview-mounted.test.ts tests/squad-toolbar-mounted.test.ts tests/squad-pages.test.ts
git commit -m "style: polish overview and squad layouts"
```

---

### Task 5: Polish Matches and Tactics while preserving interaction semantics

**Files:**

- Modify: `app/globals.css`
- Modify: `app/responsive.css`
- Modify: `app/typography.css`
- Test: `tests/matches-pages.test.ts`
- Test: `tests/matches-mounted.test.ts`
- Test: `tests/tactics-pages.test.ts`
- Test: `tests/tactics-mounted.test.ts`
- Test: `tests/design-system-contract.test.ts`

**Interfaces:**

- Consumes: shared tokens and responsive shell.
- Produces: neutral/red RSVP, event, pitch, toolbar, bench, analysis, and empty
  state presentation with unchanged client mutation logic.

- [ ] **Step 1: Add failing off-brand colour and target-size regressions**

Extend `tests/css-audit.test.ts` to run `auditCss()` against the concatenated
production styles, and add a computed target-size fixture:

```ts
test("match and tactics presentation contains no neon or generic blue accents", async () => {
  const fixture = await loadPro7CssFixture({
    width: 375,
    body: '<div class="rsvp-options"><button>Có</button></div><div class="tactics-toolbar"><button>Lưu</button><select><option>2-3-1</option></select></div><div class="pitch"></div>',
  });
  try {
    assert.equal(fixture.window.getComputedStyle(fixture.document.querySelector(".rsvp-options button")!).minHeight, "44px");
    assert.equal(fixture.window.getComputedStyle(fixture.document.querySelector(".tactics-toolbar button")!).minHeight, "44px");
    assert.equal(fixture.window.getComputedStyle(fixture.document.querySelector(".tactics-toolbar select")!).minHeight, "44px");
    assert.equal(fixture.window.getComputedStyle(fixture.document.querySelector(".pitch")!).getPropertyValue("--pitch-line").trim(), "var(--color-accent)");
  } finally {
    fixture.close();
  }
});
```

- [ ] **Step 2: Run focused tests and verify RED**

```bash
npm run test:unit -- tests/design-system-contract.test.ts tests/matches-pages.test.ts tests/matches-mounted.test.ts tests/tactics-pages.test.ts tests/tactics-mounted.test.ts
```

Expected: off-brand colour assertions FAIL against the QA extension.

- [ ] **Step 3: Normalize Matches and Tactics presentation**

Replace event/status accent colours with shared red/neutral tokens while
preserving icon and text labels. Keep selected RSVP buttons distinguishable by
border, fill, icon, and `aria-pressed`, not colour alone. Tokenize match hero,
analysis card, timeline, schedule/history cards, pitch, player markers,
formation/mode controls, instructions, bench, save/apply, loading, and error
states.

Use these responsive rules:

```css
@media (max-width: 767px) {
  .matches-empty-card { min-height: 180px; }
  .rsvp-options { grid-template-columns: 1fr; }
  .tactics-toolbar { align-items: stretch; gap: var(--space-3); }
  .mode-toggle { width: 100%; }
  .pitch-card { padding: var(--space-2); }
}
```

Do not modify RSVP deadlines, pending state, invitation payloads, analysis CRUD,
tactics save/apply tokens, pointer/keyboard swaps, or version handling.

- [ ] **Step 4: Verify interaction suites and commit**

```bash
npm run test:unit -- tests/design-system-contract.test.ts tests/matches-pages.test.ts tests/matches-mounted.test.ts tests/matches-actions.test.ts tests/tactics-pages.test.ts tests/tactics-mounted.test.ts tests/tactics-actions.test.ts
npm run build
git diff --check
```

Expected: focused interaction suites PASS and build exits 0.

```bash
git add app/globals.css app/responsive.css app/typography.css tests/design-system-contract.test.ts tests/matches-pages.test.ts tests/matches-mounted.test.ts tests/tactics-pages.test.ts tests/tactics-mounted.test.ts
git commit -m "style: polish matches and tactics surfaces"
```

---

### Task 6: Polish Admin Funds, Settings, and shared feedback surfaces

**Files:**

- Modify: `app/globals.css`
- Modify: `app/responsive.css`
- Modify: `app/typography.css`
- Test: `tests/funds-pages.test.ts`
- Test: `tests/settings-pages.test.ts`
- Test: `tests/notification-center-mounted.test.ts`
- Test: `tests/design-system-contract.test.ts`
- Test: `tests/responsive-css-contract.test.ts`

**Interfaces:**

- Consumes: shared visual foundations and role-neutral navigation contract.
- Produces: tokenized Admin-only data surfaces and shared modal/popover/loading/
  empty/error geometry.

- [ ] **Step 1: Add failing Admin density and bottom-nav regressions**

Add a five-link 320 px fixture to `tests/responsive-css-contract.test.ts` that
asserts each item has at least 44 px inline space and a 56 px minimum height.
Add computed-style assertions:

```ts
test("Funds and Settings use shared numeric, surface, and spacing tokens", async () => {
  const fixture = await loadPro7CssFixture({
    width: 1440,
    body: '<article class="balance-card"></article><section class="settings-module"></section><aside class="notification-popover"></aside>',
  });
  try {
    assert.equal(fixture.window.getComputedStyle(fixture.document.querySelector(".balance-card")!).borderRadius, "12px");
    assert.equal(fixture.window.getComputedStyle(fixture.document.querySelector(".settings-module")!).padding, "24px");
    assert.equal(fixture.window.getComputedStyle(fixture.document.querySelector(".notification-popover")!).boxShadow, "0 24px 64px rgba(23, 23, 25, 0.2)");
  } finally {
    fixture.close();
  }
});
```

- [ ] **Step 2: Run focused Admin/shared tests and verify RED**

```bash
npm run test:unit -- tests/design-system-contract.test.ts tests/responsive-css-contract.test.ts tests/funds-pages.test.ts tests/settings-pages.test.ts tests/notification-center-mounted.test.ts
```

Expected: tokenized Admin surface assertions FAIL.

- [ ] **Step 3: Normalize Admin and shared state styles**

Map balances, fund actions, dues, transactions, QR dialog, settings tabs/modules,
role cards, audit rows, danger zone, notification popover, toast, modal, loading,
empty, and error states to shared tokens. Keep money/count figures tabular.

At phone widths, stack action cards and dense rows before truncating content:

```css
@media (max-width: 767px) {
  .fund-actions, .fund-content-grid, .role-grid { grid-template-columns: 1fr; }
  .fund-stats { display: grid; grid-template-columns: 1fr; overflow: visible; }
  .audit-list article { grid-template-columns: 60px minmax(0, 1fr); }
  .audit-list code { grid-column: 1 / -1; white-space: normal; overflow-wrap: anywhere; }
}
```

Do not alter Funds/Settings permission gates, payment settings, transaction/dues
mutations, team-profile mutations, audit redaction, or danger-zone confirmation.

- [ ] **Step 4: Verify Admin/shared surfaces and commit**

```bash
npm run test:unit -- tests/design-system-contract.test.ts tests/responsive-css-contract.test.ts tests/funds-pages.test.ts tests/funds-mounted.test.ts tests/settings-pages.test.ts tests/settings-actions.test.ts tests/notification-center-mounted.test.ts
npm run build
git diff --check
```

Expected: all focused tests PASS and build exits 0.

```bash
git add app/globals.css app/responsive.css app/typography.css tests/design-system-contract.test.ts tests/responsive-css-contract.test.ts tests/funds-pages.test.ts tests/settings-pages.test.ts tests/notification-center-mounted.test.ts
git commit -m "style: polish admin and feedback surfaces"
```

---

### Task 7: Run full verification and authenticated browser QA

**Files:**

- Modify: `docs/audits/2026-08-26-pro7-checklist-design-audit.md`
- Create: `docs/audits/2026-08-28-pro7-taste-design-system-audit.md`
- Modify: production CSS or focused tests only when a browser finding is first
  reproduced by an automated regression.

**Interfaces:**

- Consumes: all prior task deliverables.
- Produces: final evidence matrix and any test-backed browser corrections.

- [ ] **Step 1: Run the complete automated verification baseline**

```bash
npm run test:unit
npm test
npx eslint app/layout.tsx app/components app/login app/account app/teams tests/design-system-contract.test.ts tests/typography-contract.test.ts tests/responsive-css-contract.test.ts
git diff --check
```

Expected: unit tests report zero failures with only documented environment-gated
skips; production build/render tests pass; scoped ESLint and diff check exit 0.

- [ ] **Step 2: Audit the authenticated Member surfaces in the in-app Browser**

Use the existing Member session and inspect 320, 375, 390, 414, 768, 1024, and
1440 px in both themes. Visit:

```text
/teams/nat-fc/overview
/teams/nat-fc/squad
/teams/nat-fc/squad/c3293867-d875-43a5-b0fd-15a3c2d84737
/teams/nat-fc/matches
/teams/nat-fc/matches/70000000-0000-4000-8000-000000000001
/teams/nat-fc/tactics
/teams/nat-fc/tactics/70000000-0000-4000-8000-000000000001
/account/profile
```

For each representative route capture screenshot plus `innerWidth`,
`documentElement.scrollWidth`, computed body font, H1 size/line height, icon
target sizes, and bottom-nav item geometry. Confirm Funds and Settings remain
unavailable to Member.

- [ ] **Step 3: Audit the authenticated Admin surfaces**

Use an existing Admin session without reading browser storage or exposing
credentials. Inspect the same viewport/theme matrix for Overview, Squad,
Matches, Tactics, plus:

```text
/teams/nat-fc/funds
/teams/nat-fc/admin/settings
```

Confirm five bottom-nav items fit at 320/375/414 px, Funds/Settings controls are
visible only to Admin, and no save/delete/payment/team-profile action is
submitted during visual QA.

- [ ] **Step 4: Convert each real browser defect into RED → GREEN before editing**

For any observed defect, add the smallest mounted or computed-style regression,
run it to capture RED, patch the relevant existing CSS selector, rerun focused
tests to GREEN, then repeat the affected browser measurement. Do not apply a
visual-only change without this sequence.

- [ ] **Step 5: Record the final audit**

Create `docs/audits/2026-08-28-pro7-taste-design-system-audit.md` with:

```markdown
# PRO7 Taste design-system audit

## Scope and versions
## Before/after source findings
## Automated verification
## Member browser matrix
## Admin browser matrix
## Theme and accessibility results
## Remaining documented exceptions
## Screenshot inventory
```

Append a short dated addendum to the prior Checklist Design audit linking to the
new report and correcting the current Be Vietnam Pro/token evidence.

- [ ] **Step 6: Commit final evidence and any test-backed corrections**

```bash
git add app public package.json package-lock.json tests docs/audits/2026-08-26-pro7-checklist-design-audit.md docs/audits/2026-08-28-pro7-taste-design-system-audit.md
git commit -m "test: verify PRO7 design system polish"
```

- [ ] **Step 7: Verify the final commit state**

```bash
git status --short
git log -7 --oneline
git diff HEAD~1 --check
```

Expected: only the pre-existing untracked `supabase/.temp/` remains; the latest
commits correspond to the seven reviewed checkpoints; diff check exits 0.

## Self-Review Record

- Spec coverage: font, colour, spacing, radii, shadows, sizing, responsive
  ranges, every product surface, Admin/Member, light/dark, accessibility, CRUD
  preservation, browser QA, and full verification each map to an explicit task.
- Placeholder scan: the plan contains no deferred implementation instruction;
  every task includes exact files, regression examples, commands, expected
  failure/pass evidence, implementation boundaries, and commit command.
- Type/interface consistency: all later tasks consume the exact token names
  created in Task 1 and the exact responsive ranges produced in Task 2.
