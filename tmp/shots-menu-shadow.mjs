/* 一次性：拍"暖陶二级菜单的分层（V3 投影，m01541）"浅色 / 深色两张特写
   用法：node tmp/shots-menu-shadow.mjs
   产出：tmp/lab-shots/clay-menu-shadow-light.png / clay-menu-shadow-dark.png */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const PAGE = 'file:///' + join(here, '..', 'Preview.html').replace(/\\/g, '/');
const OUT = join(here, 'lab-shots');
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome' });
const CLAY = '.stage[data-style="clay"]';

for (const [suffix, hash] of [['light', '#clay+bare+panel'], ['dark', '#clay+bare+dark+panel']]) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(PAGE + hash);
  await page.waitForTimeout(420);            // 等 D1 的逐色渐变走完（暗色这一步）
  await page.locator(`${CLAY} .panel .row:has(.rl:text-is("默认搜索引擎")) .rv`).click();
  await page.waitForTimeout(80);
  const out = join(OUT, `clay-menu-shadow-${suffix}.png`);
  await page.screenshot({ path: out, clip: { x: 1056, y: 404, width: 384, height: 466 } });
  const shadow = await page.$eval(`${CLAY} .menu:not([hidden])`, el => getComputedStyle(el).boxShadow);
  console.log(suffix, '→', out, '\n   box-shadow =', shadow);
  await page.close();
}

await browser.close();
