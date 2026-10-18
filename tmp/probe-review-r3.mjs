// 探针 3（重写）：
//   A. 后台标签页（rAF 被节流）里 data-booting 会不会一直摘不掉 → 首屏之后换肤/亮暗的过渡永久失效
//   B. 对照：前台加载 / 手动摘掉属性时，同一个换肤中途确实是中间值（证明探针能测出差异）
import { chromium } from 'playwright-core';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PAGE = pathToFileURL(path.join(ROOT, 'Preview.html')).href;

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const state = p => p.evaluate(() => {
  const el = document.querySelector('.stage');
  return {
    hidden: document.hidden,
    booting: el.hasAttribute('data-booting'),
    dur: getComputedStyle(el).getPropertyValue('--dur-theme').trim(),
    bg: getComputedStyle(el).getPropertyValue('--bg').trim(),
  };
});

/* ---------- 前台加载（对照） ---------- */
const frontCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const front = await frontCtx.newPage();
await front.goto(`${PAGE}#clay+panel`);
await front.waitForTimeout(600);
console.log('B 前台加载后：', JSON.stringify(await state(front)));
await front.evaluate(() => { document.querySelector('.stage').dataset.style = 'paper'; });
await front.waitForTimeout(200);
console.log('B 前台换肤 200ms 中途：', JSON.stringify(await state(front)));
await front.waitForTimeout(600);
console.log('B 前台换肤 800ms 后：', JSON.stringify(await state(front)));

/* ---------- 后台加载：另一个 context 的页面占着前台 ---------- */
const bgCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const bg = await bgCtx.newPage();
await bg.goto(`${PAGE}#clay+panel`);
await bg.waitForTimeout(1200);
console.log('A 后台加载 1.2s 后：', JSON.stringify(await state(bg)));
await bg.evaluate(() => { document.querySelector('.stage').dataset.style = 'paper'; });
await bg.waitForTimeout(300);
console.log('A 后台换肤 300ms 中途：', JSON.stringify(await state(bg)));
await bg.waitForTimeout(900);
console.log('A 后台换肤 1.2s 后（目标 --bg 应为 rgb(250,249,245)）：', JSON.stringify(await state(bg)));

await browser.close();
