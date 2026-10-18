// 把 05 节拍成图，好在交付前自己先看一眼（尤其是过场的中间帧）。
// 跑法：node tmp/shots-lab.mjs   → tmp/lab-shots/*.png
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PAGE = pathToFileURL(path.join(ROOT, '细节体验.html')).href;
const OUT = path.join(ROOT, 'tmp', 'lab-shots');
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1200, height: 1400 } });
await page.goto(PAGE);
await page.waitForTimeout(200);

const row = (index) => page.locator('.lab-row.theme-row').nth(index);
const KEYS = ['d0', 'd1', 'd2', 'd3'];

// 亮色下的整节
await page.locator('.lab-group').nth(4).screenshot({ path: path.join(OUT, '05-light.png') });

// 每一行静止在暗色
for (let i = 0; i < KEYS.length; i += 1) {
  await page.click(`[data-flip="${KEYS[i]}"]`);
  await page.waitForTimeout(900);
  await row(i).screenshot({ path: path.join(OUT, `05-${KEYS[i]}-dark.png`) });
}
await page.click('[data-reset]');
await page.waitForTimeout(200);

// 中间帧：把时长拖到 4000ms，再按比例停住拍
const midShot = async (key, index, atMs, name) => {
  const el = `.demo[data-demo="${key}"]`;
  await page.$eval(el, (node) => node.style.setProperty('--dur-theme', '4000ms'));
  await page.waitForTimeout(60);
  await page.click(`[data-flip="${key}"]`);
  await page.waitForTimeout(atMs);
  await row(index).screenshot({ path: path.join(OUT, `${name}.png`) });
  await page.click('[data-reset]');
  await page.$eval(el, (node) => node.style.removeProperty('--dur-theme'));
  await page.waitForTimeout(250);
};

await midShot('d1', 1, 1000, '05-d1-mid25');
await midShot('d1', 1, 1600, '05-d1-mid40');
await midShot('d1', 1, 2400, '05-d1-mid60');
await midShot('d2', 2, 2600, '05-d2-mid65');
await midShot('d3', 3, 1800, '05-d3-dip45');
await midShot('d3', 3, 2100, '05-d3-just-after');

await browser.close();
console.log('拍完了：', fs.readdirSync(OUT).join('  '));
