const forbiddenAccent = /#(?:00e676|00b4d8|0068ff|38bdf8|2b54c8|f59e0b|057a3b|e8faf0|e0f7fa|f0f4ff)\b|rgba?\(\s*0\s*,\s*(?:230\s*,\s*118|180\s*,\s*216)\b/iu;

export function auditCss(source) {
  const css = source.replace(/\/\*[\s\S]*?\*\//gu, "");
  const violations = [];
  for (const block of css.matchAll(/\{([^{}]*)\}/gu)) {
    for (const declaration of block[1].split(";")) {
      const separator = declaration.indexOf(":");
      if (separator < 1) continue;
      const property = declaration.slice(0, separator).trim().toLowerCase();
      const value = declaration
        .slice(separator + 1)
        .replace(/\s*!important\s*$/u, "")
        .trim()
        .toLowerCase();
      if (forbiddenAccent.test(value)) violations.push({ property, value });
    }
  }
  return violations;
}

const shellSelector = /\.(?:sidebar|mobile-nav|app-header|app-main|page-content|nav-scrim|close-menu|menu-button|page-heading|header-cta|account-menu-identity)(?![\w-])/u;
const approvedShellRanges = new Set(["max-width:1023px", "max-width:767px", "prefers-reduced-motion:reduce"]);

function findClosingBrace(source, open) {
  let depth = 1;
  for (let index = open + 1; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return index;
  }
  return -1;
}

function stripShellRulesFromBody(body) {
  let cursor = 0;
  let output = "";
  while (cursor < body.length) {
    const open = body.indexOf("{", cursor);
    if (open < 0) return output + body.slice(cursor);
    const close = findClosingBrace(body, open);
    if (close < 0) return output + body.slice(cursor);
    const rawSelector = body.slice(cursor, open);
    const leading = rawSelector.match(/^\s*/u)?.[0] ?? "";
    const selectors = rawSelector.trim().split(",");
    const kept = selectors.filter((selector) => !isShellLayoutSelector(selector));
    if (kept.length === selectors.length) {
      output += body.slice(cursor, close + 1);
    } else if (kept.length > 0) {
      output += `${leading}${kept.map((selector) => selector.trim()).join(",")}${body.slice(open, close + 1)}`;
    }
    cursor = close + 1;
  }
  return output;
}

function isShellLayoutSelector(selector) {
  const normalized = selector.trim();
  return shellSelector.test(normalized) || /^\.header-actions(?::[\w-]+)?$/u.test(normalized);
}

function containsShellLayoutRule(body) {
  let cursor = 0;
  while (cursor < body.length) {
    const open = body.indexOf("{", cursor);
    if (open < 0) return false;
    const close = findClosingBrace(body, open);
    if (close < 0) return false;
    const selectors = body.slice(cursor, open).trim().split(",");
    if (selectors.some(isShellLayoutSelector)) return true;
    cursor = close + 1;
  }
  return false;
}

export function stripLegacyShellRules(source) {
  const media = /@media\s*\(([^)]*)\)\s*\{/gu;
  let cursor = 0;
  let output = "";
  for (const match of source.matchAll(media)) {
    const open = match.index + match[0].length - 1;
    const close = findClosingBrace(source, open);
    if (close < 0) break;
    const condition = match[1].replace(/\s+/gu, "").toLowerCase();
    output += source.slice(cursor, open + 1);
    output += !approvedShellRanges.has(condition)
      ? stripShellRulesFromBody(source.slice(open + 1, close))
      : source.slice(open + 1, close);
    cursor = close;
  }
  return output + source.slice(cursor);
}

export function auditResponsiveShell(source) {
  const css = source.replace(/\/\*[\s\S]*?\*\//gu, "");
  const violations = [];
  const media = /@media\s*\(([^)]*)\)\s*\{/gu;
  for (const match of css.matchAll(media)) {
    const open = match.index + match[0].length - 1;
    const close = findClosingBrace(css, open);
    if (close < 0) continue;
    const body = css.slice(open + 1, close);
    const condition = match[1].replace(/\s+/gu, "").toLowerCase();
    if (containsShellLayoutRule(body) && !approvedShellRanges.has(condition) && !violations.includes(condition)) {
      violations.push(condition);
    }
  }
  return violations;
}
