import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";
import { Window } from "happy-dom";

const typographyPath = new URL("../app/typography.css", import.meta.url);
const globalsPath = new URL("../app/globals.css", import.meta.url);
const responsivePath = new URL("../app/responsive.css", import.meta.url);
const layoutPath = new URL("../app/layout.tsx", import.meta.url);
const fontPath = new URL("../public/fonts/be-vietnam-pro-variable.woff2", import.meta.url);
const licensePath = new URL("../public/fonts/OFL.txt", import.meta.url);

test("the root layout loads the final self-hosted Be Vietnam Pro layer", async () => {
  const [layout, font, license] = await Promise.all([
    readFile(layoutPath, "utf8"),
    readFile(fontPath),
    readFile(licensePath, "utf8"),
  ]);
  assert.ok(font.byteLength > 50_000, "variable font asset is unexpectedly small");
  assert.equal(font.subarray(0, 4).toString("ascii"), "wOF2");
  assert.match(license, /SIL OPEN FONT LICENSE Version 1\.1/u);
  assert.ok(layout.indexOf('import "./globals.css"') < layout.indexOf('import "./responsive.css"'));
  assert.ok(layout.indexOf('import "./responsive.css"') < layout.indexOf('import "./typography.css"'));
  assert.match(layout, /href="\/fonts\/be-vietnam-pro-variable\.woff2"/u);
  assert.match(layout, /as="font"/u);
  assert.match(layout, /type="font\/woff2"/u);
  assert.match(layout, /crossOrigin="anonymous"/u);
});

test("the typography layer exposes the approved semantic scale", async () => {
  const css = await readFile(typographyPath, "utf8");
  assert.match(css, /font-family:\s*"Be Vietnam Pro"/u);
  assert.match(css, /font-display:\s*swap/u);
  assert.match(css, /font-weight:\s*400 800/u);
  assert.match(css, /--font-sans:\s*"Be Vietnam Pro"/u);
  assert.match(css, /--font-numeric:\s*var\(--font-sans\)/u);
  assert.match(css, /--type-caption:\s*12px/u);
  assert.match(css, /--type-input:\s*14px/u);
  assert.match(css, /--weight-extrabold:\s*800/u);
  assert.match(css, /--tracking-caps:\s*\.075em/u);
  assert.match(css, /font-variant-numeric:\s*tabular-nums/u);
  assert.doesNotMatch(css, /@import\s+url|fonts\.googleapis|fonts\.gstatic/iu);
});

test("form controls inherit the product font and phone inputs remain 16px", async () => {
  const css = await readFile(typographyPath, "utf8");
  assert.match(css, /button,\s*input,\s*select,\s*textarea[\s\S]*font:\s*inherit/iu);
  assert.match(css, /@media\s*\(max-width:\s*767px\)[\s\S]*--type-input:\s*16px/iu);
  assert.match(css, /input,\s*select,\s*textarea[\s\S]*font-size:\s*var\(--type-input\)/iu);
  assert.equal((await stat(fontPath)).isFile(), true);

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
