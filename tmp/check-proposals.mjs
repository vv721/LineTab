// 一次性交互核查（不是回归套件的一部分）：验证 设计提案.html 的三个交互事实
//   1. 数字键 1–5 真的切方案
//   2. 在搜索框里打字，数字键不会误切方案（本轮修过的坑）
//   3. 地址栏 hash #pN 打开时就摆好状态
// 用法：node tmp/check-proposals.mjs
import { chromium } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PAGE = pathToFileURL(path.join(ROOT, '设计提案.html')).href;

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
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
ok('默认打开是 p1', (await style()) === 'p1', `data-p=${await style()}`);

await page.keyboard.press('4');
// location.hash 赋值触发的 hashchange 是异步的，必须等一拍再断言（第一版脚本就栽在这）
ok('按 4 切到 p4', await waitStyle('p4'), `data-p=${await style()}`);

await page.click('.sheet[data-p="p4"] .q');
await page.keyboard.type('5');
ok('搜索框里打 "5" 不切方案', (await style()) === 'p4', `data-p=${await style()}`);
ok('搜索框真的收到了 "5"',
  (await page.inputValue('.sheet[data-p="p4"] .q')) === '5',
  `value=${await page.inputValue('.sheet[data-p="p4"] .q')}`);

await page.reload();
await page.goto(PAGE + '#p3');
ok('hash #p3 打开即 p3', (await style()) === 'p3', `data-p=${await style()}`);
ok('无 hash 时看稿工具条可见', await page.locator('.bar').isVisible());

await page.goto(PAGE + '#p3+bare');
ok('+bare 时看稿工具条隐藏', !(await page.locator('.bar').isVisible()));

await page.screenshot({ path: path.join(ROOT, 'tmp', 'proposals', 'p3-with-bar.png') });
await browser.close();

console.log(fails.length ? `\n${fails.length} 项未通过：${fails.join(' / ')}` : '\n全部通过');
process.exit(fails.length ? 1 : 0);
