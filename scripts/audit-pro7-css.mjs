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
