import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build } from 'vite';
import { chromium } from 'playwright';

// Real component and pointer events, isolated from account uploads / production DB.
const output = process.env.QA_SCREENSHOTS;
assert.ok(output, 'QA_SCREENSHOTS is required');
await mkdir(output, { recursive: true });
const result = await build({ configFile: false, define: { 'process.env.NODE_ENV': '"production"' }, build: { write: false, lib: { entry: resolve('tests/fixtures/avatar-crop-dialog-mounted-entry.ts'), formats: ['iife'], name: 'CropQA' } } });
const code = (Array.isArray(result) ? result : [result]).flatMap(r => r.output).find(c => c.type === 'chunk' && c.isEntry).code;
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.setContent('<main class="account-profile-shell"><div id="root"></div></main>');
  await page.addStyleTag({ content: await readFile('app/globals.css', 'utf8') });
  await page.addStyleTag({ content: await readFile('app/responsive.css', 'utf8') });
  await page.addScriptTag({ content: code });
  await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 800; canvas.height = 800;
    const context = canvas.getContext('2d');
    for (const [x, y, color] of [[0,0,'red'],[400,0,'blue'],[0,400,'green'],[400,400,'yellow']]) { context.fillStyle = color; context.fillRect(x,y,400,400); }
    CropQA.createRoot(document.querySelector('#root')).render(CropQA.createElement(CropQA.AvatarCropDialog, { previewUrl: canvas.toDataURL(), fileName: 'QA-quadrants.png', onCancel() {}, onConfirm(image, dimensions, transform) { window.qaCropResult = { dimensions, transform }; } }));
  });
  const save = page.getByRole('button', { name: 'Lưu ảnh', exact: true });
  await page.waitForFunction(() => !Array.from(document.querySelectorAll('button')).find(b => b.textContent === 'Lưu ảnh')?.disabled);
  const frame = page.locator('.account-avatar-crop-frame');
  const image = page.locator('.account-avatar-crop-image');
  const drag = async () => { const b = await frame.boundingBox(); await page.mouse.move(b.x+b.width/2,b.y+b.height/2); await page.mouse.down(); await page.mouse.move(b.x+b.width/2+45,b.y+b.height/2+30,{steps:8}); await page.mouse.up(); };
  await drag();
  assert.equal(await image.evaluate(e => e.style.left), '50%', 'Square source at 1x is intentionally clamped');
  await page.locator('[name="avatarZoom"]').fill('2');
  await drag();
  assert.notEqual(await image.evaluate(e => e.style.left), '50%', 'Pointer dragging must move image at 2x');
  assert.notEqual(await image.evaluate(e => e.style.top), '50%');
  await page.screenshot({ path: output + '/20-avatar-drag-2x.png', fullPage: true });
  await save.click();
  const chosen = await page.evaluate(() => window.qaCropResult);
  assert.equal(chosen.transform.zoom, 2); assert.ok(chosen.transform.panX > 0); assert.ok(chosen.transform.panY > 0);
  await page.getByRole('button', { name: 'Đặt lại', exact: true }).click();
  assert.equal(await image.evaluate(e => e.style.left), '50%');
  await page.getByRole('button', { name: 'Xoay 90°', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.account-avatar-crop-image')?.complete && !Array.from(document.querySelectorAll('button')).find(b => b.textContent === 'Lưu ảnh')?.disabled);
  const pixel = await image.evaluate(e => { const c = document.createElement('canvas'); c.width=800;c.height=800; const ctx=c.getContext('2d');ctx.drawImage(e,0,0);return [...ctx.getImageData(100,100,1,1).data]; });
  assert.deepEqual(pixel, [0,128,0,255], '90 degree rotation moves bottom-left green to top-left');
  assert.equal(await page.locator('.account-avatar-crop-mask').evaluate(e=>getComputedStyle(e,'::after').top), '0px');
  await page.screenshot({ path: output + '/22-avatar-fixed-rotated.png', fullPage:true });
  console.log('PASS square 1x clamping, real mouse drag X/Y at 2x, confirm transform, reset. No Storage upload performed.');
} finally { await browser.close(); }
