import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const SCREENSHOT_DIR = "C:/Users/X/.gemini/antigravity-ide/brain/2c72d1dd-0c40-4134-9a3b-6aa46ae35812/screenshots";
const BASE_URL = "http://localhost:3000";

async function main() {
  await mkdir(SCREENSHOT_DIR, { recursive: true });
  console.log("Launching Chrome...");
  const browser = await chromium.launch({ channel: "chrome", headless: true });

  try {
    // 1. Desktop context
    console.log("Creating Desktop context...");
    const desktopContext = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    });
    const page = await desktopContext.newPage();

    console.log("Navigating to login page...");
    await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });
    await page.screenshot({ path: `${SCREENSHOT_DIR}/01_login_desktop.png`, fullPage: true });
    console.log("Saved: 01_login_desktop.png");

    console.log("Filling login form with hunglt...");
    await page.fill('input[name="identifier"]', "hunglt");
    await page.fill('input[name="password"]', "Sup3rm4n001@!");
    await page.screenshot({ path: `${SCREENSHOT_DIR}/02_login_filled_desktop.png` });

    console.log("Submitting login form...");
    await Promise.all([
      page.waitForNavigation({ timeout: 15000 }).catch((e) => console.log("Navigation wait finished or timed out:", e.message)),
      page.click('button[type="submit"]'),
    ]);

    await page.waitForTimeout(3000);
    const currentUrl = page.url();
    console.log("URL after login attempt:", currentUrl);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/03_after_login_desktop.png`, fullPage: true });

    // Check if error message displayed on login page
    const errorText = await page.locator(".login-error").innerText().catch(() => "");
    if (errorText) {
      console.log("Login error displayed:", errorText);
    }

    // List of target routes to scan
    let targetRoutes = [];
    if (currentUrl.includes("/teams/")) {
      const match = currentUrl.match(/\/teams\/([^\/]+)/);
      const slug = match ? match[1] : "";
      console.log("Detected team slug:", slug);
      targetRoutes = [
        `/teams/${slug}/overview`,
        `/teams/${slug}/squad`,
        `/teams/${slug}/matches`,
        `/teams/${slug}/tactics`,
        `/teams/${slug}/funds`,
        `/teams/${slug}/admin`,
        `/account/profile`,
        `/account/change-password`,
      ];
    } else if (currentUrl.includes("/setup")) {
      console.log("Detected setup flow:", currentUrl);
      targetRoutes = [currentUrl, "/account/profile"];
    } else {
      console.log("Checking page contents for links...");
      const links = await page.$$eval("a[href]", (elements) => elements.map((el) => el.getAttribute("href")));
      console.log("Found links:", [...new Set(links)]);
      targetRoutes = [...new Set(links.filter((l) => l.startsWith("/teams/") || l.startsWith("/account/")))];
    }

    // Capture each detected route on Desktop
    for (const route of targetRoutes) {
      const safeName = route.replace(/[^a-zA-Z0-9]/g, "_");
      try {
        console.log(`Navigating to ${route}...`);
        await page.goto(`${BASE_URL}${route}`, { waitUntil: "networkidle", timeout: 10000 });
        await page.waitForTimeout(1000);
        await page.screenshot({ path: `${SCREENSHOT_DIR}/${safeName}_desktop.png`, fullPage: true });
        console.log(`Saved: ${safeName}_desktop.png`);
      } catch (err) {
        console.error(`Failed to capture ${route}:`, err.message);
      }
    }

    // 2. Mobile context
    console.log("Creating Mobile context (375x812)...");
    const mobileContext = await browser.newContext({
      viewport: { width: 375, height: 812 },
      isMobile: true,
      hasTouch: true,
    });
    const mobilePage = await mobileContext.newPage();

    // Copy cookies from desktopContext so mobile is also logged in
    const cookies = await desktopContext.cookies();
    await mobileContext.addCookies(cookies);

    // Capture mobile login page
    await mobilePage.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });
    await mobilePage.screenshot({ path: `${SCREENSHOT_DIR}/01_login_mobile.png`, fullPage: true });
    console.log("Saved: 01_login_mobile.png");

    // Capture mobile demo page
    await mobilePage.goto(`${BASE_URL}/demo`, { waitUntil: "networkidle" });
    await mobilePage.screenshot({ path: `${SCREENSHOT_DIR}/demo_mobile.png`, fullPage: true });
    console.log("Saved: demo_mobile.png");

    // Capture each detected route on Mobile
    for (const route of targetRoutes) {
      const safeName = route.replace(/[^a-zA-Z0-9]/g, "_");
      try {
        console.log(`Navigating mobile to ${route}...`);
        await mobilePage.goto(`${BASE_URL}${route}`, { waitUntil: "networkidle", timeout: 10000 });
        await mobilePage.waitForTimeout(1000);
        await mobilePage.screenshot({ path: `${SCREENSHOT_DIR}/${safeName}_mobile.png`, fullPage: true });
        console.log(`Saved: ${safeName}_mobile.png`);
      } catch (err) {
        console.error(`Failed to capture mobile ${route}:`, err.message);
      }
    }

    // Also capture /demo desktop
    await page.goto(`${BASE_URL}/demo`, { waitUntil: "networkidle" });
    await page.screenshot({ path: `${SCREENSHOT_DIR}/demo_desktop.png`, fullPage: true });
    console.log("Saved: demo_desktop.png");

    console.log("All captures completed successfully!");
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error("Script error:", err);
  process.exit(1);
});
