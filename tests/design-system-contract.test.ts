import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const cssPath = new URL("../app/globals.css", import.meta.url);
const squadPath = new URL("../app/teams/[slug]/squad/squad-view.tsx", import.meta.url);
const modalPath = new URL("../app/components/accessible-modal.tsx", import.meta.url);

test("PRO7 design tokens use semantic red names and contain no neon residue", async () => {
  const css = await readFile(cssPath, "utf8");
  assert.match(css, /--brand-red-500:#d71935/u);
  assert.match(css, /--color-accent:var\(--brand-red-500\)/u);
  assert.doesNotMatch(css, /--lime(?:-dark)?\s*:/u);
  assert.doesNotMatch(css, /156\s*,\s*255\s*,\s*56|26\s*,\s*47\s*,\s*7|#(?:8eed2d|efffdc|527e18|315b05|426412|608f20|5d8f1c|66991f|5e8f1e|5f8e21|587f21|55831b|e7f9d5)/iu);
});

test("tablet shell collapses at 900px and meaningful type remains readable", async () => {
  const css = await readFile(cssPath, "utf8");
  const tabletCss = css.match(/@media\(max-width:900px\)\{(?=[^@]*\.sidebar\{)[^@]*/u)?.[0] ?? "";
  assert.match(tabletCss, /\.sidebar\{transform:translateX\(-100%\)/u);
  assert.match(tabletCss, /\.nav-scrim\{[^}]*opacity:0[^}]*pointer-events:none/u);
  assert.match(tabletCss, /\.nav-scrim\.show\{[^}]*opacity:1[^}]*pointer-events:auto/u);
  assert.match(css, /--font-caption:12px/u);
  assert.match(css, /@media\(max-width:900px\)[\s\S]*?--font-caption:13px/u);
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)/u);
  assert.match(css, /\.theme-button\{width:44px;min-height:44px/u);
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
