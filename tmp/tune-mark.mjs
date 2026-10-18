// 一次性调参台：同一套皮肤下换"引导语那张脸的排法"，裁同一块区域，最后用 Pillow 拼成一张图。
// 用法：node tmp/tune-mark.mjs
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PAGE = pathToFileURL(path.join(ROOT, 'Preview.html')).href;
const OUT = path.join(ROOT, 'tmp', 'lab-shots');

const VARIANTS = [
  { name: '1-paper-w600-40', style: 'paper', css: 'font-weight: 600' },
  { name: '2-paper-w400-40', style: 'paper', css: 'font-weight: 400' },
  { name: '3-paper-w300-44', style: 'paper', css: 'font-weight: 300; font-size: 44px' },
  { name: '4-grid-w500-44', style: 'grid', css: 'font-weight: 500' },
  { name: '5-grid-w400-44', style: 'grid', css: 'font-weight: 400' },
  { name: '6-clay-w400-41', style: 'clay', css: '' },
];

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const files = [];
for (const v of VARIANTS) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${PAGE}#${v.style}`);
  if (v.css) await page.addStyleTag({ content: `[data-style="${v.style}"] .mark { ${v.css} }` });
  await page.waitForTimeout(180);
  const file = path.join(OUT, `tune-${v.name}.png`);
  await page.screenshot({ path: file, clip: { x: 380, y: 190, width: 680, height: 260 } });
  files.push(file);
  await page.close();
}
await browser.close();
console.log(files.join('\n'));
