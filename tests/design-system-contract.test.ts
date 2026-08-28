import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { loadPro7CssFixture } from "./css-contract-helpers";

const cssPath = new URL("../app/globals.css", import.meta.url);
const squadPath = new URL("../app/teams/[slug]/squad/squad-view.tsx", import.meta.url);
const modalPath = new URL("../app/components/accessible-modal.tsx", import.meta.url);

test("PRO7 design tokens resolve the bounded card system", async () => {
  const fixture = await loadPro7CssFixture({
    width: 1440,
    body: '<main class="pro7-shell light"><article class="card">Nội dung</article></main>',
  });
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

test("tablet shell collapses at 900px and meaningful type remains readable", async () => {
  const css = await readFile(cssPath, "utf8");
  const tabletCss = css.match(/@media\(max-width:900px\)\{(?=[^@]*\.sidebar\{)[^@]*/u)?.[0] ?? "";
  assert.match(tabletCss, /\.sidebar\{transform:translateX\(-100%\)/u);
  assert.match(tabletCss, /\.nav-scrim\{[^}]*opacity:0[^}]*pointer-events:none/u);
  assert.match(tabletCss, /\.nav-scrim\.show\{[^}]*opacity:1[^}]*pointer-events:auto/u);
  const fixture = await loadPro7CssFixture({
    width: 900,
    body: '<main class="pro7-shell"><button class="theme-button">Chủ đề</button></main>',
  });
  try {
    const root = fixture.window.getComputedStyle(fixture.document.documentElement);
    assert.equal(root.getPropertyValue("--type-caption").trim(), "12px");
    assert.equal(fixture.window.getComputedStyle(fixture.document.querySelector(".theme-button")!).width, "44px");
  } finally {
    fixture.close();
  }
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)/u);
});

test("member provisioning uses the shared keyboard-safe modal primitive", async () => {
  const [source, modal] = await Promise.all([readFile(squadPath, "utf8"), readFile(modalPath, "utf8")]);
  assert.match(source, /import \{ AccessibleModal \} from/u);
  assert.match(source, /<AccessibleModal/u);
  assert.doesNotMatch(source, /<section className="modal provision-(?:member|result)-modal" role="dialog"/u);
  assert.match(modal, /const onCloseRef = useRef\(onClose\)/u);
  assert.match(modal, /onCloseRef\.current\(\)/u);
  assert.match(modal, /const closeBlockedRef = useRef\(closeBlocked\)/u);
  assert.match(modal, /closeBlockedRef\.current = closeBlocked/u);
  assert.match(modal, /\}, \[\]\);/u);
});
