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
    await page.fill('#login-identifier', process.env.PRO7_TEST_USER || "admin");
    await page.fill('#login-password', process.env.PRO7_TEST_PASSWORD || "");
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle" }),
      page.click('button[type="submit"]'),
    ]);

    // Go to matches page
    await page.goto(`${BASE_URL}/teams/nat-fc/matches`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/new_desktop_matches_header.png` });

    // Click account trigger to show popover
    await page.click('.account-menu-trigger');
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/new_desktop_account_popover.png` });

    // Go to admin settings via sidebar
    await page.click('a[href="/teams/nat-fc/admin/settings"]');
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/new_desktop_settings_via_sidebar.png` });

    console.log("Captured new clean desktop header and sidebar screenshots!");
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
