import { chromium } from "playwright";
import { resolve } from "node:path";

const ARTIFACTS_DIR = "C:/Users/X/.gemini/antigravity-ide/brain/2c72d1dd-0c40-4134-9a3b-6aa46ae35812/screenshots";

async function main() {
  const browser = await chromium.launch({ channel: "chrome", headless: true });

  // 1. Desktop Context
  const desktopContext = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1.5,
  });
  const desktopPage = await desktopContext.newPage();

  // Login
  await desktopPage.goto("http://localhost:3000/login", { waitUntil: "networkidle" });
  await desktopPage.fill('#login-identifier', "hunglt");
  await desktopPage.fill('#login-password', "Sup3rm4n001@!");
  await Promise.all([
    desktopPage.waitForNavigation({ waitUntil: "networkidle" }),
    desktopPage.click('button[type="submit"]'),
  ]);
  await desktopPage.waitForURL("**/teams/**", { timeout: 15000 });
  await desktopPage.waitForLoadState("networkidle");

  const currentUrl = desktopPage.url();
  const match = currentUrl.match(/\/teams\/([^/]+)/);
  const slug = match ? match[1] : "nat-fc";

  // Capture Matches Desktop
  await desktopPage.goto(`http://localhost:3000/teams/${slug}/matches`, { waitUntil: "networkidle" });
  await desktopPage.waitForTimeout(1000);
  await desktopPage.screenshot({ path: resolve(ARTIFACTS_DIR, "rewind_matches_desktop.png") });
  console.log("Captured rewind_matches_desktop.png");

  // Capture Squad Desktop
  await desktopPage.goto(`http://localhost:3000/teams/${slug}/squad`, { waitUntil: "networkidle" });
  await desktopPage.waitForTimeout(1000);
  await desktopPage.screenshot({ path: resolve(ARTIFACTS_DIR, "rewind_squad_desktop.png") });
  console.log("Captured rewind_squad_desktop.png");

  // Capture Tactics Desktop
  await desktopPage.goto(`http://localhost:3000/teams/${slug}/tactics`, { waitUntil: "networkidle" });
  await desktopPage.waitForTimeout(1500);
  await desktopPage.screenshot({ path: resolve(ARTIFACTS_DIR, "rewind_tactics_desktop.png") });
  console.log("Captured rewind_tactics_desktop.png");

  // Capture Funds Desktop
  await desktopPage.goto(`http://localhost:3000/teams/${slug}/funds`, { waitUntil: "networkidle" });
  await desktopPage.waitForTimeout(1000);
  await desktopPage.screenshot({ path: resolve(ARTIFACTS_DIR, "rewind_funds_desktop.png") });
  console.log("Captured rewind_funds_desktop.png");

  // Click VietQR modal
  try {
    await desktopPage.click(".vietqr-btn");
    await desktopPage.waitForTimeout(600);
    await desktopPage.screenshot({ path: resolve(ARTIFACTS_DIR, "rewind_funds_vietqr_modal.png") });
    console.log("Captured rewind_funds_vietqr_modal.png");
  } catch (err) {
    console.log("Could not click vietqr-btn:", err.message);
  }

  // 2. Mobile Context
  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const mobilePage = await mobileContext.newPage();

  await mobilePage.goto("http://localhost:3000/login", { waitUntil: "networkidle" });
  await mobilePage.fill('#login-identifier', "hunglt");
  await mobilePage.fill('#login-password', "Sup3rm4n001@!");
  await Promise.all([
    mobilePage.waitForNavigation({ waitUntil: "networkidle" }),
    mobilePage.click('button[type="submit"]'),
  ]);
  await mobilePage.waitForURL("**/teams/**", { timeout: 15000 });
  await mobilePage.waitForLoadState("networkidle");

  // Capture Matches Mobile
  await mobilePage.goto(`http://localhost:3000/teams/${slug}/matches`, { waitUntil: "networkidle" });
  await mobilePage.waitForTimeout(1000);
  await mobilePage.screenshot({ path: resolve(ARTIFACTS_DIR, "rewind_matches_mobile.png") });
  console.log("Captured rewind_matches_mobile.png");

  // Capture Squad Mobile
  await mobilePage.goto(`http://localhost:3000/teams/${slug}/squad`, { waitUntil: "networkidle" });
  await mobilePage.waitForTimeout(1000);
  await mobilePage.screenshot({ path: resolve(ARTIFACTS_DIR, "rewind_squad_mobile.png") });
  console.log("Captured rewind_squad_mobile.png");

  // Capture Tactics Mobile
  await mobilePage.goto(`http://localhost:3000/teams/${slug}/tactics`, { waitUntil: "networkidle" });
  await mobilePage.waitForTimeout(1500);
  await mobilePage.screenshot({ path: resolve(ARTIFACTS_DIR, "rewind_tactics_mobile.png") });
  console.log("Captured rewind_tactics_mobile.png");

  // Capture Funds Mobile
  await mobilePage.goto(`http://localhost:3000/teams/${slug}/funds`, { waitUntil: "networkidle" });
  await mobilePage.waitForTimeout(1000);
  await mobilePage.screenshot({ path: resolve(ARTIFACTS_DIR, "rewind_funds_mobile.png") });
  console.log("Captured rewind_funds_mobile.png");

  await browser.close();
  console.log("Done capturing all screenshots!");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
