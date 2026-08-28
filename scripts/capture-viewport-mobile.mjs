import { chromium } from "playwright";

const SCREENSHOT_DIR = "C:/Users/X/.gemini/antigravity-ide/brain/2c72d1dd-0c40-4134-9a3b-6aa46ae35812/screenshots";
const BASE_URL = "http://localhost:3000";

async function main() {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const context = await browser.newContext({
      viewport: { width: 375, height: 812 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
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

    // Viewport screenshot of overview (what user actually sees on screen without scrolling)
    await page.goto(`${BASE_URL}/teams/nat-fc/overview`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/mobile_viewport_overview.png` });

    // Scroll down 400px and screenshot
    await page.evaluate(() => window.scrollBy(0, 400));
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/mobile_viewport_scrolled.png` });

    console.log("Captured real mobile viewport screenshots!");
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
