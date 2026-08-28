import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { loadPro7CssFixture } from "./css-contract-helpers";

const cssPath = new URL("../app/globals.css", import.meta.url);
const responsivePath = new URL("../app/responsive.css", import.meta.url);
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

test("PRO7 uses one coherent 1.25/1.5 vertical type rhythm", async () => {
  const fixture = await loadPro7CssFixture({
    width: 390,
    body: '<main><h1>Tiêu đề</h1><p>Nội dung mô tả</p><label>Nhãn</label><button>Thao tác</button></main>',
  });
  try {
    const styles = (selector: string) => fixture.window.getComputedStyle(fixture.document.querySelector(selector)!);
    assert.equal(styles("body").lineHeight, "1.5");
    assert.equal(styles("h1").lineHeight, "1.25");
    assert.equal(styles("p").lineHeight, "1.5");
    assert.equal(styles("label").lineHeight, "1.25");
    assert.equal(styles("button").lineHeight, "1.25");
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

test("Overview and Squad use tokenized card rhythm", async () => {
  const desktop = await loadPro7CssFixture({
    width: 1440,
    body: '<main class="view-stack"><article class="card"></article><form class="squad-toolbar"></form></main>',
  });
  const phone = await loadPro7CssFixture({
    width: 390,
    body: '<section class="squad-toolbar"><div class="filter-row"><a>Tất cả</a><a>GK</a><a>DEF</a><a>MID</a><a>ATT</a></div></section>',
  });
  try {
    assert.equal(desktop.window.getComputedStyle(desktop.document.querySelector(".card")!).borderRadius, "12px");
    assert.equal(desktop.window.getComputedStyle(desktop.document.querySelector(".view-stack")!).gap, "24px");
    assert.equal(desktop.window.getComputedStyle(desktop.document.querySelector(".squad-toolbar")!).padding, "16px");
    const filterRow = phone.window.getComputedStyle(phone.document.querySelector(".filter-row")!);
    const links = [...phone.document.querySelectorAll(".filter-row > a")];
    assert.equal(filterRow.overflowX, "auto");
    assert.equal(filterRow.scrollSnapType, "inline proximity");
    assert.equal(links.length, 5);
    assert.ok(links.every((link) => phone.window.getComputedStyle(link).flexGrow === "0"));
  } finally {
    desktop.close();
    phone.close();
  }
});

test("Squad position badges stay inside the neutral and PRO7 red palette", async () => {
  const css = await readFile(cssPath, "utf8");
  assert.doesNotMatch(css, /#(?:0d9488|e6fffa|b45309|fef3c7|2dd4bf|fbbf24)\b/iu);
  assert.doesNotMatch(css, /rgba\((?:13,\s*148,\s*136|180,\s*83,\s*9),/iu);
});

test("match result badges use semantic win, draw, and loss colors", async () => {
  const fixture = await loadPro7CssFixture({
    width: 390,
    body: '<main class="pro7-shell light"><div class="form-badges"><b class="win">W</b><b class="draw">D</b><b class="loss">L</b></div><div class="form-strip"><span class="form-badge win">W</span></div><div class="analysis-score"><small class="analysis-outcome win">THẮNG</small><div class="score-board win"><strong>3 – 1</strong></div></div><span class="match-history-score-pill win">3–1</span><span class="match-result-pill win">THẮNG</span></main><main class="pro7-shell dark"><div class="analysis-score"><small class="analysis-outcome win">THẮNG</small><div class="score-board win"><strong>3 – 1</strong></div></div><span class="match-history-score-pill win">3–1</span><span class="match-result-pill win">THẮNG</span></main>',
  });
  try {
    const styles = (selector: string) => fixture.window.getComputedStyle(fixture.document.querySelector(selector)!);
    assert.equal(styles(".form-badges .win").backgroundColor, "#15803d");
    assert.equal(styles(".form-badge.win").backgroundColor, "#15803d");
    assert.equal(styles(".form-badges .win").color, "#ffffff");
    assert.equal(styles(".pro7-shell.light .match-history-score-pill.win").backgroundColor, "#dcfce7");
    assert.equal(styles(".pro7-shell.light .match-history-score-pill.win").color, "#166534");
    assert.equal(styles(".pro7-shell.light .match-result-pill.win").color, "#166534");
    assert.equal(styles(".pro7-shell.dark .match-history-score-pill.win").color, "#86efac");
    assert.equal(styles(".pro7-shell.dark .match-result-pill.win").color, "#86efac");
    assert.equal(styles(".pro7-shell.light .score-board.win strong").color, "#86efac");
    assert.equal(styles(".pro7-shell.light .analysis-outcome.win").color, "#86efac");
    assert.equal(styles(".pro7-shell.dark .score-board.win strong").color, "#86efac");
    assert.notEqual(styles(".form-badges .draw").backgroundColor, styles(".form-badges .win").backgroundColor);
    assert.notEqual(styles(".form-badges .loss").backgroundColor, styles(".form-badges .win").backgroundColor);
  } finally {
    fixture.close();
  }
});

test("Matches and Tactics use the neutral PRO7 surface and touch rhythm", async () => {
  const [css, responsive] = await Promise.all([readFile(cssPath, "utf8"), readFile(responsivePath, "utf8")]);
  const desktop = await loadPro7CssFixture({
    width: 1440,
    body: '<main class="pro7-shell"><section class="match-top-grid two-col"><article class="confirmed-card"></article><article class="card"></article></section><section class="tactics-layout"><article class="pitch-card"><div class="pitch mowed-pitch"></div></article></section><section class="tactics-toolbar card"><select></select><div class="mode-toggle"><button>Có bóng</button></div></section><a class="history-action-btn primary">Xem</a></main>',
  });
  try {
    assert.doesNotMatch(css, /#(?:1b6838|175b31|0b1320|151d2f)\b/iu);
    assert.equal(desktop.window.getComputedStyle(desktop.document.querySelector(".match-top-grid")!).gap, "24px");
    assert.equal(desktop.window.getComputedStyle(desktop.document.querySelector(".confirmed-card")!).borderRadius, "12px");
    assert.equal(desktop.window.getComputedStyle(desktop.document.querySelector(".tactics-layout")!).gap, "24px");
    assert.equal(desktop.window.getComputedStyle(desktop.document.querySelector(".tactics-toolbar")!).padding, "16px");
    assert.equal(desktop.window.getComputedStyle(desktop.document.querySelector(".mode-toggle button")!).minHeight, "44px");
    assert.equal(desktop.window.getComputedStyle(desktop.document.querySelector(".history-action-btn")!).minHeight, "44px");
    assert.match(responsive, /\.match-history-card\{display:grid;grid-template-columns:1fr/u);
    assert.match(responsive, /\.match-history-actions\{display:grid;grid-template-columns:1fr 1fr;width:100%/u);
    assert.match(responsive, /\.tactics-toolbar>label,\.tactics-toolbar>\.mode-toggle,\.tactics-toolbar>div:last-child\{width:100%/u);
  } finally {
    desktop.close();
  }
});

test("Funds, Settings, and feedback surfaces use shared density tokens", async () => {
  const fixture = await loadPro7CssFixture({
    width: 1440,
    body: '<main class="pro7-shell"><article class="balance-card"></article><section class="settings-module"></section><aside class="notification-popover"></aside><section class="modal"></section><output class="toast"></output></main>',
  });
  try {
    const styles = (selector: string) => fixture.window.getComputedStyle(fixture.document.querySelector(selector)!);
    assert.equal(styles(".balance-card").borderRadius, "12px");
    assert.equal(styles(".settings-module").padding, "24px");
    assert.equal(styles(".notification-popover").boxShadow, "0 24px 64px rgba(23, 23, 25, 0.2)");
    assert.equal(styles(".notification-popover").borderRadius, "16px");
    assert.equal(styles(".modal").borderRadius, "16px");
    assert.equal(styles(".toast").borderRadius, "8px");
  } finally {
    fixture.close();
  }
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
