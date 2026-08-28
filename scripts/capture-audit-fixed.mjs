import { chromium } from "playwright";
import { resolve } from "node:path";

const SCREENSHOT_DIR = "C:/Users/X/.gemini/antigravity-ide/brain/2c72d1dd-0c40-4134-9a3b-6aa46ae35812/screenshots";

async function run() {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1.5,
    locale: "vi-VN",
  });
  const page = await context.newPage();

  console.log("1. Logging in as hunglt...");
  await page.goto("http://localhost:3000/login", { waitUntil: "networkidle" });
  await page.fill("#login-identifier", "hunglt");
  await page.fill("#login-password", "Sup3rm4n001@!");
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle" }),
    page.click('button[type="submit"]'),
  ]);

  console.log("2. Capturing Overview with Refactored Stat Cards...");
  await page.goto("http://localhost:3000/teams/nat-fc/overview", { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: resolve(SCREENSHOT_DIR, "audit_fixed_01_overview_cards.png") });

  console.log("3. Hovering over recent form card and capturing elevation...");
  const formCard = await page.locator(".stat-card-interactive");
  await formCard.hover();
  await page.waitForTimeout(400);
  await page.screenshot({ path: resolve(SCREENSHOT_DIR, "audit_fixed_01_overview_hover.png") });

  console.log("4. Capturing Matches History with Polished Layout & Badges...");
  await page.goto("http://localhost:3000/teams/nat-fc/matches", { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: resolve(SCREENSHOT_DIR, "audit_fixed_02_matches_history.png") });

  console.log("5. Capturing Dark Mode for Matches & Overview...");
  await page.click('button[aria-label="Bật giao diện tối"]');
  await page.waitForTimeout(800);
  await page.screenshot({ path: resolve(SCREENSHOT_DIR, "audit_fixed_03_matches_dark.png") });
  await page.goto("http://localhost:3000/teams/nat-fc/overview", { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await page.screenshot({ path: resolve(SCREENSHOT_DIR, "audit_fixed_04_overview_dark.png") });

  await browser.close();
  console.log("=== AUDIT VERIFICATION SCREENSHOTS CAPTURED ===");
}

run().catch((err) => {
  console.error("Error capturing audit screenshots:", err);
  process.exit(1);
});
