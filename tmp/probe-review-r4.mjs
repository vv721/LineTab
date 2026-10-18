// 探针 4：真实可见窗口（headed Chrome）里，后台标签页加载 Preview.html 之后
//   data-booting 是否一直摘不掉（rAF 在隐藏页被节流 ⇒ 摘除回调永不执行）
import { chromium } from 'playwright-core';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PAGE = pathToFileURL(path.join(ROOT, 'Preview.html')).href;

const browser = await chromium.launch({ channel: 'chrome', headless: false });
const ctx = await browser.newContext({ viewport: { width: 900, height: 700 } });
const front = await ctx.newPage();
await front.goto('about:blank');
await front.bringToFront();

const probe = (p) => p.evaluate(() => {
  const el = document.querySelector('.stage');
  return { hidden: document.hidden, booting: el.hasAttribute('data-booting'),
           dur: getComputedStyle(el).getPropertyValue('--dur-theme').trim() };
});

// 在后台打开文件页：不 bringToFront
const back = await ctx.newPage();
await back.goto(PAGE + '#clay+panel');
await back.waitForTimeout(300);
console.log('后台加载 0.3s：', JSON.stringify(await probe(back)));
await back.waitForTimeout(2500);
console.log('后台加载 2.8s：', JSON.stringify(await probe(back)));
await back.waitForTimeout(3000);
console.log('后台加载 5.8s：', JSON.stringify(await probe(back)));

// 切到前台后 1 帧应该就摘掉
await back.bringToFront();
await back.waitForTimeout(120);
console.log('切前台 0.12s：', JSON.stringify(await probe(back)));
await back.waitForTimeout(500);
console.log('切前台 0.6s：', JSON.stringify(await probe(back)));

await browser.close();
