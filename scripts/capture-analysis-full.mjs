import { chromium } from "playwright";
import { resolve } from "node:path";

const MATCH_ID = "71498d3d-e4f4-422c-aba1-8c6c9792414f";
const SCREENSHOT_DIR = "C:/Users/X/.gemini/antigravity-ide/brain/2c72d1dd-0c40-4134-9a3b-6aa46ae35812/screenshots";

async function main() {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 1.5 });
  const page = await context.newPage();

  await page.goto("http://localhost:3000/login", { waitUntil: "networkidle" });
  await page.fill("#login-identifier", "hunglt");
  await page.fill("#login-password", "Sup3rm4n001@!");
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle" }),
    page.click('button[type="submit"]'),
  ]);

  await page.goto(`http://localhost:3000/teams/nat-fc/matches/${MATCH_ID}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);

  // Full page screenshot of match analysis
  await page.screenshot({ path: resolve(SCREENSHOT_DIR, "demo_04_match_analysis_full.png"), fullPage: true });
  console.log("📸 Đã chụp: demo_04_match_analysis_full.png");

  await browser.close();
}

main().catch(console.error);
