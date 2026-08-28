import { chromium } from "playwright";

async function main() {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage();
  await page.goto("http://localhost:3000/login", { waitUntil: "networkidle" });
  await page.fill("#login-identifier", process.env.PRO7_TEST_USER || "admin");
  await page.fill("#login-password", process.env.PRO7_TEST_PASSWORD || "");
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle" }),
    page.click('button[type="submit"]'),
  ]);
  
  await page.goto("http://localhost:3000/teams/nat-fc/matches", { waitUntil: "networkidle" });
  const matches = await page.evaluate(() => {
    const links = document.querySelectorAll('a[href*="/matches/"]');
    return Array.from(links).map(a => ({
      text: a.textContent?.trim(),
      href: a.getAttribute('href'),
    }));
  });

  console.log("MATCHES ON PAGE:", matches);
  await browser.close();
}

main().catch(console.error);
