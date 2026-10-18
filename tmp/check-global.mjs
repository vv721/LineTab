/**
 * 一次性探针：核验 全局设计.html 的五个参数真的可用、且默认值就是设计稿的默认。
 * 五轴：引导语字号 / 与线的间隔 / 标相对线的水平对齐 / 搜索线横向偏移 / 整组竖直偏移。
 * 另验四件常量：搜索线一个零件没动、字体走规范 display 档、暗色与聚焦照旧、重置回默认。
 * 不进仓库产物、不进视觉基准图。
 * 用法：node tmp/check-global.mjs
 */
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PAGE = pathToFileURL(path.join(ROOT, '全局设计.html')).href;

let pass = 0;
let fail = 0;
const check = (label, ok, extra = '') => {
  if (ok) {
    pass += 1;
    console.log(`  ok  ${label}`);
  } else {
    fail += 1;
    console.log(`  ✗   ${label}${extra ? `  → ${extra}` : ''}`);
  }
};

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = [];

const measure = async (hash = '') => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(`${PAGE}${hash}`);
  // 量几何前先把过渡关掉：滑块与对齐都会动 transform / font-size，
  // 不等过渡走完就会读到中间值（本项目在视觉基准那边也踩过同一条）。
  await page.addStyleTag({ content: '* { transition: none !important; }' });
  await page.waitForTimeout(200);
  return page;
};

const geometry = page => page.evaluate(() => {
  const mark = document.querySelector('.g-mark').getBoundingClientRect();
  const search = document.querySelector('.search').getBoundingClientRect();
  const box = document.querySelector('.fieldbox').getBoundingClientRect();
  const style = getComputedStyle(document.querySelector('.g-mark'));
  return {
    size: style.fontSize,
    family: style.fontFamily,
    weight: style.fontWeight,
    spacing: style.letterSpacing,
    color: style.color,
    gap: Math.round(search.top - mark.bottom),
    markLeft: Math.round(mark.left),
    markRight: Math.round(mark.right),
    markCenter: Math.round((mark.left + mark.right) / 2),
    boxLeft: Math.round(box.left),
    boxRight: Math.round(box.right),
    searchLeft: Math.round(search.left),
    searchCenter: Math.round((search.left + search.right) / 2),
    groupCenter: Math.round((mark.top + search.bottom) / 2),
    hash: location.hash,
  };
});

const setParam = (page, param, value) => page.evaluate(([p, v]) => {
  const input = document.querySelector(`input[data-param="${p}"]`);
  input.value = String(v);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}, [param, value]);

// ---------- 默认值就是设计稿的默认 ----------
const page = await measure();
let g = await geometry(page);
check('只有一个舞台（只做暖陶一版）', (await page.locator('.stage').count()) === 1);
check('引导语就是 Type something', (await page.locator('.g-mark').textContent()).trim() === 'Type something');
check('默认字号 = 41px（--font-mark，用户在实验室里挑定的）', g.size === '41px', g.size);
check('默认间隔 = 55px（用户挑定的）', g.gap === 55, `${g.gap}px`);
check('默认标居中（与线同轴，差 ≤1px）', Math.abs(g.markCenter - g.searchCenter) <= 1, `标 ${g.markCenter} / 线 ${g.searchCenter}`);
check('默认搜索线居中（中心 = 720）', Math.abs(g.searchCenter - 720) <= 1, `中心 ${g.searchCenter}`);
check('默认整组上移 12%（中心 = 342）', Math.abs(g.groupCenter - 342) <= 2, `${g.groupCenter}`);
check('标与线共用同一条中轴（上下关系）', g.markCenter !== undefined && g.gap >= 0);

// 常量的字体细节
check('字体是系统衬线栈（规范 display 用衬线）', /serif/i.test(g.family) && !/sans-serif/i.test(g.family), g.family);
check('字重 400（规范：display 不加粗）', g.weight === '400', g.weight);
check('带负字距（--ls-tight）', parseFloat(g.spacing) < 0, g.spacing);
check('颜色是主文字色（暖墨 #141413），不是弱化灰', g.color === 'rgb(20, 20, 19)', g.color);

// 搜索线一个零件没动
check('放大镜图标还在（那一格没被替换）', (await page.locator('.search .ico').count()) === 1);
check('放大镜仍是搜索框的第一格', await page.evaluate(
  () => document.querySelector('.search').firstElementChild.classList.contains('ico'),
));
check('框里仍有占位文案「搜索」', (await page.locator('.q').getAttribute('placeholder')) === '搜索');
check('可访问名仍是「搜索」', (await page.locator('.q').getAttribute('aria-label')) === '搜索');
check('右侧引擎标签还在', (await page.locator('.search .tag').textContent()).trim() === 'Bing');

// 工具条上真的有这五个参数
check('有 4 个滑块 + 3 个对齐按钮（共五轴）',
  (await page.locator('.bar input[type="range"]').count()) === 4
  && (await page.locator('.bar button[data-align]').count()) === 3);
check('每个滑块都有可见标签', await page.evaluate(
  () => [...document.querySelectorAll('.bar input[type="range"]')]
    .every(i => i.closest('label')?.querySelector('span')?.textContent.trim().length > 0),
));

// ---------- 逐轴改一次，看是否真的生效 ----------
await setParam(page, 'size', 48);
await page.waitForTimeout(60);
g = await geometry(page);
check('① 字号拉到 48 → 计算字号 48px', g.size === '48px', g.size);
check('① 字号写进了 hash', g.hash.includes('size=48'), g.hash);

