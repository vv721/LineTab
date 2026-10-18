// 一次性检查：细节体验.html 第 07 节的四张样张
// 1) 页面零 console / pageerror；
// 2) A0（现在的做法）必须抓到"一帧硬切"：切点阵 → 字脸 + 点阵纹样；切暖陶 → 字脸 + 菜单投影；
// 3) A1–A3 必须报"无"（三处都被接管）。
// 注意：这三处硬切分属不同的皮肤对（点子只在进出点阵时变、投影只在暖陶/暗色变），
// 所以两个目标都要跑。
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const page_url = pathToFileURL(path.join(import.meta.dirname, '..', '细节体验.html')).href;
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

await page.goto(page_url);
await page.waitForTimeout(400);

const results = {};
for (const target of ['grid', 'clay']) {
  for (const kind of ['a0', 'a1', 'a2', 'a3']) {
    await page.click(`[data-sk-go="${kind}"][data-sk-to="${target}"]`);
    await page.waitForTimeout(1600);
    results[`${kind}→${target}`] = (await page.textContent(`[data-sk-cuts="${kind}"]`)).trim();
  }
}
await page.click('[data-sk-reset]');
await page.waitForTimeout(200);

const problems = [];
if (errors.length) problems.push(...errors);
const need = {
  'a0→grid': ['引导语字脸', '点阵纹样'],
  'a0→clay': ['引导语字脸', '菜单投影'],
};
for (const [key, words] of Object.entries(need)) {
  for (const w of words) if (!results[key].includes(w)) problems.push(`${key} 没抓到「${w}」：${results[key]}`);
}
for (const key of ['a1→grid', 'a2→grid', 'a3→grid', 'a1→clay', 'a2→clay', 'a3→clay']) {
  if (!/^无/.test(results[key])) problems.push(`${key} 仍有单帧完成：${results[key]}`);
}

console.log(JSON.stringify(results, null, 1));
console.log(problems.length ? 'FAIL\n' + problems.join('\n') : 'PASS');
await browser.close();
process.exitCode = problems.length ? 1 : 0;
