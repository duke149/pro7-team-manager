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

  console.log("1. Logging in as admin...");
  await page.goto("http://localhost:3000/login", { waitUntil: "networkidle" });
  await page.fill("#login-identifier", process.env.PRO7_TEST_USER || "admin");
  await page.fill("#login-password", process.env.PRO7_TEST_PASSWORD || "");
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle" }),
    page.click('button[type="submit"]'),
  ]);

  console.log("2. Capturing Overview with Green Form Badges...");
  await page.goto("http://localhost:3000/teams/nat-fc/overview", { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: resolve(SCREENSHOT_DIR, "improved_01_overview_green_form.png"), fullPage: true });

  console.log("3. Capturing Squad with Real Appearances & Form...");
  await page.goto("http://localhost:3000/teams/nat-fc/squad", { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: resolve(SCREENSHOT_DIR, "improved_02_squad_real_form.png"), fullPage: true });

  console.log("4. Capturing Matches with Completed History List...");
  await page.goto("http://localhost:3000/teams/nat-fc/matches", { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: resolve(SCREENSHOT_DIR, "improved_03_matches_history_list.png"), fullPage: true });

  console.log("5. Capturing Match Detail with Stats and Admin Edit Score Form...");
  await page.goto("http://localhost:3000/teams/nat-fc/matches/70000000-0000-4000-8000-000000000001", { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: resolve(SCREENSHOT_DIR, "improved_04_completed_match_detail.png"), fullPage: true });

  console.log("6. Capturing Tactics Board for Completed Match...");
  await page.goto("http://localhost:3000/teams/nat-fc/tactics/70000000-0000-4000-8000-000000000001", { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: resolve(SCREENSHOT_DIR, "improved_05_match_tactics.png"), fullPage: true });

  console.log("7. Capturing FC A2 Completed Match Detail with Admin Form...");
  await page.goto("http://localhost:3000/teams/nat-fc/matches/71498d3d-e4f4-422c-aba1-8c6c9792414f", { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: resolve(SCREENSHOT_DIR, "improved_06_fca2_match_detail.png"), fullPage: true });

  await browser.close();
  console.log("=== ALL SCREENSHOTS CAPTURED SUCCESSFULLY ===");
}

run().catch((err) => {
  console.error("Error capturing screenshots:", err);
  process.exit(1);
});
