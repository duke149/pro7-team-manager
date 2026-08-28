import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";
import { Window } from "happy-dom";
import { loadPro7CssFixture } from "./css-contract-helpers";

const typographyPath = new URL("../app/typography.css", import.meta.url);
const globalsPath = new URL("../app/globals.css", import.meta.url);
const responsivePath = new URL("../app/responsive.css", import.meta.url);
const layoutPath = new URL("../app/layout.tsx", import.meta.url);
const tokenPath = new URL("../app/design-tokens.css", import.meta.url);
const openSansFontPath = new URL("../node_modules/@fontsource-variable/open-sans/files/open-sans-vietnamese-wght-normal.woff2", import.meta.url);
const barlowFontPath = new URL("../node_modules/@fontsource/barlow/files/barlow-vietnamese-700-normal.woff2", import.meta.url);
const openSansLicensePath = new URL("../node_modules/@fontsource-variable/open-sans/LICENSE", import.meta.url);
const barlowLicensePath = new URL("../node_modules/@fontsource/barlow/LICENSE", import.meta.url);

test("the root layout loads self-hosted Open Sans and Barlow layers", async () => {
  const [layout, tokens, openSans, barlow, openSansLicense, barlowLicense] = await Promise.all([
    readFile(layoutPath, "utf8"),
    readFile(tokenPath, "utf8"),
    readFile(openSansFontPath),
    readFile(barlowFontPath),
    readFile(openSansLicensePath, "utf8"),
    readFile(barlowLicensePath, "utf8"),
  ]);
  assert.ok(openSans.byteLength > 10_000, "Open Sans asset is unexpectedly small");
  assert.ok(barlow.byteLength > 5_000, "Barlow asset is unexpectedly small");
  assert.equal(openSans.subarray(0, 4).toString("ascii"), "wOF2");
  assert.equal(barlow.subarray(0, 4).toString("ascii"), "wOF2");
  assert.match(openSansLicense, /SIL OPEN FONT LICENSE/u);
  assert.match(barlowLicense, /SIL OPEN FONT LICENSE/u);
  assert.ok(layout.indexOf('import "@fontsource-variable/open-sans/wght.css"') < layout.indexOf('import "./design-tokens.css"'));
  assert.ok(layout.indexOf('import "@fontsource/barlow/600.css"') < layout.indexOf('import "./design-tokens.css"'));
  assert.ok(layout.indexOf('import "@fontsource/barlow/700.css"') < layout.indexOf('import "./design-tokens.css"'));
  assert.ok(layout.indexOf('import "@fontsource/barlow/800.css"') < layout.indexOf('import "./design-tokens.css"'));
  assert.ok(layout.indexOf('import "./design-tokens.css"') < layout.indexOf('import "./globals.css"'));
  assert.ok(layout.indexOf('import "./globals.css"') < layout.indexOf('import "./responsive.css"'));
  assert.ok(layout.indexOf('import "./responsive.css"') < layout.indexOf('import "./typography.css"'));
  assert.match(tokens, /--font-sans:\s*"Open Sans Variable"/u);
  assert.match(tokens, /--font-display:\s*"Barlow"/u);
  assert.match(tokens, /--font-numeric:\s*var\(--font-display\)/u);
  assert.doesNotMatch(layout + tokens, /Be Vietnam Pro|Roboto|fonts\.googleapis|fonts\.gstatic/iu);
});

test("the typography layer exposes the approved semantic scale", async () => {
  const fixture = await loadPro7CssFixture({
    width: 375,
    body: '<main><h1>Đội hình chính</h1><strong class="numeric">123</strong><form class="match-form"><input /></form></main>',
  });
  try {
    const root = fixture.window.getComputedStyle(fixture.document.documentElement);
    assert.match(fixture.window.getComputedStyle(fixture.document.body).fontFamily, /Open Sans Variable/u);
    assert.match(fixture.window.getComputedStyle(fixture.document.querySelector("h1")!).fontFamily, /Barlow/u);
    assert.match(fixture.window.getComputedStyle(fixture.document.querySelector(".numeric")!).fontFamily, /Barlow/u);
    assert.equal(root.getPropertyValue("--type-caption").trim(), "12px");
    assert.equal(root.getPropertyValue("--type-input").trim(), "16px");
    assert.equal(root.getPropertyValue("--weight-extrabold").trim(), "800");
    assert.equal(root.getPropertyValue("--tracking-caps").trim(), ".075em");
    assert.equal(fixture.window.getComputedStyle(fixture.document.querySelector("input")!).fontSize, "16px");
  } finally {
    fixture.close();
  }
});

test("form controls inherit the product font and phone inputs remain 16px", async () => {
  const css = await readFile(typographyPath, "utf8");
  assert.match(css, /button,\s*input,\s*select,\s*textarea[\s\S]*font:\s*inherit/iu);
  assert.match(css, /@media\s*\(max-width:\s*767px\)[\s\S]*--type-input:\s*16px/iu);
  assert.match(css, /input,\s*select,\s*textarea[\s\S]*font-size:\s*var\(--type-input\)/iu);
  assert.equal((await stat(openSansFontPath)).isFile(), true);
  assert.equal((await stat(barlowFontPath)).isFile(), true);

  const browserWindow = new Window();
  browserWindow.happyDOM.setViewport({ width: 375, height: 812 });
  const style = browserWindow.document.createElement("style");
  style.textContent = [
    await readFile(globalsPath, "utf8"),
    await readFile(responsivePath, "utf8"),
    css,
  ].join("\n");
  browserWindow.document.head.append(style);
  const form = browserWindow.document.createElement("form");
  form.className = "match-form";
  const input = browserWindow.document.createElement("input");
  form.append(input);
  browserWindow.document.body.append(form);
  assert.equal(browserWindow.getComputedStyle(input).fontSize, "16px");
  await browserWindow.happyDOM.abort();
});

