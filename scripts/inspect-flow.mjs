import { chromium } from "playwright";

async function main() {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage();
  await page.goto("http://localhost:3000/login", { waitUntil: "networkidle" });
  await page.fill("#login-identifier", "hunglt");
  await page.fill("#login-password", "Sup3rm4n001@!");
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle" }),
    page.click('button[type="submit"]'),
  ]);
  await page.goto("http://localhost:3000/teams/nat-fc/overview", { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  const teamInfo = await page.evaluate(() => {
    const el = document.querySelector('[data-team-id]');
    return el ? el.getAttribute('data-team-id') : null;
  });
  console.log("TEAM INFO:", teamInfo);
  // Also get teamId from squad page props or form
  await page.goto("http://localhost:3000/teams/nat-fc/squad?add=player", { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  await page.fill('input[name="displayName"]', "Test 7");
  await page.fill('input[name="email"]', `test7_${Date.now()}@example.com`);
  await page.fill('input[name="shirtNumber"]', "81");
  await page.selectOption('select[name="officialPosition"]', "GK");
  
  // Intercept response
  const [response] = await Promise.all([
    page.waitForResponse(res => res.url().includes("/api/teams/nat-fc/members")),
    page.click('.provision-member-form button[type="submit"]'),
  ]);
  const status = response.status();
  const json = await response.json().catch(() => null);
  console.log("PROVISION RESPONSE:", status, json);
  await browser.close();
}

main().catch(console.error);
