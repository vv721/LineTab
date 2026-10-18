// 探针 3：键盘 d 与面板「暗色」行的同步
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve('D:/桌面/dsh/newtab-extension');
const PAGE = pathToFileURL(path.join(ROOT, '风格预览.html')).href;
const C = '.stage[data-style="clay"] ';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: 'light' });

await page.goto('about:blank');
await page.goto(`${PAGE}#clay+bare`);
await page.click(`${C}.settings`);          // 开面板（脚本会把焦点放进搜索框）
await page.click(`${C}.panel .row:nth-child(4) .rv`);  // 打开「暗色」菜单
await page.keyboard.press('Escape');        // 关菜单，焦点回到该行按钮
const before = {
  row: (await page.textContent(`${C}.panel .row:nth-child(4) .rv`)).trim(),
  sel: await page.$$eval(`${C}.panel .row:nth-child(4) .menu-opt[aria-selected="true"]`, els => els.map(e => e.dataset.value)),
  theme: await page.getAttribute('.stage[data-active]', 'data-theme'),
  dark: await page.getAttribute('.bar button[data-dark]', 'aria-pressed'),
};
await page.keyboard.press('d');
const after = {
  row: (await page.textContent(`${C}.panel .row:nth-child(4) .rv`)).trim(),
  sel: await page.$$eval(`${C}.panel .row:nth-child(4) .menu-opt[aria-selected="true"]`, els => els.map(e => e.dataset.value)),
  theme: await page.getAttribute('.stage[data-active]', 'data-theme'),
  dark: await page.getAttribute('.bar button[data-dark]', 'aria-pressed'),
  focus: await page.evaluate(() => document.activeElement.className),
};
console.log('按 d 之前:', JSON.stringify(before, null, 0));
console.log('按 d 之后:', JSON.stringify(after, null, 0));
await browser.close();
