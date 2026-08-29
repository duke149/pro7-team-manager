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

test("global box sizing includes decorative pseudo-elements", async () => {
  const css = await readFile(cssPath, "utf8");
  assert.match(css, /\*,\*::before,\*::after\{box-sizing:border-box\}/u);
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

test("phone login keeps its identity, form, and footnote in one safe scroll flow", async () => {
  const responsive = await readFile(responsivePath, "utf8");
  const fixture = await loadPro7CssFixture({
    width: 390,
    body: '<main class="login-shell"><section class="login-card"><div class="login-brand"></div><div class="login-copy"></div><form class="login-form"></form></section><p class="login-footnote">PRO7 Team Manager</p></main>',
  });
  try {
    const styles = (selector: string) => fixture.window.getComputedStyle(fixture.document.querySelector(selector)!);
    assert.equal(styles(".login-shell").paddingLeft, "14px");
    assert.equal(styles(".login-shell").paddingRight, "14px");
    assert.match(responsive, /\.login-shell\{[^}]*overflow-y:auto/u);
    assert.equal(styles(".login-card").paddingTop, "24px");
    assert.equal(styles(".login-card").paddingRight, "20px");
    assert.equal(styles(".login-copy").marginTop, "24px");
    assert.equal(styles(".login-copy").marginBottom, "16px");
    assert.equal(styles(".login-footnote").position, "static");
  } finally {
    fixture.close();
  }
});

test("phone modals keep long forms inside the safe visual viewport", async () => {
  const responsive = await readFile(responsivePath, "utf8");
  assert.match(responsive, /\.modal-layer\{min-height:100svh;[^}]*safe-area-inset-top[^}]*safe-area-inset-bottom/u);
  assert.match(responsive, /\.modal:not\(\.provision-member-modal,\.provision-result-modal\)\{max-height:calc\(100svh - 112px - env\(safe-area-inset-bottom\)\);overflow-y:auto;/u);
  assert.match(responsive, /\.modal-head>button\{width:44px;height:44px;flex:0 0 44px\}/u);
});

test("the Web Push permission gate keeps its dismissal control touch-safe", async () => {
  const css = await readFile(cssPath, "utf8");
  assert.match(css, /\.push-permission-gate h2\s*\{\s*margin:\s*0 44px 4px 0;/u);
  assert.match(css, /\.push-permission-close\s*\{[^}]*width:\s*44px;[^}]*height:\s*44px;/u);
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

test("phone overview collapses an empty next-match hero without changing the scheduled-match layout", async () => {
  const fixture = await loadPro7CssFixture({
    width: 390,
    body: '<main class="pro7-shell"><article class="match-hero dark-card overview-empty-card"><div class="overview-empty-copy">Chưa có trận</div></article><article class="match-hero dark-card">Trận sắp tới</article></main>',
  });
  try {
    const styles = (selector: string) => fixture.window.getComputedStyle(fixture.document.querySelector(selector)!);
    assert.equal(styles(".overview-empty-card").minHeight, "220px");
    assert.equal(styles(".overview-empty-card").padding, "16px");
    assert.equal(styles(".match-hero:not(.overview-empty-card)").minHeight, "330px");
  } finally {
    fixture.close();
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
    body: '<main class="pro7-shell light"><div class="form-badges"><b class="win">W</b><b class="draw">D</b><b class="loss">L</b></div><div class="form-strip"><span class="form-badge win">W</span></div><div class="availability-breakdown"><i class="dot green"></i><i class="dot red"></i></div><div class="analysis-score"><small class="analysis-outcome win">THẮNG</small><div class="score-board win"><strong>3 – 1</strong></div></div><span class="match-history-score-pill win">3–1</span><span class="match-result-pill win">THẮNG</span></main><main class="pro7-shell dark"><div class="analysis-score"><small class="analysis-outcome win">THẮNG</small><div class="score-board win"><strong>3 – 1</strong></div></div><span class="match-history-score-pill win">3–1</span><span class="match-result-pill win">THẮNG</span></main>',
  });
  try {
    const styles = (selector: string) => fixture.window.getComputedStyle(fixture.document.querySelector(selector)!);
    assert.equal(styles(".form-badges .win").backgroundColor, "#15803d");
    assert.equal(styles(".form-badge.win").backgroundColor, "#15803d");
    assert.equal(styles(".dot.green").backgroundColor, "#15803d");
    assert.equal(styles(".dot.red").backgroundColor, "#a60f28");
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

test("match availability communicates confirmed participation with the success palette", async () => {
  const fixture = await loadPro7CssFixture({
    width: 390,
    body: '<main class="pro7-shell light"><div class="rsvp-options"><button class="active yes">Có</button></div><span class="starting-pill">Đủ 7 người</span><div class="roster-progress"><i><b></b></i></div><div class="match-attendance-row"><span class="available">Có mặt</span></div></main><main class="pro7-shell dark"><div class="rsvp-options"><button class="active yes">Có</button></div><span class="starting-pill">Đủ 7 người</span></main>',
  });
  try {
    const styles = (selector: string) => fixture.window.getComputedStyle(fixture.document.querySelector(selector)!);
    assert.equal(styles(".pro7-shell.light .rsvp-options button.active.yes").backgroundColor, "#dcfce7");
    assert.equal(styles(".pro7-shell.light .rsvp-options button.active.yes").color, "#166534");
    assert.equal(styles(".pro7-shell.light .starting-pill").backgroundColor, "#dcfce7");
    assert.equal(styles(".pro7-shell.light .starting-pill").color, "#166534");
    assert.equal(styles(".roster-progress i b").backgroundColor, "#15803d");
    assert.equal(styles(".match-attendance-row .available").backgroundColor, "#dcfce7");
    assert.equal(styles(".match-attendance-row .available").color, "#166534");
    assert.equal(styles(".pro7-shell.dark .rsvp-options button.active.yes").color, "#86efac");
    assert.equal(styles(".pro7-shell.dark .starting-pill").color, "#86efac");
  } finally {
    fixture.close();
  }
});

test("successful tactics and funds states stay distinct from brand and destructive red", async () => {
  const fixture = await loadPro7CssFixture({
    width: 390,
    body: '<main class="pro7-shell light"><i class="paid">Đã đóng</i><div class="transaction"><strong class="income">+500.000đ</strong></div><p class="tactics-message success">Đã lưu bản nháp</p></main><main class="pro7-shell dark"><i class="paid">Đã đóng</i><p class="tactics-message success">Đã lưu bản nháp</p></main>',
  });
  try {
    const styles = (selector: string) => fixture.window.getComputedStyle(fixture.document.querySelector(selector)!);
    assert.equal(styles(".pro7-shell.light .paid").backgroundColor, "#dcfce7");
    assert.equal(styles(".pro7-shell.light .paid").color, "#166534");
    assert.equal(styles(".transaction .income").color, "#15803d");
    assert.equal(styles(".pro7-shell.light .tactics-message.success").backgroundColor, "#dcfce7");
    assert.equal(styles(".pro7-shell.light .tactics-message.success").color, "#166534");
    assert.equal(styles(".pro7-shell.dark .paid").color, "#86efac");
    assert.equal(styles(".pro7-shell.dark .tactics-message.success").color, "#86efac");
  } finally {
    fixture.close();
  }
});

test("success feedback uses the same semantic treatment across management modules", async () => {
  const fixture = await loadPro7CssFixture({
    width: 390,
    body: '<main class="pro7-shell light"><p class="settings-message success">Đã lưu cài đặt</p><p class="overview-control-message success">Đã gửi lời nhắc</p><p class="news-manager-message success">Đã cập nhật tin</p><p class="match-message success">Đã cập nhật trận đấu</p></main><main class="pro7-shell dark"><p class="settings-message success">Đã lưu cài đặt</p><p class="overview-control-message success">Đã gửi lời nhắc</p></main>',
  });
  try {
    const styles = (selector: string) => fixture.window.getComputedStyle(fixture.document.querySelector(selector)!);
    for (const selector of [".settings-message.success", ".overview-control-message.success", ".news-manager-message.success", ".match-message.success"]) {
      assert.equal(styles(`.pro7-shell.light ${selector}`).backgroundColor, "#dcfce7");
      assert.equal(styles(`.pro7-shell.light ${selector}`).color, "#166534");
    }
    assert.equal(styles(".pro7-shell.dark .settings-message.success").color, "#86efac");
    assert.equal(styles(".pro7-shell.dark .overview-control-message.success").color, "#86efac");
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
