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
  
  // Get all players from squad page
  await page.goto("http://localhost:3000/teams/nat-fc/squad", { waitUntil: "networkidle" });
  const players = await page.evaluate(() => {
    const cards = document.querySelectorAll('.player-card');
    return Array.from(cards).map(card => {
      const name = card.querySelector('h3')?.textContent?.trim();
      const href = card.querySelector('a')?.getAttribute('href');
      const userId = href ? href.split('/').pop() : null;
      const pos = card.querySelector('.position-pill, .position-chip')?.textContent?.trim();
      const num = card.querySelector('.player-top > strong')?.textContent?.trim();
      return { name, userId, pos, num };
    });
  });

  console.log("FOUND PLAYERS IN SQUAD:", players.filter(p => p.name?.startsWith("Test")));
  await browser.close();
}

main().catch(console.error);
