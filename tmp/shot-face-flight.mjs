/**
 * 一次性探针（不进入产物）：换肤中途给引导语拍两张 —— 飞行中与落定后。
 * 用途：用户 m05277 报的"暖陶→纸白时引导语出现 1~2 个字符的换行"是中途才看得见的，
 * 落定后的基准图看不出来。顺带把两张脸的盒子宽度与自然宽度打出来。
 */
import { chromium } from 'playwright';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PAGE = pathToFileURL(path.join(ROOT, 'Preview.html')).href;
const OUT = path.join(ROOT, 'tmp', 'lab-shots');

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
// 带查询串，强制真换文档（只改 #hash 的 goto 不会重新加载）
await page.goto(`${PAGE}?shot=flight#clay`);
await page.waitForTimeout(400);

const readFlight = () => page.evaluate(() => {
  const el = document.querySelector('.mark');
  const old = el.querySelector('.is-old');
  const next = el.querySelector('.is-new');
  if (!old || !next) return { faces: 0, text: el.textContent };
  const box = next.getBoundingClientRect();
  const was = next.style.whiteSpace;
  next.style.whiteSpace = 'nowrap';
  const natural = next.getBoundingClientRect().width;
  next.style.whiteSpace = was;
  return {
    faces: el.querySelectorAll('.mk-face').length,
    flying: el.classList.contains('is-flying'),
    plain: el.classList.contains('is-plain'),
    oldH: old.offsetHeight,
    newH: next.offsetHeight,
    newW: Number(box.width.toFixed(2)),
    natural: Number(natural.toFixed(2)),
  };
});

// 换到纸白：设置按钮 → 风格那一行 → 纸白
await page.locator('.stage .settings').click();
await page.waitForTimeout(120);
await page.evaluate(() => {
  const row = [...document.querySelectorAll('.stage .panel .row')]
    .find(r => r.querySelector('.rl')?.textContent.includes('风格'));
  row.querySelector('.rv').click();
});
await page.waitForTimeout(60);
await page.evaluate(() => {
  const row = [...document.querySelectorAll('.stage .panel .row')]
    .find(r => r.querySelector('.rl')?.textContent.includes('风格'));
  row.querySelector('.menu-opt[data-value="paper"]').click();
});

await page.waitForTimeout(140);
const mid = await readFlight();
await page.locator('.mark').screenshot({ path: path.join(OUT, 'flight-clay-paper-mid.png') });

await page.waitForTimeout(900);
const end = await readFlight();
await page.locator('.mark').screenshot({ path: path.join(OUT, 'flight-clay-paper-end.png') });
const settled = await page.evaluate(() => ({
  style: document.querySelector('.stage').dataset.style,
  text: document.querySelector('.mark').textContent,
  faces: document.querySelectorAll('.mark .mk-face').length,
}));

console.log('mid  =', JSON.stringify(mid));
console.log('end  =', JSON.stringify(end));
console.log('settled =', JSON.stringify(settled));
await browser.close();
