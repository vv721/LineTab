// 实证「n3 / d2 真的生效了」：用 Playwright 打开真页面，读计算后的令牌值。
// 光看 CSS 源码不够 —— 暗色覆盖是两条规则叠出来的，只有 computed style 能证明谁赢。
// 跑法：node tmp/probe-dots-applied.mjs
import { chromium } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const PAGE = pathToFileURL(resolve(import.meta.dirname, '..', 'newtab.html')).href;
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const read = (hash) =>
  page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    return {
      style: document.documentElement.dataset.style,
      theme: document.documentElement.dataset.theme ?? '(亮)',
      bg: cs.getPropertyValue('--bg').trim(),
      dot: cs.getPropertyValue('--dot').trim(),
      dotSize: cs.getPropertyValue('--dot-size').trim(),
      major: cs.getPropertyValue('--dot-major').trim() || '(未定义)',
      pageBg: getComputedStyle(document.querySelector('.page')).backgroundColor,
      image: getComputedStyle(document.querySelector('.page')).backgroundImage.slice(0, 60),
    };
  });

const cases = [
  ['#grid', 'C 点阵 · 浅色（应为 n3 暖白纸）'],
  ['#grid+dark', 'C 点阵 · 暗色（应为 d2 暖墨纸）'],
  ['#paper+dark', 'A 纸白 · 暗色（不该被点阵的规则碰到）'],
  ['#paper', 'A 纸白 · 浅色（不该有点）'],
];

let bad = 0;
let n = 0;
// 注意：newtab.js 只在**加载时**读一次 hash（没有 hashchange 监听），
// 所以每个案例都要用一个带查询串的 URL 强制真加载，否则同文档改 hash 不会生效。
for (const [hash, label] of cases) {
  await page.goto(`${PAGE}?case=${n++}${hash}`);
  await page.waitForTimeout(200);
  const r = await read(hash);
  console.log(`\n${label}   ${hash}`);
  console.log(`  data-style=${r.style}  data-theme=${r.theme}`);
  console.log(`  --bg=${r.bg}  --dot=${r.dot}  --dot-size=${r.dotSize}  --dot-major=${r.major}`);
  console.log(`  .page background-color=${r.pageBg}`);
  console.log(`  .page background-image=${r.image}`);
}

// 断言
await page.goto(`${PAGE}?case=light#grid`);
await page.waitForTimeout(200);
let r = await read();
const okLight =
  r.bg === '#faf7f1' && r.dot === 'rgb(74 63 48 / 10%)' && r.dotSize === '18px' && r.major === '(未定义)';
console.log(`\n浅色是否等于 n3：${okLight ? 'OK' : '不符 —— ' + JSON.stringify(r)}`);
if (!okLight) bad++;

await page.goto(`${PAGE}?case=dark#grid+dark`);
await page.waitForTimeout(200);
r = await read();
const okDark = r.bg === '#1b1917' && r.theme === 'dark' && r.dot === 'rgb(255 246 232 / 11%)' && r.dotSize === '18px';
console.log(`暗色是否等于 d2：${okDark ? 'OK' : '不符 —— ' + JSON.stringify(r)}`);
if (!okDark) bad++;

await page.goto(`${PAGE}?case=paperdark#paper+dark`);
await page.waitForTimeout(200);
r = await read();
const okPaper = r.bg === '#181818' && r.theme === 'dark';
console.log(`A 暗色底仍是 #181818：${okPaper ? 'OK' : '不符 —— ' + JSON.stringify(r)}`);
if (!okPaper) bad++;

await browser.close();
console.log(bad === 0 ? '\n全部通过' : `\n${bad} 条不符`);
process.exit(bad === 0 ? 0 : 1);
