// 用真浏览器把两版页面的设置面板行（label = value）抠出来对比，避免手写正则踩嵌套
// 用法：node tmp/dump-rows.mjs
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';

const dump = async (page, file) => {
  await page.goto(pathToFileURL(file).href);
  return page.evaluate(() => [...document.querySelectorAll('.stage')].map(s => ({
    style: s.dataset.style,
    rows: [...s.querySelectorAll('.panel .row')].map(r => [
      r.querySelector('.rl')?.textContent.trim(),
      r.querySelector('.rv')?.textContent.trim(),
      r.classList.contains('row-param') ? 'param' : 'set',
    ]),
  })));
};

// 用本机 Chrome（与 playwright.config.mjs 的 chrome project 一致）
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage();
const oldStages = await dump(page, 'tmp/old-preview.html');
const newStages = await dump(page, 'Preview.html');
await browser.close();

const norm = (a, b) => JSON.stringify(a) === JSON.stringify(b);
for (const [i, o] of oldStages.entries()) {
  const n = newStages[0];
  console.log(`\n--- ${o.style}: 旧 ${o.rows.length} 行 vs 新 ${n.rows.length} 行`);
  const max = Math.max(o.rows.length, n.rows.length);
  for (let k = 0; k < max; k += 1) {
    const a = o.rows[k] || ['—', '—', '—'];
    const b = n.rows[k] || ['—', '—', '—'];
    const same = norm(a, b) ? '  ' : '≠ ';
    console.log(`${same}${String(k).padStart(2)} 旧 ${a[2]} ${a[0]} = ${a[1]}   |   新 ${b[2]} ${b[0]} = ${b[1]}`);
  }
}
