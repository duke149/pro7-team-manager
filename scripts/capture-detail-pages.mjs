import { chromium } from "playwright";
import { resolve } from "node:path";

const ARTIFACTS_DIR = "C:/Users/X/.gemini/antigravity-ide/brain/2c72d1dd-0c40-4134-9a3b-6aa46ae35812/screenshots";

async function main() {
  const browser = await chromium.launch({ channel: "chrome", headless: true });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1.5,
  });
  const page = await context.newPage();

  // Login
  await page.goto("http://localhost:3000/login", { waitUntil: "networkidle" });
  await page.fill('#login-identifier', "hunglt");
  await page.fill('#login-password', "Sup3rm4n001@!");
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle" }),
    page.click('button[type="submit"]'),
  ]);

  // Go to matches and click first match
  await page.goto("http://localhost:3000/teams/nat-fc/matches", { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  
  // Click first match detail
  const detailLink = await page.$('.match-detail-link');
  if (detailLink) {
    await detailLink.click();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);
    await page.screenshot({ path: resolve(ARTIFACTS_DIR, "rewind_match_detail_desktop.png") });
    console.log("Captured rewind_match_detail_desktop.png");
  }

  // Go to tactics and click first match tactics
  await page.goto("http://localhost:3000/teams/nat-fc/tactics", { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  const tacticsLink = await page.$('a[href*="/tactics/"]');
  if (tacticsLink) {
    await tacticsLink.click();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);
    await page.screenshot({ path: resolve(ARTIFACTS_DIR, "rewind_tactics_board_desktop.png") });
    console.log("Captured rewind_tactics_board_desktop.png");
  }

  // Switch to Dark Mode to capture dark theme
  const themeToggle = await page.$('.theme-button');
  if (themeToggle) {
    await themeToggle.click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: resolve(ARTIFACTS_DIR, "rewind_tactics_board_dark_desktop.png") });
    console.log("Captured rewind_tactics_board_dark_desktop.png");
  }

  await browser.close();
  console.log("Done capturing detail pages!");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
