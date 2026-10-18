// 一次性：把 细节体验.html 的 06 节（面板与二级菜单的分层）拍下来，亮色/暗色各一张
// 用法：node tmp/shots-lay.mjs
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { mkdir } from 'node:fs/promises';

const here = dirname(fileURLToPath(import.meta.url));
const PAGE = 'file:///' + resolve(here, '..', '细节体验.html').replace(/\\/g, '/');
const OUT = resolve(here, 'lab-shots');

await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({
  viewport: { width: 1000, height: 1400 },
  deviceScaleFactor: 1.5,
});
await page.goto(PAGE);

const section = page.locator('section.lab-group', { has: page.locator('[data-lay-dark]') });
await section.scrollIntoViewIfNeeded();

await page.screenshot({ path: resolve(OUT, '06-light.png'), clip: await section.boundingBox() });

await page.locator('[data-lay-dark]').check();
await page.waitForTimeout(80);
await page.screenshot({ path: resolve(OUT, '06-dark.png'), clip: await section.boundingBox() });

// 一眼比"底板与菜单"的接缝：六张样张各自的近景（同一裁切尺寸）
for (const lay of ['v0', 'v1', 'v2', 'v3', 'v4', 'v5']) {
  const box = await page.locator(`.lay-demo[data-lay="${lay}"]`).boundingBox();
  await page.screenshot({
    path: resolve(OUT, `06-${lay}-dark.png`),
    clip: { x: box.x - 6, y: box.y - 6, width: box.width + 12, height: box.height + 12 },
  });
}

await page.locator('[data-lay-dark]').uncheck();
await page.waitForTimeout(80);
for (const lay of ['v0', 'v1', 'v2', 'v3', 'v4', 'v5']) {
  const box = await page.locator(`.lay-demo[data-lay="${lay}"]`).boundingBox();
  await page.screenshot({
    path: resolve(OUT, `06-${lay}-light.png`),
    clip: { x: box.x - 6, y: box.y - 6, width: box.width + 12, height: box.height + 12 },
  });
}

console.log('done →', OUT);
await browser.close();
