// 探针：lead / focus 两条新设置"存了到底有没有应用"
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PAGE = pathToFileURL(path.join(ROOT, 'newtab.html')).href;

const browser = await chromium.launch({ channel: 'chrome' });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

async function dump(tag) {
  console.log(tag, {
    lead: await page.locator('html').getAttribute('data-lead'),
    focus: await page.locator('html').getAttribute('data-focus'),
    leadLabel: await page.locator('#lead-value').textContent(),
    focusLabel: await page.locator('#focus-value').textContent(),
    stored: await page.evaluate(() => localStorage.getItem('newtab.settings')),
  });
}

await page.goto(`${PAGE}#paper+panel`);
await dump('初始(#paper+panel)');
await page.locator('#lead').click();
await page.locator('#focus').click();
await dump('手动各点一次后');
await page.goto(PAGE); // 不带 hash 重新打开
await page.waitForTimeout(400);
await dump('重开(无 hash)');
await page.goto(`${PAGE}#paper`); // 带 hash 重新打开
await page.waitForTimeout(400);
await dump('重开(#paper)');

await browser.close();