await setParam(page, 'gap', 8);
await page.waitForTimeout(60);
g = await geometry(page);
check('② 间隔拉到 8 → 实测间隔 8px', g.gap === 8, `${g.gap}px`);

await page.locator('.bar button[data-align="start"]').click();
await page.waitForTimeout(60);
g = await geometry(page);
check('③ 标左缘 → 标左边缘与线的左边缘对齐（差 ≤1px）', Math.abs(g.markLeft - g.boxLeft) <= 1, `标 ${g.markLeft} / 线框 ${g.boxLeft}`);

await page.locator('.bar button[data-align="end"]').click();
await page.waitForTimeout(60);
g = await geometry(page);
check('③ 标右缘 → 标右边缘与线的右边缘对齐（差 ≤1px）', Math.abs(g.markRight - g.boxRight) <= 1, `标 ${g.markRight} / 线框 ${g.boxRight}`);
await page.locator('.bar button[data-align="center"]').click();
await page.waitForTimeout(60);

await setParam(page, 'dx', -40);
await page.waitForTimeout(60);
g = await geometry(page);
check('④ 线偏移 −40 → 线中心 680', Math.abs(g.searchCenter - 680) <= 1, `中心 ${g.searchCenter}`);

await setParam(page, 'dy', -6);
await page.waitForTimeout(60);
g = await geometry(page);
check('⑤ 整组竖直 −6% → 整组中心上移 54px（450 − 54）', Math.abs(g.groupCenter - 396) <= 2, `${g.groupCenter}`);

check('说明行报出了当前五个值', await page.evaluate(
  () => /字号 48px .* 间隔 8px .* 标居中 .* 线偏移 -40px .* 整组竖直 -6%/.test(document.getElementById('note').textContent),
));

// ---------- 重置回默认 ----------
await page.locator('.bar button[data-reset]').click();
await page.waitForTimeout(60);
g = await geometry(page);
check('重置：字号 / 间隔 / 偏移 / 竖直回到默认', g.size === '41px' && g.gap === 55 && Math.abs(g.searchCenter - 720) <= 1 && Math.abs(g.groupCenter - 342) <= 2,
  JSON.stringify({ size: g.size, gap: g.gap, center: g.searchCenter, group: g.groupCenter }));
check('重置：对齐回到居中', Math.abs(g.markCenter - g.searchCenter) <= 1);
check('重置：hash 也回默认', g.hash.includes('size=41') && g.hash.includes('gap=55') && g.hash.includes('dy=-12') && g.hash.includes('align=center'), g.hash);

// ---------- 暗色与聚焦照旧 ----------
await page.locator('.bar button[data-dark]').click();
await page.waitForTimeout(300);
const darkStyle = await page.evaluate(() => ({
  bg: getComputedStyle(document.querySelector('.page')).backgroundColor,
  mark: getComputedStyle(document.querySelector('.g-mark')).color,
}));
check('暗色底 = 暖墨 #181715', darkStyle.bg === 'rgb(24, 23, 21)', darkStyle.bg);
check('暗色下标 = 奶油白 #faf9f5（不是灰）', darkStyle.mark === 'rgb(250, 249, 245)', darkStyle.mark);
await page.locator('.bar button[data-dark]').click();
await page.waitForTimeout(300);

await page.locator('.q').click();
await page.waitForTimeout(300);
const focused = await page.evaluate(() => {
  const s = getComputedStyle(document.querySelector('.search'));
  return { border: s.borderBottomColor, shadow: s.boxShadow };
});
check('聚焦时底线转珊瑚', focused.border === 'rgb(204, 120, 92)', focused.border);
check('聚焦时底线下方一道 3px 珊瑚 15%', /rgba\(204, 120, 92, 0\.15\) 0px 3px/.test(focused.shadow), focused.shadow);

await page.locator('.settings').click();
await page.waitForTimeout(60);
check('面板仍是 5 行', (await page.locator('.panel .row').count()) === 5);
check('「搜索框左侧」这行仍是「放大镜」', (await page.locator('.panel .row').nth(1).locator('.rv span').first().textContent()).trim() === '放大镜');
await page.close();

// ---------- hash 能把状态原样摆回来 ----------
const second = await measure('#size=40&gap=20&align=end&dx=40&dy=4&dark=1&panel=1');
const g2 = await geometry(second);
check('hash 还原：字号 40 / 间隔 20 / 标右缘 / 线偏移 +40 / 整组 +4%',
  g2.size === '40px' && g2.gap === 20 && Math.abs(g2.markRight - g2.boxRight) <= 1
  && Math.abs(g2.searchCenter - 760) <= 1 && Math.abs(g2.groupCenter - 486) <= 2,
  JSON.stringify({ size: g2.size, gap: g2.gap, right: g2.markRight, boxRight: g2.boxRight, center: g2.searchCenter, group: g2.groupCenter }));
check('hash 还原：暗色 + 面板同时生效', await second.evaluate(() => (
  document.querySelector('.stage').hasAttribute('data-theme')
  && !document.querySelector('.panel').hasAttribute('hidden')
)));
await second.close();

check('没有 console / page 错误', errors.length === 0, errors.join(' | '));

await browser.close();
console.log(`\n${fail === 0 ? '全部通过' : '有失败项'}：${pass + fail} 项（通过 ${pass}，失败 ${fail}）`);
process.exit(fail === 0 ? 0 : 1);
