import { chromium } from "playwright";

const SCREENSHOT_DIR = "C:/Users/X/.gemini/antigravity-ide/brain/2c72d1dd-0c40-4134-9a3b-6aa46ae35812/screenshots";

async function main() {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1.5,
    });
    console.log("Navigating to rewindapp.flatstudio.co...");
    await page.goto("https://rewindapp.flatstudio.co/", { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(2000);
    
    // Screenshot Hero
    await page.screenshot({ path: `${SCREENSHOT_DIR}/rewind_01_hero.png` });

    // Scroll to Feed & Matches
    await page.evaluate(() => window.scrollBy(0, 1600));
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/rewind_02_feed.png` });

    // Scroll to Events / Football
    await page.evaluate(() => window.scrollBy(0, 2200));
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/rewind_03_events_football.png` });

    // Scroll to Profiles
    await page.evaluate(() => window.scrollBy(0, 3000));
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/rewind_04_profiles.png` });

    console.log("Captured Rewind screenshots successfully!");
  } catch (err) {
    console.error("Error capturing Rewind:", err);
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
