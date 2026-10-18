// 探针 2：暗色标签、hash 还原、弹窗/菜单互斥、Tab 溢出
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve('D:/桌面/dsh/newtab-extension');
const PAGE = pathToFileURL(path.join(ROOT, '风格预览.html')).href;
const out = [];
const say = (...a) => { out.push(a.join(' ')); console.log(...a); };

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: 'light' });

const C = '.stage[data-style="clay"] ';
const row = n => `${C}.panel .row:nth-child(${n}) .rv`;
const OPEN = `${C}.menu:not([hidden]) .menu-opt`;
const fresh = async (hash) => { await page.goto('about:blank'); await page.goto(`${PAGE}#${hash}`); };

async function active() {
  return page.evaluate(() => {
    const el = document.activeElement;
    if (!el) return 'null';
    const inHidden = !!el.closest('[hidden]') || getComputedStyle(el).display === 'none';
    return `${el.tagName.toLowerCase()}.${el.className || '-'} "${(el.textContent || '').trim().slice(0, 8)}" hidden=${inHidden}`;
  });
}

// A. 暗色三态的标签与实际效果
for (const v of ['on', 'off']) {
  await fresh('clay');
  await page.click(`${C}.settings`);
  await page.click(row(4));
  say(`A) 暗色菜单项 =`, await page.$$eval(`${C}.panel .row:nth-child(4) .menu-opt`, els => els.map(e => `${e.dataset.value}:${e.textContent.trim()}`)));
  await page.click(`${OPEN}[data-value="${v}"]`);
  say(`A) 选 data-value=${v} → 行显示「${(await page.textContent(row(4))).trim()}」, stage data-theme=${await page.getAttribute('.stage[data-active]', 'data-theme')}, 工具条 aria-pressed=${await page.getAttribute('.bar button[data-dark]', 'aria-pressed')}`);
}

// B. hash 还原（各自全新加载）
await fresh('clay+dlg+bare');
say('B) #clay+dlg 弹窗可见 =', await page.locator('.dlg').isVisible(), '| 引擎行 aria-expanded =', await page.getAttribute(row(1), 'aria-expanded'), '| 保存 disabled =', await page.isDisabled('[data-dlg-save]'));
await fresh('clay+menu+bare');
say('B) #clay+menu 开着的菜单数 =', await page.$$eval(`${C}.menu:not([hidden])`, els => els.length), '| aria-expanded =', await page.getAttribute(row(1), 'aria-expanded'), '| 面板 hidden =', (await page.getAttribute(`${C}.panel`, 'hidden')) !== null);
await fresh('grid+bare'); // 非 clay 的 hash：面板行状态
say('B) #grid 时 clay 面板「风格」行 =', (await page.textContent(row(5))).trim(), '| 选中项 =', await page.$$eval(`${C}.panel .row:nth-child(5) .menu-opt[aria-selected="true"]`, els => els.map(e => e.dataset.value)), '| 工具条 grid aria-pressed =', await page.getAttribute('.bar button[data-target="grid"]', 'aria-pressed'));

// C. 弹窗打开时点工具条（不带 bare）
await fresh('clay');
await page.click(`${C}.settings`);
await page.click(row(1));
await page.click(`${OPEN}[data-value="custom"]`);
say('C) 弹窗打开时可见 =', await page.locator('.dlg').isVisible());
await page.click('.bar button[data-target="grid"]');
say('C) 点工具条后 弹窗可见 =', await page.locator('.dlg').isVisible(), '| clay 面板 hidden =', (await page.getAttribute(`${C}.panel`, 'hidden')) !== null, '| active 舞台 =', await page.getAttribute('.stage[data-active]', 'data-style'));
await page.click('.bar button[data-target="clay"]');
say('C) 再切回暖陶后 弹窗可见 =', await page.locator('.dlg').isVisible());

// D. 菜单开着时切工具条（菜单是否被收掉）
await fresh('clay');
await page.click(`${C}.settings`);
await page.click(row(1));
say('D) 菜单开着 =', await page.$$eval(`${C}.menu:not([hidden])`, els => els.length));
await page.click('.bar button[data-target="clay"]');
say('D) 点工具条后 菜单开着 =', await page.$$eval(`${C}.menu:not([hidden])`, els => els.length), '| aria-expanded =', await page.getAttribute(row(1), 'aria-expanded'), '| 面板 hidden =', (await page.getAttribute(`${C}.panel`, 'hidden')) !== null);

// E. 菜单开着时 Tab 出去 / 点面板别处
await fresh('clay');
await page.click(`${C}.settings`);
await page.click(row(1));
for (let i = 0; i < 3; i++) { await page.keyboard.press('Tab'); say(`E) Tab×${i + 1} active = ${await active()}`); }
say('E) Tab 之后菜单还开着 =', await page.$$eval(`${C}.menu:not([hidden])`, els => els.length));

// F. 保存自定义引擎后的显示值
await fresh('clay');
await page.click(`${C}.settings`);
await page.click(row(1));
await page.click(`${OPEN}[data-value="custom"]`);
await page.fill('[data-dlg-name]', '知乎');
await page.fill('[data-dlg-url]', 'https://www.zhihu.com/search?q=%s');
say('F) 合法输入后保存 disabled =', await page.isDisabled('[data-dlg-save]'));
await page.click('[data-dlg-save]');
say('F) 保存后 引擎行 =', (await page.textContent(row(1))).trim(), '| 弹窗可见 =', await page.locator('.dlg').isVisible());
await page.click(row(1));
say('F) 再次打开菜单：name 预填 =', await page.inputValue('[data-dlg-name]').catch(() => 'n/a'), '| 选中项 =', await page.$$eval(`${C}.panel .row:nth-child(1) .menu-opt[aria-selected="true"]`, els => els.map(e => e.dataset.value)));
await page.click(`${OPEN}[data-value="custom"]`);
say('F) 再开弹窗：name =', await page.inputValue('[data-dlg-name]'), '| url =', await page.inputValue('[data-dlg-url]'), '| 保存 disabled =', await page.isDisabled('[data-dlg-save]'), '| 焦点 =', await active());

await browser.close();
console.log('\n=== 汇总 ===\n' + out.join('\n'));
