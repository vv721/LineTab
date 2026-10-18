// 一次性探针：把「风格扩充探索01.html」（第二批）的交互与取值读一遍，
// 重点是那条硬要求 —— 挂在搜索框周围的东西不许把字段挤出中轴。
// 用法：node tmp/check-explore01.mjs（按脚本自身位置解析页面，任何工作目录都能跑）
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PAGE = pathToFileURL(path.join(ROOT, '风格扩充探索01.html')).href;
const MID = 720; // 1440 宽视口的中轴

const problems = [];
const ok = [];
const check = (name, pass, detail = '') => {
  (pass ? ok : problems).push(`${pass ? 'ok  ' : 'FAIL'} ${name}${detail ? '  → ' + detail : ''}`);
};

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = [];

async function open(hash) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${PAGE}#${hash}`);
  await page.waitForTimeout(300);
  return page;
}

/** 搜索框是否横向居中（允许多一像素的舍入） */
async function centered(page, variant) {
  const box = await page.locator(`.stage[data-variant="${variant}"] .search`).boundingBox();
  return { diff: Math.abs(box.x + box.width / 2 - MID), box };
}

// 1) 六个方案都在，默认 01
let page = await open('v1');
check('六个舞台都在', await page.locator('.stage').count() === 6, `找到 ${await page.locator('.stage').count()} 个`);
check('默认显示 01', await page.locator('.stage[data-active]').getAttribute('data-variant') === 'v1');
check('说明行跟着方案走', (await page.locator('#note').textContent()).includes('每日一句'));
check('01 的搜索框居中', (await centered(page, 'v1')).diff < 1, `偏心 ${(await centered(page, 'v1')).diff} px`);
await page.close();

// 2) 键盘与工具条
page = await open('v1');
await page.keyboard.press('3');
check('数字键 3 切到 03', await page.locator('.stage[data-active]').getAttribute('data-variant') === 'v3');
await page.locator('.bar button[data-target="v2"]').click();
check('点工具条切到 02', await page.locator('.stage[data-active]').getAttribute('data-variant') === 'v2');
check('按钮 aria-pressed 同步', await page.locator('.bar button[data-target="v2"]').getAttribute('aria-pressed') === 'true');

// 3) 输入框里打字不抢键；02 挂了个行号，但字段必须还在中轴
await page.locator('.stage[data-variant="v2"] .q').click();
await page.keyboard.type('123');
check('输入框里打字不切方案', await page.locator('.stage[data-active]').getAttribute('data-variant') === 'v2');
check('打字真的进了输入框', await page.locator('.stage[data-variant="v2"] .q').inputValue() === '123');
check('02 有行号 gutter', await page.locator('.stage[data-variant="v2"] .x-gutter').textContent() === '1');
const v2 = await centered(page, 'v2');
check('02 挂了行号后字段仍居中', v2.diff < 1, `偏心 ${v2.diff} px，字段 x=${v2.box.x} 宽=${v2.box.width}`);

// 4) 03 的状态是真的：切暗色它跟着变
const foot = page.locator('.stage[data-variant="v3"] .x-foot span').first();
check('03 左下角显示当前风格与明暗', await foot.textContent() === '暖陶 · 常亮');
await page.locator('.bar button[data-dark]').click();
check('03 状态随暗色变化', await foot.textContent() === '暖陶 · 常暗');
const darkBg = await page.locator('.stage[data-variant="v3"] .page').evaluate((el) => getComputedStyle(el).backgroundColor);
check('暗色底是暖墨 #181715', darkBg === 'rgb(24, 23, 21)', darkBg);
await page.locator('.bar button[data-dark]').click();
await page.close();

