import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { statSync } from "node:fs";

const SCREENSHOT_DIR = "C:/Users/X/.gemini/antigravity-ide/brain/2c72d1dd-0c40-4134-9a3b-6aa46ae35812/screenshots";
const BASE_URL = "http://localhost:3000";

async function main() {
  await mkdir(SCREENSHOT_DIR, { recursive: true });
  console.log("=== Starting Full Playwright Crawl & Screenshot Suite ===");
  const browser = await chromium.launch({ channel: "chrome", headless: true });

  try {
    // -------------------------------------------------------------
    // PHASE 1: Desktop Crawl (1280x800)
    // -------------------------------------------------------------
    console.log("\n[1/3] Creating Desktop session (1280x800)...");
    const desktopContext = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      deviceScaleFactor: 1.5,
    });
    const desktopPage = await desktopContext.newPage();

    // 1. Login page (unauthenticated)
    console.log("Capturing unauthenticated Login page...");
    await desktopPage.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });
    await desktopPage.screenshot({ path: `${SCREENSHOT_DIR}/01_login_desktop.png`, fullPage: true });

    // 2. Perform Login
    console.log("Submitting login form with hunglt / Sup3rm4n001@!...");
    await desktopPage.fill('#login-identifier', "hunglt");
    await desktopPage.fill('#login-password', "Sup3rm4n001@!");
    await Promise.all([
      desktopPage.waitForNavigation({ waitUntil: "networkidle", timeout: 15000 }),
      desktopPage.click('button[type="submit"]'),
    ]);
    await desktopPage.waitForTimeout(2000);
    console.log("Logged in! Landed at:", desktopPage.url());

    // Main route list
    const routes = [
      { name: "02_overview", path: "/teams/nat-fc/overview" },
      { name: "03_squad", path: "/teams/nat-fc/squad" },
      { name: "05_matches", path: "/teams/nat-fc/matches" },
      { name: "07_tactics", path: "/teams/nat-fc/tactics" },
      { name: "08_funds", path: "/teams/nat-fc/funds" },
      { name: "09_admin_settings", path: "/teams/nat-fc/admin/settings" },
      { name: "10_account_profile", path: "/account/profile" },
      { name: "11_account_change_password", path: "/account/change-password" },
    ];

    let playerDetailUrl = null;
    let matchDetailUrl = null;

    for (const item of routes) {
      console.log(`Navigating desktop to ${item.name} (${item.path})...`);
      await desktopPage.goto(`${BASE_URL}${item.path}`, { waitUntil: "networkidle" });
      await desktopPage.waitForTimeout(1500);
      await desktopPage.screenshot({ path: `${SCREENSHOT_DIR}/${item.name}_desktop.png`, fullPage: true });

      // Check if squad has player cards linking to detail
      if (item.name === "03_squad" && !playerDetailUrl) {
        const playerLinks = await desktopPage.$$eval('a[href*="/teams/nat-fc/squad/"]', (els) =>
          els.map((e) => e.getAttribute("href"))
        );
        if (playerLinks.length > 0) {
          playerDetailUrl = playerLinks[0];
          console.log("Found player detail URL:", playerDetailUrl);
        }
      }

      // Check if matches has match links
      if (item.name === "05_matches" && !matchDetailUrl) {
        const matchLinks = await desktopPage.$$eval('a[href*="/teams/nat-fc/matches/"]', (els) =>
          els.map((e) => e.getAttribute("href"))
        );
        if (matchLinks.length > 0) {
          matchDetailUrl = matchLinks[0];
          console.log("Found match detail URL:", matchDetailUrl);
        }
      }
    }

    // Capture player detail if found
    if (playerDetailUrl) {
      console.log(`Navigating desktop to player detail: ${playerDetailUrl}...`);
      await desktopPage.goto(`${BASE_URL}${playerDetailUrl}`, { waitUntil: "networkidle" });
      await desktopPage.waitForTimeout(1500);
      await desktopPage.screenshot({ path: `${SCREENSHOT_DIR}/04_squad_player_detail_desktop.png`, fullPage: true });
    }

    // Capture match detail if found
    if (matchDetailUrl) {
      console.log(`Navigating desktop to match detail: ${matchDetailUrl}...`);
      await desktopPage.goto(`${BASE_URL}${matchDetailUrl}`, { waitUntil: "networkidle" });
      await desktopPage.waitForTimeout(1500);
      await desktopPage.screenshot({ path: `${SCREENSHOT_DIR}/06_match_detail_desktop.png`, fullPage: true });
    }

    // Capture Dark Mode
    console.log("Switching to Dark Mode...");
    await desktopPage.goto(`${BASE_URL}/teams/nat-fc/overview`, { waitUntil: "networkidle" });
    const themeButton = desktopPage.locator('button.theme-button, button[aria-label*="tối"], button[aria-label*="Dark"]');
    if (await themeButton.count() > 0) {
      await themeButton.first().click();
      await desktopPage.waitForTimeout(1000);
      await desktopPage.screenshot({ path: `${SCREENSHOT_DIR}/12_overview_dark_desktop.png`, fullPage: true });
      console.log("Captured: 12_overview_dark_desktop.png");

      // Also capture tactics in dark mode
      await desktopPage.goto(`${BASE_URL}/teams/nat-fc/tactics`, { waitUntil: "networkidle" });
      await desktopPage.waitForTimeout(1000);
      await desktopPage.screenshot({ path: `${SCREENSHOT_DIR}/13_tactics_dark_desktop.png`, fullPage: true });
      console.log("Captured: 13_tactics_dark_desktop.png");
    }

    // -------------------------------------------------------------
    // PHASE 2: Mobile Crawl (375x812 - iPhone 14/15 format)
    // -------------------------------------------------------------
    console.log("\n[2/3] Creating Mobile session (375x812)...");
    const mobileContext = await browser.newContext({
      viewport: { width: 375, height: 812 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    });

    // Share cookies from desktop
    const authCookies = await desktopContext.cookies();
    await mobileContext.addCookies(authCookies);
    const mobilePage = await mobileContext.newPage();

    // 1. Mobile login (unauthenticated context)
    const mobileUnauthContext = await browser.newContext({
      viewport: { width: 375, height: 812 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    });
    const mobileUnauthPage = await mobileUnauthContext.newPage();
    await mobileUnauthPage.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });
    await mobileUnauthPage.screenshot({ path: `${SCREENSHOT_DIR}/01_login_mobile.png`, fullPage: true });
    await mobileUnauthContext.close();

    // 2. Mobile authenticated pages
    for (const item of routes) {
      console.log(`Navigating mobile to ${item.name} (${item.path})...`);
      await mobilePage.goto(`${BASE_URL}${item.path}`, { waitUntil: "networkidle" });
      await mobilePage.waitForTimeout(1500);
      await mobilePage.screenshot({ path: `${SCREENSHOT_DIR}/${item.name}_mobile.png`, fullPage: true });
    }

    if (playerDetailUrl) {
      console.log(`Navigating mobile to player detail: ${playerDetailUrl}...`);
      await mobilePage.goto(`${BASE_URL}${playerDetailUrl}`, { waitUntil: "networkidle" });
      await mobilePage.waitForTimeout(1500);
      await mobilePage.screenshot({ path: `${SCREENSHOT_DIR}/04_squad_player_detail_mobile.png`, fullPage: true });
    }

    if (matchDetailUrl) {
      console.log(`Navigating mobile to match detail: ${matchDetailUrl}...`);
      await mobilePage.goto(`${BASE_URL}${matchDetailUrl}`, { waitUntil: "networkidle" });
      await mobilePage.waitForTimeout(1500);
      await mobilePage.screenshot({ path: `${SCREENSHOT_DIR}/06_match_detail_mobile.png`, fullPage: true });
    }

    // Mobile Dark Mode
    await mobilePage.goto(`${BASE_URL}/teams/nat-fc/overview`, { waitUntil: "networkidle" });
    const mobileThemeButton = mobilePage.locator('button.theme-button, button[aria-label*="tối"], button[aria-label*="Dark"]');
    if (await mobileThemeButton.count() > 0) {
      await mobileThemeButton.first().click();
      await mobilePage.waitForTimeout(1000);
      await mobilePage.screenshot({ path: `${SCREENSHOT_DIR}/12_overview_dark_mobile.png`, fullPage: true });
      console.log("Captured: 12_overview_dark_mobile.png");
    }

    console.log("\n[3/3] Screenshot capture completed successfully!");
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error("Fatal Error in capture script:", err);
  process.exit(1);
});
