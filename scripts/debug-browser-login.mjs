import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const SCREENSHOT_DIR = "C:/Users/X/.gemini/antigravity-ide/brain/2c72d1dd-0c40-4134-9a3b-6aa46ae35812/screenshots";
const BASE_URL = "http://localhost:3000";

async function main() {
  await mkdir(SCREENSHOT_DIR, { recursive: true });
  console.log("Launching Chrome...");
  const browser = await chromium.launch({ channel: "chrome", headless: true });

  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    });
    const page = await context.newPage();

    page.on("console", (msg) => console.log(`[BROWSER CONSOLE] ${msg.type()}: ${msg.text()}`));
    page.on("request", (req) => {
      if (req.url().includes("supabase") || req.url().includes("login") || req.url().includes("auth")) {
        console.log(`[REQ] ${req.method()} ${req.url()}`);
      }
    });
    page.on("response", (res) => {
      if (res.url().includes("supabase") || res.url().includes("login") || res.url().includes("auth")) {
        console.log(`[RES] ${res.status()} ${res.url()}`);
      }
    });

    console.log("Navigating to login page...");
    await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });

    // Check what env variables are inside the browser
    const envInBrowser = await page.evaluate(() => {
      return {
        url: window.process?.env?.NEXT_PUBLIC_SUPABASE_URL || "not found in process.env",
      };
    });
    console.log("Env in browser:", envInBrowser);

    console.log("Filling form...");
    await page.fill('#login-identifier', process.env.PRO7_TEST_USER || "admin");
    await page.fill('#login-password', process.env.PRO7_TEST_PASSWORD || "");

    console.log("Clicking submit...");
    await page.click('button[type="submit"]');

    // Wait for network activity or redirect
    await page.waitForTimeout(5000);

    console.log("Current URL after 5s:", page.url());
    const err = await page.locator(".login-error").innerText().catch(() => "");
    console.log("Login error (if any):", err);
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
