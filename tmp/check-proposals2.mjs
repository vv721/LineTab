// 一次性交互核查（不是回归套件的一部分）：验证 设计提案二.html 的交互与无报错
//   1. 数字键 1–6 真的切方案
//   2. 在搜索框里打字，数字键不会误切方案
//   3. 地址栏 hash #sN / +bare 生效
//   4. 打开与切换过程中没有 console error / pageerror
// 用法：node tmp/check-proposals2.mjs
import { chromium } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PAGE = pathToFileURL(path.join(ROOT, '设计提案二.html')).href;

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));

const fails = [];
const ok = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
  if (!cond) fails.push(name);
};
const style = () => page.getAttribute('html', 'data-p');
const waitStyle = (want) =>
  page.waitForFunction((w) => document.documentElement.dataset.p === w, want, { timeout: 3000 })
    .then(() => true, () => false);

await page.goto(PAGE);
ok('默认打开是 s1', (await style()) === 's1', `data-p=${await style()}`);

await page.keyboard.press('3');
ok('按 3 切到 s3', await waitStyle('s3'), `data-p=${await style()}`);

await page.click('.sheet[data-p="s3"] .q');
await page.keyboard.type('6');
ok('搜索框里打 "6" 不切方案', (await style()) === 's3', `data-p=${await style()}`);
ok('搜索框真的收到了 "6"',
  (await page.inputValue('.sheet[data-p="s3"] .q')) === '6',
  `value=${await page.inputValue('.sheet[data-p="s3"] .q')}`);

await page.goto(PAGE + '#s6');
ok('hash #s6 打开即 s6', (await style()) === 's6', `data-p=${await style()}`);
ok('无 +bare 时看稿工具条可见', await page.locator('.bar').isVisible());
ok('看稿工具条有 6 个按钮', (await page.locator('.bar button').count()) === 6);

await page.goto(PAGE + '#s3+bare');
ok('+bare 时看稿工具条隐藏', !(await page.locator('.bar').isVisible()));
ok('六个方案里只有一块可见', (await page.locator('.sheet:visible').count()) === 1);

// 与渲染脚本出的 s3-bare.png 对照用（故意换名，别覆盖已验收的那张）
await page.screenshot({ path: path.join(ROOT, 'tmp', 'proposals2', 's3-bare-pw.png') });
await browser.close();

ok('没有 console error / pageerror', errors.length === 0, errors.join(' | '));

console.log(fails.length ? `\n${fails.length} 项未通过：${fails.join(' / ')}` : '\n全部通过');
process.exit(fails.length ? 1 : 0);
