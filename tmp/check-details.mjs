// 细节研究页的交互体检：数字键、hash 覆盖、+focus、+bare 是否真的按设计工作。
// 跑法：node tmp/check-details.mjs   （用本机 Chrome，不需要下载浏览器）
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PAGE = pathToFileURL(path.join(ROOT, '设计细节.html')).href;

const results = [];
const check = (name, ok, extra = '') => results.push({ name, ok, extra });

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));

// 1) 默认状态
await page.goto(PAGE);
check('默认是 a1', (await page.getAttribute('html', 'data-p')) === 'a1');
check('说明行有内容', (await page.textContent('#note')).includes('基准'));
check('看稿工具条可见', await page.isVisible('.bar'));

// 2) 数字键 0 应该切到第 10 个样张 b5
await page.keyboard.press('0');
check('按 0 → b5', (await page.getAttribute('html', 'data-p')) === 'b5');
check('说明行跟着换', (await page.textContent('#note')).includes('页脚两行'));

// 3) 在输入框里打字不能被当成切换快捷键
await page.goto(PAGE + '#a3');
await page.waitForFunction(() => document.documentElement.dataset.p === 'a3');
await page.click('#q-a3');
await page.keyboard.type('5');
check('输入框里打 5 不切样张', (await page.getAttribute('html', 'data-p')) === 'a3');
check('输入框确实收到了 5', (await page.inputValue('#q-a3')) === '5');

// 4) +focus 只作用在当前样张上
await page.goto(PAGE + '#a4+focus');
await page.waitForFunction(() => document.documentElement.dataset.p === 'a4');
check('+focus 只点亮 a4 一处', await page.evaluate(() => {
  const lit = [...document.querySelectorAll('.a-field, .b-line')].filter((el) => el.classList.contains('is-focus'));
  return lit.length === 1 && lit[0].closest('.sheet').dataset.p === 'a4';
}));
check('a4 焦点底线是 2px', await page.evaluate(() => {
  const el = document.querySelector('.sheet[data-p="a4"] .a-field');
  return getComputedStyle(el).borderBottomWidth === '2px';
}));
check('a1 未聚焦时底线是 1px', await page.evaluate(() => {
  const el = document.querySelector('.sheet[data-p="a1"] .a-field');
  return getComputedStyle(el).borderBottomWidth === '1px';
}));

// 5) +bare 与"一次只显示一块"
await page.goto(PAGE + '#b1+bare');
await page.waitForFunction(() => document.documentElement.dataset.p === 'b1');
check('+bare 隐藏工具条', !(await page.isVisible('.bar')));
check('一次只显示一块样张', await page.evaluate(() =>
  [...document.querySelectorAll('.sheet')].filter((s) => getComputedStyle(s).display !== 'none').length === 1));

check('无 console error / pageerror', errors.length === 0, errors.join(' | '));

await browser.close();
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.extra ? '  → ' + r.extra : ''}`);
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed} passed / ${failed} failed`);
process.exit(failed ? 1 : 0);
