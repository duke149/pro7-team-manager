import { chromium } from "playwright";

const SCREENSHOT_DIR = "C:/Users/X/.gemini/antigravity-ide/brain/2c72d1dd-0c40-4134-9a3b-6aa46ae35812/screenshots";
const BASE_URL = "http://localhost:3000";

async function main() {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      deviceScaleFactor: 1.5,
    });
    const page = await context.newPage();

    // Login
    await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });
    await page.fill('#login-identifier', "hunglt");
    await page.fill('#login-password', "Sup3rm4n001@!");
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle" }),
      page.click('button[type="submit"]'),
    ]);

    // Go to tactics match board
    console.log("Navigating to tactics match board...");
    await page.goto(`${BASE_URL}/teams/nat-fc/tactics/bf3bd3c9-d345-42b6-8b6d-04c3a73901b9`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/07_tactics_board_desktop.png`, fullPage: true });

    // Mobile
    const mobileContext = await browser.newContext({
      viewport: { width: 375, height: 812 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    });
    const cookies = await context.cookies();
    await mobileContext.addCookies(cookies);
    const mobilePage = await mobileContext.newPage();
    await mobilePage.goto(`${BASE_URL}/teams/nat-fc/tactics/bf3bd3c9-d345-42b6-8b6d-04c3a73901b9`, { waitUntil: "networkidle" });
    await mobilePage.waitForTimeout(2000);
    await mobilePage.screenshot({ path: `${SCREENSHOT_DIR}/07_tactics_board_mobile.png`, fullPage: true });

    console.log("Captured tactics board screenshots!");
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
