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

test("tablet shell keeps meaningful type readable at the authoritative breakpoint", async () => {
  const css = await readFile(cssPath, "utf8");
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

test("login autofill stays inside the neutral Auth palette", async () => {
  const css = await readFile(cssPath, "utf8");
  assert.match(css, /\.login-form input:-webkit-autofill/u);
  assert.match(css, /-webkit-text-fill-color:\s*var\(--auth-text\)/u);
  assert.match(css, /(?:-webkit-)?box-shadow:\s*0 0 0 1000px var\(--auth-field\) inset/u);
  assert.match(css, /caret-color:\s*var\(--auth-text\)/u);
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