test("shell and authentication surfaces use semantic readable typography", async () => {
  const css = await readFile(typographyPath, "utf8");
  assert.match(css, /\.page-heading h1[\s\S]*font-size:\s*var\(--type-title-lg\)/u);
  assert.match(css, /\.main-nav :is\(a, button\)[\s\S]*font-size:\s*var\(--type-control\)/u);
  assert.match(css, /\.mobile-nav a[\s\S]*font-size:\s*var\(--type-caption\)/u);
  assert.match(css, /\.account-menu-popover :is\(a, button\)[\s\S]*font-size:\s*var\(--type-control\)/u);
  assert.match(css, /\.login-copy h1[\s\S]*font-size:\s*var\(--type-title-lg\)/u);
  assert.match(css, /\.login-form label[\s\S]*font-size:\s*var\(--type-label\)/u);
  assert.match(css, /\.login-form input[\s\S]*font-size:\s*var\(--type-input\)/u);
  assert.match(css, /\.login-form button[\s\S]*font-size:\s*var\(--type-control\)/u);
  assert.match(css, /\.login-error[\s\S]*font-size:\s*var\(--type-body-sm\)/u);
});

test("overview, squad, and profile surfaces map copy and data to semantic roles", async () => {
  const css = await readFile(typographyPath, "utf8");
  assert.match(css, /\.card-kicker[\s\S]*font-size:\s*var\(--type-label\)/u);
  assert.match(css, /\.news-item p[\s\S]*font-size:\s*var\(--type-body-sm\)/u);
  assert.match(css, /\.fixture-row > div b[\s\S]*font-size:\s*var\(--type-body-sm\)/u);
  assert.match(css, /\.search-box input[\s\S]*font-size:\s*var\(--type-input\)/u);
  assert.match(css, /\.position-chip[\s\S]*font-size:\s*var\(--type-caption\)/u);
  assert.match(css, /\.player-top h3[\s\S]*font-size:\s*var\(--type-title-sm\)/u);
  assert.match(css, /\.player-profile-value strong[\s\S]*font-size:\s*var\(--type-body\)/u);
  assert.match(css, /\.account-profile-fields input[\s\S]*font-size:\s*var\(--type-input\)/u);
  assert.match(css, /\.account-profile-message[\s\S]*font-size:\s*var\(--type-body-sm\)/u);
});

test("matches and tactics keep readable labels with stable numerals", async () => {
  const css = await readFile(typographyPath, "utf8");
  assert.match(css, /\.confirmed-strip[\s\S]*font-size:\s*var\(--type-label\)/u);
  assert.match(css, /\.confirmed-body > p[\s\S]*font-size:\s*var\(--type-body\)/u);
  assert.match(css, /\.rsvp-options :is\(button, span\)[\s\S]*font-size:\s*var\(--type-control\)/u);
  assert.match(css, /\.event-row[\s\S]*font-size:\s*var\(--type-body-sm\)/u);
  assert.match(css, /\.score-board strong[\s\S]*font-variant-numeric:\s*tabular-nums/u);
  assert.match(css, /\.mode-toggle button[\s\S]*font-size:\s*var\(--type-control\)/u);
  assert.match(css, /\.instruction-card textarea[\s\S]*font-size:\s*var\(--type-body\)/u);
  assert.match(css, /\.pitch-player[\s\S]*font-size:\s*var\(--type-caption\)/u);
  assert.match(css, /\.bench-player[\s\S]*font-size:\s*var\(--type-body-sm\)/u);
});

test("funds, settings, dialogs, and shared states use readable semantic text", async () => {
  const css = await readFile(typographyPath, "utf8");
  assert.match(css, /\.balance-card > strong[\s\S]*font-size:\s*var\(--type-display\)/u);
  assert.match(css, /\.due-row[\s\S]*font-size:\s*var\(--type-body-sm\)/u);
  assert.match(css, /\.transaction[\s\S]*font-size:\s*var\(--type-body-sm\)/u);
  assert.match(css, /\.settings-tabs a[\s\S]*font-size:\s*var\(--type-control\)/u);
  assert.match(css, /\.settings-module label[\s\S]*font-size:\s*var\(--type-label\)/u);
  assert.match(css, /\.audit-list[\s\S]*font-size:\s*var\(--type-body-sm\)/u);
  assert.match(css, /\.modal-head p[\s\S]*font-size:\s*var\(--type-body-sm\)/u);
  assert.match(css, /\.toast[\s\S]*font-size:\s*var\(--type-body-sm\)/u);
});

test("production CSS contains no legacy font or meaningful microtype", async () => {
  const paths = [
    new URL("../app/globals.css", import.meta.url),
    new URL("../app/responsive.css", import.meta.url),
    typographyPath,
  ];
  const css = (await Promise.all(paths.map((path) => readFile(path, "utf8")))).join("\n");
  assert.doesNotMatch(css, /\b(?:Inter|Montserrat|Arial)\b/iu);
  assert.doesNotMatch(css, /@import\s+url|fonts\.googleapis|fonts\.gstatic/iu);
  for (const match of css.matchAll(/font-size:\s*(-?\d+(?:\.\d+)?)px/giu)) {
    const size = Number(match[1]);
    assert.ok(size === 0 || size >= 12, `meaningful font-size ${size}px remains`);
  }
  assert.doesNotMatch(css, /font-weight:\s*900\b/iu);
  for (const match of css.matchAll(/letter-spacing:\s*(-?\d*\.?\d+)em/giu)) {
    assert.ok(Number(match[1]) <= 0.08, `letter-spacing ${match[1]}em exceeds the contract`);
  }
});
