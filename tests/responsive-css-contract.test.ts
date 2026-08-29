import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { Window } from "happy-dom";

type CascadeValue = { important: boolean; order: number; specificity: number; value: string };
type ParsedRule = {
  declarations: Map<string, { important: boolean; value: string }>;
  media: string[];
  order: number;
  selector: string;
};

function mediaMatches(condition: string, width: number, reducedMotion = false) {
  const max = [...condition.matchAll(/max-width\s*:\s*(\d+)px/gu)].every((match) => width <= Number(match[1]));
  const min = [...condition.matchAll(/min-width\s*:\s*(\d+)px/gu)].every((match) => width >= Number(match[1]));
  const motion = !condition.includes("prefers-reduced-motion") || (condition.includes("reduce") && reducedMotion);
  return max && min && motion;
}

function specificity(selector: string) {
  const ids = selector.match(/#[\w-]+/gu)?.length ?? 0;
  const classes = selector.match(/\.[\w-]+|\[[^\]]+\]|:(?!:)[\w-]+/gu)?.length ?? 0;
  const elements = selector.match(/(^|[\s>+~,(])(?:[a-z][\w-]*)/giu)?.length ?? 0;
  return ids * 100 + classes * 10 + elements;
}

function parseStylesheet(source: string) {
  const parsed: ParsedRule[] = [];
  let order = 0;
  const visit = (input: string, media: string[]) => {
    let cursor = 0;
    while (cursor < input.length) {
      const open = input.indexOf("{", cursor);
      if (open < 0) return;
      const header = input.slice(cursor, open).trim();
      let depth = 1;
      let close = open + 1;
      while (close < input.length && depth > 0) {
        if (input[close] === "{") depth += 1;
        if (input[close] === "}") depth -= 1;
        close += 1;
      }
      const body = input.slice(open + 1, close - 1);
      cursor = close;
      if (!header) continue;
      if (header.startsWith("@media")) {
        visit(body, [...media, header.slice("@media".length).trim()]);
        continue;
      }
      if (header.startsWith("@supports") || header.startsWith("@layer")) {
        visit(body, media);
        continue;
      }
      if (header.startsWith("@")) continue;
      const declarations = new Map<string, { important: boolean; value: string }>();
      for (const entry of body.split(";")) {
        const colon = entry.indexOf(":");
        if (colon < 1) continue;
        const property = entry.slice(0, colon).trim();
        const raw = entry.slice(colon + 1).trim();
        const important = /!important\s*$/u.test(raw);
        declarations.set(property, { important, value: raw.replace(/\s*!important\s*$/u, "") });
      }
      order += 1;
      parsed.push({ declarations, media, order, selector: header });
    }
  };
  visit(source.replace(/\/\*[\s\S]*?\*\//gu, ""), []);
  return parsed;
}

function cascadedProperty({
  rules,
  element,
  property,
  width,
  reducedMotion = false,
}: {
  rules: ParsedRule[];
  element: { matches: (selector: string) => boolean };
  property: string;
  width: number;
  reducedMotion?: boolean;
}) {
  let winner: CascadeValue | undefined;
  for (const rule of rules) {
      if (!rule.media.every((condition) => mediaMatches(condition, width, reducedMotion))) continue;
      let matches = false;
      try { matches = element.matches(rule.selector); } catch { matches = false; }
      if (!matches) continue;
      const declaration = rule.declarations.get(property);
      if (!declaration) continue;
      const candidate = {
        important: declaration.important,
        order: rule.order,
        specificity: specificity(rule.selector),
        value: declaration.value,
      };
      if (!winner
        || Number(candidate.important) > Number(winner.important)
        || (candidate.important === winner.important && candidate.specificity > winner.specificity)
        || (candidate.important === winner.important && candidate.specificity === winner.specificity && candidate.order > winner.order)) {
        winner = candidate;
      }
  }
  return winner?.value ?? "";
}

async function stylesheetFixture() {
  const window = new Window();
  const rules = parseStylesheet((await Promise.all([
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/responsive.css", import.meta.url), "utf8"),
  ])).join("\n"));
  window.document.body.innerHTML = `
    <div class="pro7-shell light">
      <header class="app-header"><div class="header-actions"><div class="notification-center"><button class="icon-button notification">N</button></div><div class="account-menu"><button class="account-menu-trigger">A</button></div></div></header>
      <form class="login-form"><div class="password-field"><button class="password-visibility">P</button></div></form>
      <form class="squad-toolbar"><label class="search-box"><button class="search-submit">S</button><input /></label><div class="filter-row"><a href="#">GK</a></div></form>
      <nav class="mobile-nav mobile-nav--5"><a href="#">Tổng quan</a><a href="#">Đội hình</a><a href="#">Trận</a><a href="#">Sơ đồ</a><a href="#">Quỹ</a></nav>
      <main><form class="account-profile-fields"><label>Tên<input /></label></form></main>
    </div>`;
  return { window, rules, document: window.document };
}

test("phone keeps notification and fixed navigation operable with readable controls", async () => {
  const fixture = await stylesheetFixture();
  try {
    const { document, rules } = fixture;
    const value = (selector: string, property: string) => cascadedProperty({
      rules,
      element: document.querySelector(selector)!,
      property,
      width: 375,
    });
    assert.equal(value(".notification", "display"), "grid");
    assert.equal(value(".mobile-nav", "position"), "fixed");
    assert.equal(value(".mobile-nav", "grid-template-columns"), "repeat(5,minmax(0,1fr))");
    assert.equal(document.querySelectorAll(".mobile-nav a").length, 5);
    assert.ok((320 - 14) / 5 >= 44, "five Admin destinations must retain a 44px target at 320px");
    assert.equal(cascadedProperty({ rules, element: document.querySelector(".mobile-nav a")!, property: "min-height", width: 320 }), "56px");
    assert.equal(value(".mobile-nav a", "font-size"), "12px");
    assert.equal(value(".search-submit", "width"), "44px");
    assert.equal(value(".filter-row a", "height"), "44px");
    assert.equal(value(".account-menu-trigger", "width"), "44px");
    assert.equal(value(".account-menu-trigger", "height"), "44px");
    assert.equal(value(".password-visibility", "width"), "44px");
    assert.equal(value(".password-visibility", "height"), "44px");
    assert.equal(value(".account-profile-fields input", "font-size"), "16px");
  } finally {
    fixture.window.close();
  }
});

test("tablet uses the drawer shell without a bottom navigation", async () => {
  const fixture = await stylesheetFixture();
  try {
    const { document, rules } = fixture;
    const mobileNav = document.querySelector(".mobile-nav")!;
    assert.equal(cascadedProperty({ rules, element: mobileNav, property: "display", width: 768 }), "none");
    assert.equal(cascadedProperty({ rules, element: mobileNav, property: "display", width: 1023 }), "none");
  } finally {
    fixture.window.close();
  }
});
