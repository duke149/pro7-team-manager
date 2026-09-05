import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

// Read-only browser check: no login, cookies, or database mutations.
const origin = process.env.QA_ORIGIN ?? 'http://127.0.0.1:3000';
const path = '/teams/pro7-qa-20260905/matches/fe371deb-be44-42d3-a1cb-09e7c7eb1113/rsvp';
const output = process.env.QA_SCREENSHOTS;
assert.ok(output, 'Set QA_SCREENSHOTS to an absolute evidence directory');
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin + path);
  await page.waitForURL(url => url.pathname === '/login');
  assert.equal(new URL(page.url()).searchParams.get('next'), path);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).waitFor();
  await page.screenshot({ path: output + '/16-rsvp-anonymous-login.png', fullPage: true });
  assert.deepEqual(errors, []);
  console.log('PASS anonymous RSVP redirects to login, preserves exact next path, no page errors');
} finally {
  await browser.close();
}
