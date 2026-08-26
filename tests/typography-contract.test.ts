import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

const typographyPath = new URL("../app/typography.css", import.meta.url);
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
});
