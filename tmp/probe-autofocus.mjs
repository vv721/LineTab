// 实证「打开就聚焦搜索框」以及它对焦点反馈两档的影响。
// 为什么要单独验：headless 截图看不出"谁是 activeElement"，而自动聚焦会改变
// 那条底线的默认颜色（line 档下聚焦 = 近黑、不聚焦 = 浅灰），得用 computed style 证明。
// 跑法：node tmp/probe-autofocus.mjs
import { chromium } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const PAGE = pathToFileURL(resolve(import.meta.dirname, '..', 'newtab.html')).href;
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const read = () =>
  page.evaluate(() => ({
    active: document.activeElement ? document.activeElement.id || document.activeElement.tagName : '(无)',
    line: getComputedStyle(document.querySelector('.search')).borderBottomColor,
    lead: document.documentElement.dataset.lead,
    focus: document.documentElement.dataset.focus,
  }));

let bad = 0;

// 1. 不带 hash 打开：应当已经聚焦在搜索框
await page.goto(`${PAGE}?case=1`);
await page.waitForTimeout(250);
let r = await read();
console.log(`打开后 activeElement = #${r.active}（期望 q）`);
if (r.active !== 'q') { console.log('  ✗ 没有自动聚焦'); bad++; }

// 2. line 档（默认）：聚焦与失焦的底线颜色应当不同
const focusedLine = r.line;
await page.evaluate(() => document.getElementById('q').blur());
await page.waitForTimeout(250);
r = await read();
const blurredLine = r.line;
console.log(`焦点反馈=${r.focus}  聚焦底线=${focusedLine}  失焦底线=${blurredLine}`);
if (r.focus !== 'line' || focusedLine === blurredLine) { console.log('  ✗ line 档两态应当不同'); bad++; }

// 3. hold 档：两态应当一样（界面不动）
await page.goto(`${PAGE}?case=2#paper+hold`);
await page.waitForTimeout(300);
r = await read();
const holdFocused = r.line;
await page.evaluate(() => document.getElementById('q').blur());
await page.waitForTimeout(250);
r = await read();
console.log(`焦点反馈=${r.focus}  聚焦底线=${holdFocused}  失焦底线=${r.line}`);
if (r.focus !== 'hold' || holdFocused !== r.line) { console.log('  ✗ hold 档两态应当相同'); bad++; }

// 4. 关掉页面焦点再回来：window focus 补聚焦这条路（模拟 Chrome 把焦点给了地址栏）
await page.goto(`${PAGE}?case=3`);
await page.waitForTimeout(250);
await page.evaluate(() => document.getElementById('q').blur());
await page.evaluate(() => window.dispatchEvent(new Event('focus')));
await page.waitForTimeout(100);
r = await read();
console.log(`blur 之后来一次 window focus：activeElement = #${r.active}（期望 q）`);
if (r.active !== 'q') { console.log('  ✗ window focus 没有补回焦点'); bad++; }

// 5. 面板里的按钮拿到焦点时，window focus 不该把焦点抢走
await page.evaluate(() => document.getElementById('settings').focus());
await page.evaluate(() => window.dispatchEvent(new Event('focus')));
await page.waitForTimeout(100);
r = await read();
console.log(`按钮聚焦时来一次 window focus：activeElement = #${r.active}（期望 settings，不该被抢）`);
if (r.active !== 'settings') { console.log('  ✗ 把按钮的焦点抢走了'); bad++; }

await browser.close();
console.log(bad === 0 ? '\n全部通过' : `\n${bad} 条不符`);
process.exit(bad === 0 ? 0 : 1);
