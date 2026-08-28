import { readFile } from "node:fs/promises";
import { Window } from "happy-dom";

const stylesheetPaths = [
  new URL("../app/design-tokens.css", import.meta.url),
  new URL("../app/globals.css", import.meta.url),
  new URL("../app/responsive.css", import.meta.url),
  new URL("../app/typography.css", import.meta.url),
];

export async function loadPro7CssFixture({ body, width }: { body: string; width: number }) {
  const window = new Window();
  window.happyDOM.setViewport({ width, height: 900 });
  const css = (await Promise.all(stylesheetPaths.map(async (path) => {
    try {
      return await readFile(path, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return "";
      throw error;
    }
  }))).join("\n");
  const style = window.document.createElement("style");
  style.textContent = css;
  window.document.head.append(style);
  window.document.body.innerHTML = body;
  return {
    close: () => window.close(),
    document: window.document,
    window,
  };
}
