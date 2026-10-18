// 一次性冒烟：m02895 整合后（工具条撤掉、三套 UI 统一）逐状态读事实 + 截图。
// 每个 hash 必须开新 page —— 页面脚本只在 load 时读一次 hash。
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PAGE = pathToFileURL(path.join(ROOT, 'Preview.html')).href;
const SHOT_DIR = path.join(ROOT, 'tmp', 'lab-shots');

const FACTS = (hash) => {
  const stage = document.querySelector('.stage');
  const cs = (el, p) => (el ? getComputedStyle(el).getPropertyValue(p).trim() : null);
  const mark = stage.querySelector('.mark');
  const hint = stage.querySelector('.hint');
  const menu = stage.querySelector('.panel .menu:not([hidden])');
  const dlg = stage.querySelector('.dlg-back:not([hidden]) .dlg');
  const params = [...stage.querySelectorAll('.row-param')];
  const visible = (el) => !!el && getComputedStyle(el).display !== 'none';
  return {
    hash,
    style: stage.dataset.style,
    theme: stage.dataset.theme || '(light)',
    align: stage.dataset.align || '(none)',
    tag: stage.querySelector('.tag').textContent,
    markText: mark.textContent,
    mark: visible(mark) ? {
      font: cs(mark, 'font-family').split(',')[0],
      size: cs(mark, 'font-size'),
      weight: cs(mark, 'font-weight'),
      ls: cs(mark, 'letter-spacing'),
      mb: cs(mark, 'margin-bottom'),
    } : 'hidden',
    hint: visible(hint) ? { text: hint.textContent.trim(), mt: cs(hint, 'margin-top') } : 'hidden',
    params: params.length,
    paramsVisible: params.filter(visible).length,
    paramValues: params.map((row) => `${row.querySelector('.rl').textContent}=${row.querySelector('output').textContent}`),
    menuShadow: menu ? cs(menu, 'box-shadow') : '(no menu open)',
    dlgShadow: dlg ? cs(dlg, 'box-shadow') : '(no dlg open)',
    barExists: !!document.querySelector('.bar'),
    refs: !!document.querySelector('.refs'),
  };
};

const SHOTS = ['paper', 'grid', 'clay', 'clay+dark', 'paper+menu', 'grid+menu', 'clay+menu', 'paper+dlg', 'grid+dark+dlg'];

const browser = await chromium.launch({ channel: 'chrome', headless: true });
let errors = 0;
for (const key of [...new Set([...SHOTS, 'paper+dark', 'grid+dark', 'paper+panel', 'grid+panel'])]) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const bad = [];
  page.on('pageerror', (e) => bad.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') bad.push(`console: ${m.text()}`); });
  await page.goto(`${PAGE}#${key}`);
  await page.waitForTimeout(700); // 暖陶那套有 420ms 的逐色过渡（D1），读值/截图要等它走完
  const facts = await page.evaluate(FACTS, key);
  console.log(JSON.stringify(facts));
  if (bad.length) { errors += bad.length; console.log(`  !! ${key}: ${bad.join(' | ')}`); }
  if (SHOTS.includes(key)) await page.screenshot({ path: path.join(SHOT_DIR, `u-${key.replace(/\+/g, '-')}.png`) });
  await page.close();
}
await browser.close();
console.log(errors ? `控制台/页面错误 ${errors} 条` : '所有状态无 console / page 错误');
