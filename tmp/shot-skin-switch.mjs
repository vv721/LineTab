// 一次性截图：第 07 节每张样张的"中途"与"终点"，给人眼过一遍。
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const root = path.join(import.meta.dirname, '..');
const url = pathToFileURL(path.join(root, '细节体验.html')).href;
const out = path.join(root, 'tmp', 'lab-shots');
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 980 }, deviceScaleFactor: 2 });
await page.goto(url);
await page.waitForTimeout(400);

for (const kind of ['a0', 'a1', 'a2', 'a3']) {
  await page.click(`[data-sk-go="${kind}"][data-sk-to="grid"]`);
  await page.waitForTimeout(60);
  for (const [tag, t] of [['mid', 120], ['end', 900]]) {
    await page.evaluate((ms) => {
      const bar = document.querySelector('[data-sk-bar]');
      bar.value = String(ms);
      bar.dispatchEvent(new Event('input', { bubbles: true }));
    }, t);
    await page.waitForTimeout(120);
    await page.locator(`.sk-demo[data-sk="${kind}"]`).screenshot({ path: path.join(out, `07-${kind}-${tag}.png`) });
  }
  await page.click('[data-sk-reset]');
  await page.waitForTimeout(80);
}
console.log('ok');
await browser.close();
