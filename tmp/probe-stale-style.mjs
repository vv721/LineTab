// 探针：存储里留着已删除的风格名（以前的 "mist"/"night"）时，页面要落回默认外观、
// 面板也要显示真实存在的名字，而不是一个不存在的风格名（m02255 新增的存量清理）。
// 跑法：node tmp/probe-stale-style.mjs
import { chromium } from 'playwright';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = path.resolve(import.meta.dirname, '..');
const PAGE = pathToFileURL(path.join(ROOT, 'newtab.html')).href;

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

await page.goto(PAGE);
for (const stale of ['mist', 'night', 'paper', 'grid']) {
  await page.evaluate((style) => {
    localStorage.setItem('newtab.settings', JSON.stringify({ style, dark: null }));
  }, stale);
  await page.goto(PAGE);  // 不带 hash，才看得到"存储里的风格"本身（hash 会盖过它）
  await page.reload();    // 换 hash 是同文档导航，必须 reload 才会重新读存储
  const seen = await page.evaluate(() => ({
    dataStyle: document.documentElement.dataset.style,
    panelText: document.querySelector('#style-value').textContent,
  }));
  console.log(`存的是 ${stale.padEnd(6)} → data-style=${seen.dataStyle.padEnd(6)} 面板显示="${seen.panelText}"`);
}

await browser.close();
