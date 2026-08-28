import { chromium } from "playwright";

const SCREENSHOT_DIR = "C:/Users/X/.gemini/antigravity-ide/brain/2c72d1dd-0c40-4134-9a3b-6aa46ae35812/screenshots";
const BASE_URL = "http://localhost:3000";

async function main() {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const desktopContext = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      deviceScaleFactor: 1.5,
    });
    const desktopPage = await desktopContext.newPage();

    // Login
    await desktopPage.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });
    await desktopPage.fill('#login-identifier', "hunglt");
    await desktopPage.fill('#login-password', "Sup3rm4n001@!");
    await Promise.all([
      desktopPage.waitForNavigation({ waitUntil: "networkidle" }),
      desktopPage.click('button[type="submit"]'),
    ]);

    // Recapture matches desktop
    await desktopPage.goto(`${BASE_URL}/teams/nat-fc/matches`, { waitUntil: "networkidle" });
    await desktopPage.waitForTimeout(1000);
    await desktopPage.screenshot({ path: `${SCREENSHOT_DIR}/05_matches_desktop.png`, fullPage: true });

    // Recapture settings desktop
    await desktopPage.goto(`${BASE_URL}/teams/nat-fc/admin/settings`, { waitUntil: "networkidle" });
    await desktopPage.waitForTimeout(1000);
    await desktopPage.screenshot({ path: `${SCREENSHOT_DIR}/09_admin_settings_desktop.png`, fullPage: true });

    // Mobile
    const mobileContext = await browser.newContext({
      viewport: { width: 375, height: 812 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    });
    const cookies = await desktopContext.cookies();
    await mobileContext.addCookies(cookies);
    const mobilePage = await mobileContext.newPage();

    // Recapture matches mobile
    await mobilePage.goto(`${BASE_URL}/teams/nat-fc/matches`, { waitUntil: "networkidle" });
    await mobilePage.waitForTimeout(1000);
    await mobilePage.screenshot({ path: `${SCREENSHOT_DIR}/05_matches_mobile.png`, fullPage: true });

    // Recapture tactics board mobile
    await mobilePage.goto(`${BASE_URL}/teams/nat-fc/tactics/bf3bd3c9-d345-42b6-8b6d-04c3a73901b9`, { waitUntil: "networkidle" });
    await mobilePage.waitForTimeout(1000);
    await mobilePage.screenshot({ path: `${SCREENSHOT_DIR}/07_tactics_board_mobile.png`, fullPage: true });

    console.log("Recaptured updated pages successfully!");
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
