import { chromium } from "playwright";
import { resolve } from "node:path";

const SCREENSHOT_DIR = "C:/Users/X/.gemini/antigravity-ide/brain/2c72d1dd-0c40-4134-9a3b-6aa46ae35812/screenshots";

async function main() {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1.5 });
  const page = await context.newPage();

  await page.goto("http://localhost:3000/login", { waitUntil: "networkidle" });
  await page.fill("#login-identifier", process.env.PRO7_TEST_USER || "admin");
  await page.fill("#login-password", process.env.PRO7_TEST_PASSWORD || "");
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle" }),
    page.click('button[type="submit"]'),
  ]);

  // Squad search for "Test"
  await page.goto("http://localhost:3000/teams/nat-fc/squad", { waitUntil: "networkidle" });
  await page.fill('input[placeholder*="Tìm theo tên"]', "Test");
  await page.waitForTimeout(800);
  await page.screenshot({ path: resolve(SCREENSHOT_DIR, "demo_01_squad_test_athletes.png") });
  console.log("📸 Đã chụp: demo_01_squad_test_athletes.png");

  await browser.close();
}

main().catch(console.error);
