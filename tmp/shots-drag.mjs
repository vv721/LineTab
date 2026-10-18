/* 一次性：把"拖动中的轻度指引"拍下来（松开之前截图）
   用法：node tmp/shots-drag.mjs
   产出：tmp/lab-shots/clay-drag-*.png */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const PAGE = 'file:///' + join(here, '..', 'Preview.html').replace(/\\/g, '/');
const OUT = join(here, 'lab-shots');
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(PAGE + '#clay+bare+panel');
await page.waitForTimeout(200);

const CLAY = '.stage[data-style="clay"]';
const ENG = `${CLAY} [data-menu-key="engine"]`;
const opt = v => page.locator(`${ENG} .menu-opt[data-value="${v}"]:not([data-action])`);

await page.locator(`${CLAY} .panel .row:has(.rl:text-is("默认搜索引擎")) .rv`).click();
await page.waitForTimeout(80);

// 抓住 Bing，拖到"Google 与 自定义… 之间"停住（不松手）
const a = await opt('bing').boundingBox();
const b = await opt('google').boundingBox();
const x = a.x + a.width - 18;
await page.mouse.move(x, a.y + a.height / 2);
await page.mouse.down();
await page.mouse.move(x, a.y + a.height / 2 + 9, { steps: 2 });
await page.waitForTimeout(60);
await page.screenshot({ path: join(OUT, 'clay-drag-pickup.png'), clip: { x: 1060, y: 400, width: 380, height: 300 } });

await page.mouse.move(x, b.y + b.height - 3, { steps: 4 });
await page.waitForTimeout(60);
await page.screenshot({ path: join(OUT, 'clay-drag-drop.png'), clip: { x: 1060, y: 400, width: 380, height: 300 } });

await page.mouse.up();
await page.waitForTimeout(90);
await page.screenshot({ path: join(OUT, 'clay-drag-done.png'), clip: { x: 1060, y: 400, width: 380, height: 300 } });

console.log('次序 =', await page.$$eval(`${ENG} .menu-opt`,
  els => els.map(o => o.dataset.value + (o.dataset.action ? '(动作)' : '')).join(' | ')));
await browser.close();
