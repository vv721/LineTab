// 细节体验台的体检：焦点态、光标色、块状光标的位置与显隐，都要真的对得上。
// 跑法：node tmp/check-lab.mjs
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PAGE = pathToFileURL(path.join(ROOT, '细节体验.html')).href;

const RING = 'rgb(1, 105, 204)';          // --blue-500 #0169cc
const BORDER_STRONG = 'rgba(13, 13, 13, 0.15)'; // --alpha-15
const TEXT = 'rgb(13, 13, 13)';           // --gray-1000 #0d0d0d

const results = [];
const check = (name, ok, extra = '') => results.push({ name, ok, extra });

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 1500 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto(PAGE);
const caretColor = (sel) => page.$eval(sel, (el) => getComputedStyle(el).caretColor);
const borderBottom = (sel) => page.$eval(sel, (el) => getComputedStyle(el).borderBottomColor);
const borderWidth = (sel) => page.$eval(sel, (el) => getComputedStyle(el).borderBottomWidth);
const caretVisibility = () => page.$eval('.field-block-live .caret-live', (el) => getComputedStyle(el).visibility);

// 1) 三种光标的"颜色"是不是各自该有的
check('C1 光标 = 文字色', (await caretColor('#q-c1')) === TEXT, await caretColor('#q-c1'));
check('C2 光标 = 焦点环色', (await caretColor('#q-c2')) === RING, await caretColor('#q-c2'));
check('C3 原生光标已隐藏', (await caretColor('#q-c3')) === 'rgba(0, 0, 0, 0)', await caretColor('#q-c3'));

// 2) 块状光标：没聚焦时不该出现
check('块状光标未聚焦时隐藏', (await caretVisibility()) === 'hidden', await caretVisibility());

// 3) 块状光标：聚焦 + 打字后要跟着文字走
await page.click('#q-c3');
await page.type('#q-c3', 'chrome 新标签页');
const first = await page.$eval('.field-block-live .caret-live', (el) => parseFloat(el.style.left));
check('块状光标聚焦后可见', (await caretVisibility()) === 'visible', await caretVisibility());
check('块状光标有位置', Number.isFinite(first) && first > 0, String(first));
await page.type('#q-c3', ' 设计');
const second = await page.$eval('.field-block-live .caret-live', (el) => parseFloat(el.style.left));
check('打字后光标跟着右移', second > first, `${first} → ${second}`);
const caretSitsAfterText = await page.evaluate(() => {
  const input = document.getElementById('q-c3');
  const caret = document.querySelector('.field-block-live .caret-live');
  const left = parseFloat(caret.style.left);
  // 光标必须落在输入框左边界之内、且不小于"输入框起点 + 已输入文字宽度的一半"
  return left > input.offsetLeft && left < input.offsetLeft + input.clientWidth;
});
check('光标落在输入框内', caretSitsAfterText);
await page.click('.lab-title');
check('失焦后块状光标隐藏', (await caretVisibility()) === 'hidden', await caretVisibility());

// 5) 五种焦点态：线的颜色/粗细确实各不相同
// 注意：颜色是带 150ms 过渡的，读 computed style 必须等过渡走完，
// 否则会读到中间值（这里踩过一次：图标读到 rgb(120,120,120)）。
const focusAndSettle = async (sel) => {
  await page.focus(sel);
  await page.waitForTimeout(250);
};

await focusAndSettle('#q-f1');
check('F1 焦点 → 线变焦点环色', (await borderBottom('.lab-f1')) === RING, await borderBottom('.lab-f1'));
await focusAndSettle('#q-f2');
check('F2 焦点 → 线 2px', (await borderWidth('.lab-f2')) === '2px', await borderWidth('.lab-f2'));
check('F2 焦点 → 图标点亮', (await page.$eval('.lab-f2 .ico', (el) => getComputedStyle(el).color)) === 'rgb(93, 93, 93)', await page.$eval('.lab-f2 .ico', (el) => getComputedStyle(el).color));
await focusAndSettle('#q-f3');
check('F3 焦点 → 线保持原样（故意不变）', (await borderBottom('.lab-f3')) === BORDER_STRONG, await borderBottom('.lab-f3'));
await focusAndSettle('#q-f5');
check('F5 焦点 → 线变文字色（不用彩色）', (await borderBottom('.lab-f5')) === TEXT, await borderBottom('.lab-f5'));

check('无 console error / pageerror', errors.length === 0, errors.join(' | '));

await browser.close();
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.extra ? '  → ' + r.extra : ''}`);
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed} passed / ${failed} failed`);
process.exit(failed ? 1 : 0);
