// 一次性：给「看稿工具条」出图（基准图都是 +bare 的，工具条本身一张都没有）。
// 用途：`m01850` 第 ⑤ 条「删掉风格代称前的字母」的肉眼凭据 —— 三个按钮上现在只写 纸白 / 点阵 / 暖陶。
// 跑法：node tmp/shot-bar.mjs
import { mkdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { chromium } from '@playwright/test';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = path.join(ROOT, 'tmp', 'lab-shots');
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(pathToFileURL(path.join(ROOT, 'Preview.html')).href, { waitUntil: 'load' });
await page.waitForTimeout(200);

for (const [key, name] of [['1', 'paper'], ['2', 'grid'], ['3', 'clay']]) {
  await page.keyboard.press(key);
  await page.waitForTimeout(250);
  const bar = page.locator('.bar');
  await bar.screenshot({ path: path.join(OUT, `bar-${name}.png`) });
  const labels = await page.locator('.bar button[data-target]').allInnerTexts();
  console.log(`${name}: 按钮文字 = ${JSON.stringify(labels.map((t) => t.trim()))}`);
}

await browser.close();
console.log('图已写到 tmp/lab-shots/bar-*.png');
