/* 一次性探针（用户 m05146）：验证 A3 的"静默降级"路径真的走到了。
   Preview.html 写死了引导语，而 file:// 页面拦不住 route（Playwright 的 route 不接管 file://），
   所以这里把 HTML 读进来、换掉那一句、把相对路径补成 ../ 再落到 tmp/ 下当临时副本
   （磁盘上的 Preview.html 一个字不动），然后各跑一遍：
     拉丁 / 印地语 → 拆单元（.mk-u = 字素簇数，is-plain 不在）
     阿拉伯语     → 不拆（is-plain 在场，.mk-u = 0，仍是两张脸的交叉淡入）
   用法：node tmp/probe-face-degrade.mjs   （产出 tmp/lab-shots/degrade-<case>-*.png） */
import { chromium } from 'playwright';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const shots = join(here, 'lab-shots');
mkdirSync(shots, { recursive: true });

const source = readFileSync(join(root, 'Preview.html'), 'utf8');
const CASES = [
  { id: 'latin', text: 'Type something', expectUnits: 13 },
  { id: 'arabic', text: 'السلام عليكم', expectUnits: 0 },
  { id: 'hindi', text: 'हिन्दी नमस्ते', expectUnits: 5 },   // ICU 的 Indic 连字规则：ि 与 ् 都并进同一簇
];

const browser = await chromium.launch({ channel: 'chrome' });
let bad = 0;

for (const c of CASES) {
  // 临时副本：换掉引导语 + 把相对引用改成从 tmp/ 出发也能找到
  const patched = source
    .replace('>Type something<', `>${c.text}<`)
    .replace(/(href|src)="(?!https?:|data:|#|\.\.\/|\/)/g, '$1="../');
  const copy = join(here, `face-degrade-${c.id}.html`);
  writeFileSync(copy, patched, 'utf8');

  const page = await browser.newPage({ viewport: { width: 1180, height: 760 } });
  await page.goto(`${pathToFileURL(copy).href}#paper+panel`);
  await page.waitForTimeout(300);

  const row = page.locator('.stage .panel .row').filter({ has: page.locator('.rl', { hasText: '风格' }) });
  if (await row.locator('.menu').isHidden()) await row.locator('.rv').click();
  await row.locator('.menu-opt[data-value="grid"]').click();

  const state = await page.locator('.mark').evaluate(el => ({
    faces: el.querySelectorAll('.mk-face').length,
    oldUnits: el.querySelectorAll('.is-old .mk-u').length,
    newUnits: el.querySelectorAll('.is-new .mk-u').length,
    plain: el.classList.contains('is-plain'),
    face: el.style.getPropertyValue('--mk-face'),
    step: el.style.getPropertyValue('--mk-step'),
    oldFrozen: getComputedStyle(el.querySelector('.is-old')).fontFamily,
    newNow: getComputedStyle(el.querySelector('.is-new')).fontFamily,
    flying: el.classList.contains('is-flying'),
  }));

  await page.waitForTimeout(150);
  await page.locator('.mark').screenshot({ path: join(shots, `degrade-${c.id}-mid.png`) });

  // 单元数按"一张脸"数：两张脸各拆一份
  const ok = state.faces === 2
    && state.oldUnits === c.expectUnits
    && state.newUnits === c.expectUnits
    && state.plain === (c.expectUnits === 0)
    && state.oldFrozen !== state.newNow;
  if (!ok) bad += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${c.id.padEnd(7)}`, JSON.stringify(state));

  await page.waitForTimeout(800);
  const after = await page.locator('.mark').evaluate(el => ({
    faces: el.querySelectorAll('.mk-face').length,
    units: el.querySelectorAll('.mk-u').length,
    face: el.style.getPropertyValue('--mk-face'),
    text: el.textContent,
  }));
  const clean = after.faces === 0 && after.units === 0 && after.face === '' && after.text === c.text;
  if (!clean) { bad += 1; console.log(`FAIL ${c.id} 收尾不干净`, JSON.stringify(after)); }
  await page.close();
  rmSync(copy);
}

await browser.close();
console.log(bad === 0 ? '\n全部通过：拆字与降级两条路径都对，收尾干净' : `\n${bad} 处不符`);
process.exit(bad === 0 ? 0 : 1);