// 5) 04 幽灵补全：出现、定位、Tab 接受
page = await open('v4');
const ghost = page.locator('.stage[data-variant="v4"] .x-ghost');
check('幽灵建议出现（接着文字继续，所以前面带一个空格）', (await ghost.textContent()) === ' 上架清单', `"${await ghost.textContent()}"`);
const ghostLeft = await ghost.evaluate((el) => parseFloat(getComputedStyle(el).left));
check('幽灵建议跟在文字之后', ghostLeft > 0, `left=${ghostLeft}px`);
await page.locator('.stage[data-variant="v4"] .q').click();
await page.keyboard.press('Tab');
check('Tab 接受建议', await page.locator('.stage[data-variant="v4"] .q').inputValue() === 'chrome 扩展 上架清单');
check('接受后幽灵清空', await ghost.textContent() === '', `"${await ghost.textContent()}"`);
check('04 搜索框居中', (await centered(page, 'v4')).diff < 1);
await page.close();

// 6) 05 命令面板：默认开着、↑↓ 选、回车执行
page = await open('v5');
const menu = page.locator('.stage[data-variant="v5"] .x-menu');
check('05 菜单默认开着', await menu.isVisible());
check('05 选中第一行', await page.locator('.stage[data-variant="v5"] .x-menu-row').first().evaluate((el) => el.classList.contains('x-menu-on')));
await page.locator('.stage[data-variant="v5"] .q').click();
await page.keyboard.press('ArrowDown');
await page.keyboard.press('Enter');
check('↑↓ + 回车执行了命令（衬线被关掉）', await page.locator('.bar button[data-serif]').getAttribute('aria-pressed') === 'false');
check('执行后菜单收起', await menu.isHidden());
check('执行后菜单里的值同步', await page.locator('.stage[data-variant="v5"] .x-menu-row[data-cmd="serif"] .x-menu-value').textContent() === '关');
await page.keyboard.type('/');
check('打一个 / 又把菜单唤出来', await menu.isVisible());
await page.close();

// 7) 06 提示符与块状光标
page = await open('v6');
check('06 有 ❯ 提示符', await page.locator('.stage[data-variant="v6"] .x-prompt').textContent() === '❯');
const caret = await page.locator('.stage[data-variant="v6"] .x-caret').evaluate((el) => {
  const cs = getComputedStyle(el);
  return { name: cs.animationName, w: cs.width, h: cs.height };
});
check('06 光标是画出来的方块且带闪烁动画', caret.name === 'x-blink' && caret.w === '8px' && caret.h === '18px', JSON.stringify(caret));
const v6 = await centered(page, 'v6');
check('06 加了提示符后字段仍居中', v6.diff < 1, `偏心 ${v6.diff} px`);
await page.close();

// 8) 衬线开关 + 聚焦时的珊瑚（E 暖陶 唯一的彩色）
page = await open('v1');
check('默认字段字体是衬线栈', (await page.locator('.stage[data-variant="v1"] .q').evaluate((el) => getComputedStyle(el).fontFamily)).includes('Georgia'));
await page.locator('.bar button[data-serif]').click();
check('关掉衬线后回到 UI 栈', (await page.locator('.stage[data-variant="v1"] .q').evaluate((el) => getComputedStyle(el).fontFamily)).includes('ui-sans-serif'));
await page.locator('.stage[data-variant="v1"] .q').focus();
await page.waitForTimeout(300);
const line = await page.locator('.stage[data-variant="v1"] .search').evaluate((el) => ({
  color: getComputedStyle(el).borderBottomColor, shadow: getComputedStyle(el).boxShadow,
}));
check('聚焦时底线转珊瑚 #cc785c', line.color === 'rgb(204, 120, 92)', line.color);
check('聚焦时底线下方那一道珊瑚 15%', line.shadow.includes('rgba(204, 120, 92, 0.15)'), line.shadow);
await page.close();

check('没有 console 错误', errors.length === 0, errors.join(' | '));

await browser.close();

for (const line of ok) console.log(line);
if (problems.length) {
  console.error(`\n探针没通过，${problems.length} 条：`);
  for (const line of problems) console.error('  ' + line);
  process.exit(1);
}
console.log(`\n全部通过：${ok.length} 项`);
