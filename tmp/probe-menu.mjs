// 一次性探针：核实本轮菜单/弹窗改动的 focus 与状态一致性（不改任何交付物）
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve('D:/桌面/dsh/newtab-extension');
const PAGE = pathToFileURL(path.join(ROOT, '风格预览.html')).href;

const out = [];
const say = (...a) => { out.push(a.join(' ')); console.log(...a); };

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const C = '.stage[data-style="clay"] ';
const row = n => `${C}.panel .row:nth-child(${n}) .rv`;
const OPEN = `${C}.menu:not([hidden]) .menu-opt`;

async function active() {
  return page.evaluate(() => {
    const el = document.activeElement;
    if (!el) return 'null';
    const inHidden = !!el.closest('[hidden]') || getComputedStyle(el).display === 'none';
    return `${el.tagName.toLowerCase()}.${el.className || '-'} "${(el.textContent || '').trim().slice(0, 10)}" hiddenAncestor=${inHidden}`;
  });
}

async function openClay() {
  await page.goto('about:blank');
  await page.goto(`${PAGE}#clay+bare`);
  await page.click(`${C}.settings`);
}

// ---------- 1. 自定义… → 取消：焦点去哪 ----------
await openClay();
await page.click(row(1));
say('1) 引擎菜单打开后 active =', await active());
await page.click(OPEN + '[data-value="custom"]');
say('1) 点「自定义…」后弹窗可见 =', await page.locator('.dlg').isVisible());
say('1) 弹窗打开后 active =', await active());
say('1) 引擎行 aria-expanded =', await page.getAttribute(row(1), 'aria-expanded'));
await page.click('[data-dlg-cancel]');
say('1) 取消后 active =', await active());
say('1) 取消后弹窗可见 =', await page.locator('.dlg').isVisible());

// ---------- 2. 弹窗打开时 Tab 跳出 ----------
await page.click(row(1));
await page.click(OPEN + '[data-value="custom"]');
for (let i = 0; i < 4; i++) {
  await page.keyboard.press('Tab');
  say(`2) Tab×${i + 1} 后 active =`, await active());
}

// ---------- 3. 从菜单选「风格 = A 纸白」后的焦点 ----------
await openClay();
await page.click(row(5));
await page.click(OPEN + '[data-value="paper"]');
say('3) 选 A 纸白后 active 舞台 =', await page.getAttribute('.stage[data-active]', 'data-style'));
say('3) 选 A 纸白后 active =', await active());

// ---------- 4. 键盘 3 / d 与面板行状态 ----------
await openClay();
await page.click(row(5));
await page.click(OPEN + '[data-value="paper"]');
await page.keyboard.press('3');
say('4) 按 3 后 active 舞台 =', await page.getAttribute('.stage[data-active]', 'data-style'));
say('4) 面板「风格」行显示 =', (await page.textContent(row(5))).trim());
say('4) 工具条 E 暖陶 aria-pressed =', await page.getAttribute('.bar button[data-target="clay"]', 'aria-pressed'));
say('4) 菜单里 aria-selected 项 =', await page.$$eval(`${C}.panel .row:nth-child(5) .menu-opt[aria-selected="true"]`, els => els.map(e => e.dataset.value)));

await openClay();
await page.click(row(4));
await page.click(OPEN + '[data-value="off"]');
say('4b) 选「常暗」后 面板显示 =', (await page.textContent(row(4))).trim(), '| 工具条暗色 aria-pressed =', await page.getAttribute('.bar button[data-dark]', 'aria-pressed'));
await page.keyboard.press('d');
say('4b) 按 d 后 面板显示 =', (await page.textContent(row(4))).trim(), '| 工具条暗色 aria-pressed =', await page.getAttribute('.bar button[data-dark]', 'aria-pressed'), '| stage data-theme =', await page.getAttribute('.stage[data-active]', 'data-theme'));

// ---------- 5. Esc 关面板后焦点 ----------
await openClay();
await page.click(row(1));
await page.keyboard.press('Escape');
say('5) 菜单 Esc 后 active =', await active());
await page.click(`${C}.settings`);
await page.keyboard.press('Escape');
say('5) 面板 Esc 后 active =', await active(), '| 面板 hidden =', (await page.getAttribute(`${C}.panel`, 'hidden')) !== null);

// ---------- 6. +dlg / +menu hash 还原后的状态 ----------
await page.goto(`${PAGE}#clay+dlg+bare`);
say('6) #clay+dlg 弹窗可见 =', await page.locator('.dlg').isVisible(), '| 引擎行 aria-expanded =', await page.getAttribute(row(1), 'aria-expanded'));
await page.goto(`${PAGE}#clay+menu+bare`);
say('6) #clay+menu 开着的菜单数 =', await page.$$eval(`${C}.menu:not([hidden])`, els => els.length), '| 引擎行 aria-expanded =', await page.getAttribute(row(1), 'aria-expanded'), '| panel hidden =', (await page.getAttribute(`${C}.panel`, 'hidden')) !== null);

// ---------- 7. 弹窗打开时点工具条 ----------
await openClay();
await page.click(row(1));
await page.click(OPEN + '[data-value="custom"]');
await page.click('.bar button[data-target="grid"]');
say('7) 弹窗开着时点工具条后 弹窗可见 =', await page.locator('.dlg').isVisible(), '| active 舞台 =', await page.getAttribute('.stage[data-active]', 'data-style'));

// ---------- 8. 重复开合菜单是否泄漏监听（点按钮 N 次后菜单项数 / 事件数） ----------
await openClay();
for (let i = 0; i < 5; i++) { await page.click(row(1)); }
say('8) 开关 5 次后 菜单数 =', await page.$$eval(`${C}.panel .menu`, els => els.length), '| 开着的 =', await page.$$eval(`${C}.panel .menu:not([hidden])`, els => els.length), '| aria-expanded =', await page.getAttribute(row(1), 'aria-expanded'));

await browser.close();
console.log('\n=== 汇总 ===\n' + out.join('\n'));
