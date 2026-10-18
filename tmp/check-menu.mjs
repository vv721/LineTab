// 一次性探针：验 m05424 / m00768 / m01021 这几轮改动在 Preview.html 里真的对 ——
//   ① 暖陶面板里的选项行不再是"看着像下拉菜单、逻辑却是点击轮换"，而是真二级下拉菜单；
//   ② 「默认搜索引擎」的最后一项固定是「自定义…」，开的是新弹窗；
//   ③ 弹窗只做前端（保存定义"自定义"这个引擎：进 engineOrder、勾上、立刻生效，不落盘）；
//   ④ 只动了暖陶这一套：纸白 / 点阵 面板里没有菜单，提示行也还在；
//   ⑤ 用户 m00768：亮暗切换走 D1 逐色渐变（只在暖陶）、「引导语对齐」由菜单改成滑块；
//   ⑥ 用户 m01021：引擎改成复选（✓ 还是那个 ✓）、点搜索线右侧的引擎名轮切、
//      菜单里能拖动排序（带轻量指引）、输入框里的「搜索」占位文案删掉。
// 跑法：node tmp/check-menu.mjs（工作目录 newtab-extension）。用完即删。
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PAGE = pathToFileURL(path.join(ROOT, 'Preview.html')).href;
const LAB = pathToFileURL(path.join(ROOT, '全局设计.html')).href;

let passed = 0;
const failures = [];
const check = (name, ok, detail = '') => {
  if (ok) {
    passed += 1;
    console.log(`  ok  ${name}`);
  } else {
    failures.push(name);
    console.log(`  \u2717   ${name}${detail ? `   \u2192 ${detail}` : ''}`);
  }
};

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = [];

const open = async (hash = 'clay+panel', url = PAGE) => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(`${url}#${hash}`);
  // 菜单/弹窗都带过渡色，不等它走完会读到中间值
  await page.addStyleTag({ content: '* { transition: none !important; }' });
  await page.waitForTimeout(250);
  return page;
};

const CLAY = '.stage';
const row = label => `${CLAY} .panel .row:has(.rl:text-is("${label}"))`;
const rv = label => `${row(label)} .rv`;
const menu = label => `${row(label)} .menu`;
const opt = (label, value) => `${menu(label)} .menu-opt[data-value="${value}"]`;
// 「自定义…」是动作不是选项：自定义引擎定义出来之后它也带 data-value="custom"，
// 所以认它得认 data-action（用户 m01021 把引擎改成"可添加"的之后，这条区别才成立）
const actionOpt = (label, value) => `${menu(label)} .menu-opt[data-action="${value}"]`;

const pick = async (page, label, value) => {
  await page.locator(rv(label)).click();
  await page.locator(opt(label, value)).click();
  await page.waitForTimeout(60);
};

// 面板被"点别处"这类逻辑收掉之后，要用就先打开
const openPanel = async () => {
  if (await page.locator(`${CLAY} .panel`).isHidden()) {
    await page.locator(`${CLAY} .settings`).click();
    await page.waitForTimeout(60);
  }
};

// 所有行的结构快照：哪几行升级成了菜单、每一行的当前值、菜单是开是关。
// 整合之后只有一幅舞台，读到的就是"当前这套风格"下的状态（切风格靠 switchStyle）。
const menuFacts = page => page.evaluate(() => {
  const stage = document.querySelector('.stage');
  return [...stage.querySelectorAll('.panel .row')].map(r => {
    const btn = r.querySelector('.rv');
    const m = r.querySelector('.menu');
    return {
      label: r.querySelector('.rl')?.textContent.trim() ?? null,
      hasMenu: !!m,
      value: btn?.querySelector('span')?.textContent.trim() ?? null,
      popup: btn?.getAttribute('aria-haspopup') ?? null,
      expanded: btn?.getAttribute('aria-expanded') ?? null,
      open: m ? !m.hidden : null,
      opts: m ? [...m.querySelectorAll('.menu-opt')].map(o => [o.dataset.value, o.textContent.trim()]) : [],
      selected: m ? [...m.querySelectorAll('.menu-opt')].filter(o => o.getAttribute('aria-selected') === 'true').map(o => o.dataset.value) : [],
      // 分隔线现在画在最后一项自己的上边框上（listbox 里只允许 option 子元素）
      lastHairline: m && m.lastElementChild
        ? getComputedStyle(m.lastElementChild).borderTopWidth !== '0px'
        : null,
    };
  });
});

const openCount = page => page.evaluate(
  () => document.querySelectorAll('.stage .menu:not([hidden])').length,
);

// ---------- A. 三套风格的面板都被升级成真菜单（整合后组件共用，外观只差令牌） ----------
let page = await open('clay+panel');
const clayRows = await menuFacts(page);

const menuRows = clayRows.filter(r => r.hasMenu);
// 整合之后只有**一幅**舞台：切风格 = 换它那一个 data-style。
// 换风格的通路也只剩设置面板里的「风格」那一行（用户 m02895 撤掉了看稿工具条）。
// 这里用页面内的程序化 click：面板/菜单的显隐不影响它，也不会像真点那样把面板收掉。
const switchStyle = style => page.evaluate(async s => {
  const stage = document.querySelector('.stage');
  const row = [...stage.querySelectorAll('.panel .row')]
    .find(r => r.querySelector('.rl').textContent === '风格');
  if (row.querySelector('.menu').hidden) {
    row.querySelector('.rv').click();
    await new Promise(r => setTimeout(r, 40));
  }
  row.querySelector(`.menu-opt[data-value="${s}"]`).click();
  await new Promise(r => setTimeout(r, 80));
}, style);
await switchStyle('paper');
const paperRows = await menuFacts(page);
await switchStyle('grid');
const gridRows = await menuFacts(page);
await switchStyle('clay');

// 每一行初始选中的那一档（= 真页面 newtab.js 里的默认：放大镜 / 深灰细线 / 跟随系统 / 暖陶）
// 引擎那一行不在里面 —— 它是复选，默认两项都亮着（用户 m01021，见 B 段）
const EXPECT_DEFAULT = {
  搜索框左侧: 'icon', 焦点反馈: 'line', 暗色: 'auto', 风格: 'clay',
};
check('暖陶面板里 5 行升级成二级下拉菜单（都是真设置项；「引导语对齐」改成滑块了，见 F 段）',
  menuRows.length === 5 && clayRows.length === 10, `${menuRows.length} / 共 ${clayRows.length} 行`);
check('这 5 行就是 默认搜索引擎 / 搜索框左侧 / 焦点反馈 / 暗色 / 风格',
  menuRows.map(r => r.label).join(' | ')
    === '默认搜索引擎 | 搜索框左侧 | 焦点反馈 | 暗色 | 风格',
  menuRows.map(r => r.label).join(' | '));
check('纸白面板里同样是这 5 行真菜单（整合后组件共用，纸白不再只有"看着像下拉"的轮换按钮）',
  paperRows.filter(r => r.hasMenu).length === 5 && paperRows.length === 10,
  `${paperRows.filter(r => r.hasMenu).length} 个 / 共 ${paperRows.length} 行`);
check('点阵面板里同样是这 5 行真菜单',
  gridRows.filter(r => r.hasMenu).length === 5 && gridRows.length === 10,
  `${gridRows.filter(r => r.hasMenu).length} 个 / 共 ${gridRows.length} 行`);
check('三套风格里那 5 行的菜单选项表逐字相同（选项表不跟风格走，只跟设置项走）',
  JSON.stringify(paperRows.map(r => r.opts)) === JSON.stringify(clayRows.map(r => r.opts))
  && JSON.stringify(gridRows.map(r => r.opts)) === JSON.stringify(clayRows.map(r => r.opts)),
  'paper/grid vs clay');
check('每个菜单行都标了 aria-haspopup="listbox"', menuRows.every(r => r.popup === 'listbox'),
  menuRows.map(r => r.popup).join(' / '));
check('初始时菜单全是收起的、aria-expanded 全是 false',
  menuRows.every(r => r.open === false && r.expanded === 'false'),
  JSON.stringify(menuRows.map(r => [r.open, r.expanded])));
check('暖陶那 5 行的初始值跟真页面一致（Bing / 放大镜 / 深灰细线 / 跟随系统 / 暖陶）',
  menuRows.map(r => r.value).join(' | ') === 'Bing | 放大镜 | 深灰细线 | 跟随系统 | 暖陶',
  menuRows.map(r => r.value).join(' | '));
check('引擎以外那 4 行各只有当前那一项 aria-selected=true，且初始就是真页面里的那一档',
  menuRows.filter(r => r.label !== '默认搜索引擎')
    .every(r => r.selected.length === 1 && r.selected[0] === EXPECT_DEFAULT[r.label]),
  JSON.stringify(menuRows.filter(r => r.label !== '默认搜索引擎').map(r => [r.label, r.selected[0]])));

check('同一份组件在三套里的外观各自成立：菜单投影 / 引擎名大小写跟着皮肤走（内容三套一致）',
  await page.evaluate(async () => {
    // 必须走真正的切换通路（面板「风格」行里的菜单 → show()），
    // 直接改 data-style 只动得了 CSS：大小写是脚本写上去的，读不到。
    const stage = document.querySelector('.stage');
    const menu = stage.querySelector('.menu');
    const tag = stage.querySelector('.search .tag');
    const q = stage.querySelector('.q');
    const styleRow = [...stage.querySelectorAll('.panel .row')]
      .find(r => r.querySelector('.rl').textContent === '风格');
    const out = {};
    for (const s of ['paper', 'grid', 'clay']) {
      if (styleRow.querySelector('.menu').hidden) {
        styleRow.querySelector('.rv').click();
        await new Promise(r => setTimeout(r, 40));
      }
      styleRow.querySelector(`.menu-opt[data-value="${s}"]`).click();
      await new Promise(r => setTimeout(r, 60));
      out[s] = [getComputedStyle(menu).boxShadow.replace(/\s+/g, ' '), tag.textContent,
        getComputedStyle(tag).textTransform, (q.hasAttribute('placeholder') ? q.getAttribute('placeholder') : '无占位')].join(' | ');
    }
    // 把「风格」菜单收回去，后面的段落按"面板开着、菜单全关"的初始状态走
    styleRow.querySelector('.rv').click();
    await new Promise(r => setTimeout(r, 40));
    return JSON.stringify(out);
  }).then(seen => {
    const o = JSON.parse(seen);
    return o.paper.includes('rgba(0, 0, 0, 0.12) 0px 8px 24px') && o.paper.includes('Bing | uppercase') && o.paper.includes('无占位')
      && o.grid.includes('rgba(0, 0, 0, 0.12) 0px 8px 24px') && o.grid.includes('Bing | uppercase') && o.grid.includes('无占位')
      && o.clay.includes('rgba(20, 20, 19, 0.14) 0px 8px 24px')
      && o.clay.includes('Bing | none') && o.clay.includes('无占位');
  }) === true);

// ---------- B. 「默认搜索引擎」：复选 + 固定收尾的「自定义…」（用户 m01021） ----------
const engine = menuRows.find(r => r.label === '默认搜索引擎');
check('引擎菜单 = Bing / Google / 自定义… 三项，顺序与真页面的 ENGINES 对齐',
  engine.opts.map(o => o[0]).join(',') === 'bing,google,custom'
  && engine.opts.map(o => o[1]).join(' | ') === 'Bing | Google | 自定义…',
  engine.opts.map(o => o[1]).join(' | '));
check('单选改复选：默认 Bing 与 Google 两项都是 ✓（UI 一点没动，还是那个克制的 ✓）',
  engine.selected.slice().sort().join() === 'bing,google', engine.selected.join());
check('「自定义…」不参与复选（它是动作：data-action，永远不亮 ✓）',
  engine.selected.includes('custom') === false, engine.selected.join());
check('「自定义…」固定是最后一项', engine.opts.at(-1)[0] === 'custom' && engine.opts.at(-1)[1] === '自定义…',
  JSON.stringify(engine.opts.at(-1)));
check('「自定义…」被一条发丝线隔开（线画在选项自己的上边框，不插没角色的空 div）',
  engine.lastHairline === true, String(engine.lastHairline));
check('其余 4 个菜单没有那条分隔线（只有引擎菜单有）',
  menuRows.filter(r => r.label !== '默认搜索引擎').every(r => r.lastHairline === false),
  menuRows.map(r => `${r.label}:${r.lastHairline}`).join(' | '));
check('listbox 里全是 option 子元素（读屏不会多念一个空节点）',
  await page.evaluate(() => [...document.querySelectorAll('.stage .menu')]
    .every(m => [...m.children].every(c => c.getAttribute('role') === 'option'))) === true);
check('引擎那个 listbox 标了 aria-multiselectable（复选得让读屏知道）',
  await page.evaluate(() => document.querySelector('.stage .menu')
    .getAttribute('aria-multiselectable')) === 'true');
check('其余 4 个菜单仍是单选语义（没有 aria-multiselectable）',
  await page.evaluate(() => [...document.querySelectorAll('.stage .menu')]
    .slice(1).every(m => !m.hasAttribute('aria-multiselectable'))) === true);

// ---------- C. 点开 / 只有一个开 / 选中即收起 ----------
await page.locator(rv('默认搜索引擎')).click();
await page.waitForTimeout(60);
check('点行上的按钮 → 菜单展开、aria-expanded=true', await openCount(page) === 1
  && await page.locator(rv('默认搜索引擎')).getAttribute('aria-expanded') === 'true');
check('展开的菜单是可见的（hidden 撤掉后才参与布局）',
  await page.locator(menu('默认搜索引擎')).isVisible() === true);
check('展开时焦点落到当前那一项（Bing）上',
  await page.evaluate(() => document.activeElement?.dataset?.value ?? null) === 'bing');
await page.keyboard.press('ArrowDown');
check('↑↓ 认方向键：从当前项按 ↓ 落到下一项（Bing → Google）',
  await page.evaluate(() => document.activeElement?.dataset?.value ?? null) === 'google');
await page.keyboard.press('End');
check('End 直接跳到最后一档（自定义…）',
  await page.evaluate(() => document.activeElement?.dataset?.value ?? null) === 'custom');
await page.keyboard.press('ArrowDown');
check('在最后一档按 ↓ 绕回第一档（循环，不卡住）',
  await page.evaluate(() => document.activeElement?.dataset?.value ?? null) === 'bing');
await page.keyboard.press('ArrowUp');
check('在第一档按 ↑ 绕到最后一档',
  await page.evaluate(() => document.activeElement?.dataset?.value ?? null) === 'custom');
await page.keyboard.press('Home');
check('Home 回到第一档',
  await page.evaluate(() => document.activeElement?.dataset?.value ?? null) === 'bing');

// 开着菜单时点面板里别的地方（菜单之外）：菜单要收 —— 点哪都一样，不用先 Esc
await page.keyboard.press('Escape');
await page.waitForTimeout(60);
await page.locator(rv('暗色')).click();
await page.waitForTimeout(60);
await page.locator(`${row('暗色')} .rl`).click();
await page.waitForTimeout(60);
check('开着菜单时点面板里菜单以外的地方（比如行标题）→ 菜单收起来', await openCount(page) === 0);

await page.locator(rv('暗色')).click();
await page.waitForTimeout(60);
await page.locator(rv('默认搜索引擎')).click();
await page.waitForTimeout(60);
check('直接点另一行的按钮 → 前一个菜单自动收，同时只有一个开着',
  await openCount(page) === 1
  && await page.locator(menu('默认搜索引擎')).isVisible() === true
  && await page.locator(menu('暗色')).isHidden() === true,
  `${await openCount(page)} 个开着`);

// 反过来：先把引擎菜单收掉（下拉菜单会盖住下面几行 —— 这是它本来就该有的样子），
// 再从下面那一行往上点。上面那行没被盖住，所以可以直接点过去。
await page.keyboard.press('Escape');
await page.waitForTimeout(60);
await page.locator(rv('暗色')).click();
await page.waitForTimeout(60);
check('反过来点也一样（暗色开、引擎收）', await openCount(page) === 1
  && await page.locator(menu('暗色')).isVisible() === true
  && await page.locator(menu('默认搜索引擎')).isHidden() === true);

await page.locator(rv('默认搜索引擎')).click();
await page.waitForTimeout(60);
check('从下面那一行再点回上面那一行 → 暗色的菜单自动收', await openCount(page) === 1
  && await page.locator(menu('默认搜索引擎')).isVisible() === true
  && await page.locator(menu('暗色')).isHidden() === true);

await page.keyboard.press('Escape');
await page.waitForTimeout(60);
await page.locator(rv('暗色')).click();
await page.waitForTimeout(60);
await page.locator(opt('暗色', 'auto')).click();
await page.waitForTimeout(60);
check('点一项 → 菜单收起、焦点回到那一行的按钮', await openCount(page) === 0
  && await page.evaluate(() => document.activeElement?.classList.contains('rv') ?? false) === true);

// 引擎这一行是复选（用户 m01021）：点一下只翻 ✓，菜单不关、行里的值不动
await page.locator(rv('默认搜索引擎')).click();
await page.waitForTimeout(60);
await page.locator(opt('默认搜索引擎', 'google')).click();
await page.waitForTimeout(60);
let rows = await menuFacts(page);
let eng = rows.find(r => r.label === '默认搜索引擎');
check('点 Google 的 ✓ → 取消复选，菜单不关（连着勾几个才顺手）',
  eng.selected.join() === 'bing' && eng.open === true, `${eng.selected.join()} / open=${eng.open}`);
check('复选不改"当前引擎"：行里的值与搜索线右侧的名字都还是 Bing',
  eng.value === 'Bing' && (await page.locator(`${CLAY} .search .tag`).textContent()).trim() === 'Bing',
  `${eng.value} / ${(await page.locator(`${CLAY} .search .tag`).textContent()).trim()}`);
await page.locator(opt('默认搜索引擎', 'google')).click();
await page.waitForTimeout(60);
rows = await menuFacts(page);
eng = rows.find(r => r.label === '默认搜索引擎');
check('再点一下又勾回来（两个 ✓ 同时在）', eng.selected.slice().sort().join() === 'bing,google', eng.selected.join());

// 取消掉当前生效的那个：指针要落到剩下第一个复选着的引擎上，不能悬空
await page.locator(opt('默认搜索引擎', 'bing')).click();
await page.waitForTimeout(60);
rows = await menuFacts(page);
eng = rows.find(r => r.label === '默认搜索引擎');
check('取消当前引擎（Bing）的 ✓ → 当前引擎落到剩下的 Google（行里与右侧名字都跟着走）',
  eng.selected.join() === 'google' && eng.value === 'Google'
  && (await page.locator(`${CLAY} .search .tag`).textContent()).trim() === 'Google',
  `${eng.selected.join()} / ${eng.value}`);
await page.locator(opt('默认搜索引擎', 'google')).click();
await page.waitForTimeout(60);
rows = await menuFacts(page);
eng = rows.find(r => r.label === '默认搜索引擎');
check('最后一个不许取消（全不勾就没有引擎可轮切了），值也没被动',
  eng.selected.join() === 'google' && eng.value === 'Google', `${eng.selected.join()} / ${eng.value}`);
// 勾上一个引擎不该把"当前引擎"抢过去（只有取消当前那个才会让指针走）
await page.locator(opt('默认搜索引擎', 'bing')).click();
await page.waitForTimeout(60);
rows = await menuFacts(page);
eng = rows.find(r => r.label === '默认搜索引擎');
check('勾上一个引擎不会抢走"当前引擎"（还是 Google）',
  eng.selected.slice().sort().join() === 'bing,google' && eng.value === 'Google',
  `${eng.selected.join()} / ${eng.value}`);

// 再取消一次"当前生效"的那个：指针这次落回 Bing，收尾时状态就是默认的 Bing
await page.locator(opt('默认搜索引擎', 'google')).click();
await page.waitForTimeout(60);
rows = await menuFacts(page);
eng = rows.find(r => r.label === '默认搜索引擎');
check('取消当前引擎（Google）→ 指针落回 Bing（不会停在一个没勾的引擎上）',
  eng.selected.join() === 'bing' && eng.value === 'Bing', `${eng.selected.join()} / ${eng.value}`);
await page.locator(opt('默认搜索引擎', 'google')).click();   // 勾回来，后面几段按两个引擎走
await page.waitForTimeout(60);
await page.keyboard.press('Escape');
await page.waitForTimeout(60);

/* ---------- C2. 点搜索线右侧的引擎名 = 轮切（用户 m01021 第 3 条） ---------- */
const tag = `${CLAY} .search .tag`;
check('引擎名是个能操作的元素（role=button），不是纯文字',
  await page.locator(tag).getAttribute('role') === 'button'
  && await page.locator(tag).getAttribute('tabindex') === '0');
await page.locator(tag).click();
await page.waitForTimeout(60);
rows = await menuFacts(page);
check('点它 → 轮切到下一个复选着的引擎（Bing → Google），面板那一行同步',
  (await page.locator(tag).textContent()).trim() === 'Google'
  && rows.find(r => r.label === '默认搜索引擎').value === 'Google',
  `${(await page.locator(tag).textContent()).trim()} / ${rows.find(r => r.label === '默认搜索引擎').value}`);
check('可访问名带着当前引擎', ((await page.locator(tag).getAttribute('aria-label')) || '').includes('Google'),
  String(await page.locator(tag).getAttribute('aria-label')));
check('点引擎名顺手把设置面板收掉（点面板之外的既有逻辑），面板不是被顶开的',
  await page.locator(`${CLAY} .panel`).isHidden() === true);
await page.locator(tag).click();
await page.waitForTimeout(60);
check('再点一下绕回 Bing（只在"已复选"的引擎里轮转）',
  (await page.locator(tag).textContent()).trim() === 'Bing');
await page.locator(tag).focus();
await page.keyboard.press('Enter');
await page.waitForTimeout(60);
check('键盘 Enter 也能轮切（role=button 就得认键盘）',
  (await page.locator(tag).textContent()).trim() === 'Google');
await page.locator(tag).click();   // 收回 Bing，后面几段接着用
await page.waitForTimeout(60);
await openPanel();

/* ---------- C3. 轮切与"光标在不在搜索框里"完全独立（用户 m01391 的三条） ----------
   ① 点引擎名不该让搜索线进入焦点态；② 点引擎名不该把光标从输入框里赶走；
   ③ 连点不该拖出一片蓝色选区。 */
const focusState = () => page.evaluate(sel => {
  const search = document.querySelector(`${sel} .search`);
  const active = document.activeElement;
  return {
    tag: active === search.querySelector('.tag'),
    inSearch: search.contains(active),
    focusWithin: search.matches(':focus-within'),
    activeClass: active === document.body ? 'body' : (active?.className || active?.tagName),
  };
}, CLAY);
const selectedText = () => page.evaluate(() => String(window.getSelection() ?? ''));

await page.evaluate(() => { document.activeElement?.blur?.(); window.getSelection()?.removeAllRanges(); });
await page.locator(tag).click();
await page.waitForTimeout(60);
const afterIdleClick = await focusState();
check('① 谁都没聚焦时点引擎名 → 焦点没被搬到引擎名上、搜索线也没点亮焦点态',
  afterIdleClick.tag === false && afterIdleClick.focusWithin === false
  && afterIdleClick.inSearch === false, JSON.stringify(afterIdleClick));

await page.locator(`${CLAY} .search .q`).click();
await page.waitForTimeout(40);
const beforeTag = await focusState();
const tagBefore = (await page.locator(tag).textContent()).trim();
await page.locator(tag).click();
await page.waitForTimeout(60);
const afterTag = await focusState();
check('② 光标本来在输入框里时点引擎名 → 光标还在输入框里（没被赶走）',
  beforeTag.inSearch === true && beforeTag.tag === false && afterTag.inSearch === true,
  `${JSON.stringify(beforeTag)} → ${JSON.stringify(afterTag)}`);
check('② 撤掉焦点态也是假的：输入框仍聚焦时搜索线照旧亮着（那是真聚焦，不是点出来的）',
  afterTag.focusWithin === true && afterTag.tag === false, JSON.stringify(afterTag));
check('② 光标没被动，轮切本身照旧发生（Google → Bing）',
  tagBefore === 'Google' && (await page.locator(tag).textContent()).trim() === 'Bing',
  `${tagBefore} → ${(await page.locator(tag).textContent()).trim()}`);

await page.locator(tag).dblclick();   // 连点两下 = 浏览器原本会选中一个词
await page.waitForTimeout(60);
check('③ 连点两下 → 没有蓝色选区（选中文字为空）', (await selectedText()) === '',
  JSON.stringify(await selectedText()));
const afterDbl = await focusState();
check('③ 连点之后焦点与焦点态也还是老样子（只要输入框原来聚焦着）',
  afterDbl.inSearch === true && afterDbl.tag === false && afterDbl.focusWithin === true,
  JSON.stringify(afterDbl));

// 把当前引擎收回 Bing（后面几段按"默认 Bing"写；带个上限，轮切真坏了也不会把探针挂死）
await page.evaluate(() => document.activeElement?.blur?.());
for (let i = 0; i < 4 && (await page.locator(tag).textContent()).trim() !== 'Bing'; i += 1) {
  await page.locator(tag).click();
  await page.waitForTimeout(40);
}
check('C3 收尾：当前引擎回到 Bing（后面的段落按默认值写）',
  (await page.locator(tag).textContent()).trim() === 'Bing');
await openPanel();

// ---------- D. 选完之后看稿页自己的机制真的跟着走 ----------
await pick(page, '搜索框左侧', 'prompt');
check('搜索框左侧选「提示符 >」→ 暖陶舞台 data-lead=prompt',
  await page.locator(CLAY).getAttribute('data-lead') === 'prompt');
await pick(page, '搜索框左侧', 'icon');
check('选回「放大镜」→ data-lead=icon', await page.locator(CLAY).getAttribute('data-lead') === 'icon');

await pick(page, '焦点反馈', 'hold');
check('焦点反馈选「不变」→ data-focus=hold', await page.locator(CLAY).getAttribute('data-focus') === 'hold');
await pick(page, '焦点反馈', 'line');
check('选回「深灰细线」→ data-focus=line', await page.locator(CLAY).getAttribute('data-focus') === 'line');

await pick(page, '暗色', 'on');
check('暗色选「常暗」→ 暖陶舞台进入暗色（data-theme=dark），行里也写「常暗」',
  await page.locator(CLAY).getAttribute('data-theme') === 'dark'
  && (await page.locator(`${rv('暗色')} > span`).textContent()).trim() === '常暗',
  `${await page.locator(CLAY).getAttribute('data-theme')} / ${(await page.locator(`${rv('暗色')} > span`).textContent()).trim()}`);
await pick(page, '暗色', 'off');
check('暗色选「常亮」→ 去掉 data-theme，行里写「常亮」（on = 常暗、off = 常亮，与真页面 DARK_MODES 一致）',
  await page.locator(CLAY).getAttribute('data-theme') === null
  && (await page.locator(`${rv('暗色')} > span`).textContent()).trim() === '常亮',
  `${await page.locator(CLAY).getAttribute('data-theme')} / ${(await page.locator(`${rv('暗色')} > span`).textContent()).trim()}`);
await pick(page, '暗色', 'auto');
check('暗色选回「跟随系统」→ 这一档不会被 applyDark 改写成常暗/常亮（本机偏好为浅色，所以舞台不暗）',
  (await page.locator(`${rv('暗色')} > span`).textContent()).trim() === '跟随系统'
  && await page.locator(CLAY).getAttribute('data-theme') === null);

// 面板里切暗色：那一行的值也得跟着写，不能页面暗了、行里还写「跟随系统」
await pick(page, '暗色', 'on');
check('在面板里选「常暗」→ 舞台暗下来，且「暗色」那一行写成「常暗」',
  await page.locator(CLAY).getAttribute('data-theme') === 'dark'
  && (await page.locator(`${rv('暗色')} > span`).textContent()).trim() === '常暗');
await pick(page, '暗色', 'off');
check('再选「常亮」→ 舞台不暗，行里写「常亮」',
  await page.locator(CLAY).getAttribute('data-theme') === null
  && (await page.locator(`${rv('暗色')} > span`).textContent()).trim() === '常亮');
await pick(page, '暗色', 'auto');

/* ---------- F. 「引导语对齐」是滑块，不是菜单（用户 m00768：版式控件统一成滑块） ---------- */
await openPanel();
const ALIGN_ROW = `${CLAY} .panel .row:has(.rl:text-is("引导语对齐"))`;
const alignInput = `${ALIGN_ROW} input[type="range"]`;
const alignOut = `${ALIGN_ROW} output`;

check('「引导语对齐」那一行没有菜单、也没有 .rv 按钮，装的是滑块',
  await page.locator(`${ALIGN_ROW} .menu`).count() === 0
  && await page.locator(`${ALIGN_ROW} .rv`).count() === 0
  && await page.locator(alignInput).count() === 1);
check('滑块就是 3 档（min=0 / max=2 / step=1），初始停在正中间那一档',
  await page.locator(alignInput).getAttribute('min') === '0'
  && await page.locator(alignInput).getAttribute('max') === '2'
  && await page.locator(alignInput).getAttribute('step') === '1'
  && await page.locator(alignInput).inputValue() === '1',
  await page.locator(alignInput).inputValue());
check('和上面几行参数滑块是同一套外衣（行里是 .rs，滑轨宽度也一致）',
  await page.locator(`${ALIGN_ROW} .rs`).count() === 1
  && await page.evaluate(() => {
    const w = sel => document.querySelector(sel).getBoundingClientRect().width;
    return Math.abs(w('#mark-size') - w('#mark-align')) < 1;
  }) === true);
check('默认档读出「居中」、默认值不落行内样式（data-align 不挂）',
  (await page.locator(alignOut).textContent()).trim() === '居中'
  && await page.locator(CLAY).getAttribute('data-align') === null);

// 真的去点滑轨（不是直接改 value）：档位按空间排，往右拖就是往右靠
const alignBox = await page.locator(alignInput).boundingBox();
const clickAt = async ratio => {
  await page.locator(alignInput).click({
    position: { x: Math.max(1, Math.min(alignBox.width - 1, alignBox.width * ratio)), y: alignBox.height / 2 },
  });
  await page.waitForTimeout(60);
};
await clickAt(1);
check('点滑轨最右 → 读出「右缘」、舞台 data-align=end',
  (await page.locator(alignOut).textContent()).trim() === '右缘'
  && await page.locator(CLAY).getAttribute('data-align') === 'end',
  `${(await page.locator(alignOut).textContent()).trim()} / ${await page.locator(CLAY).getAttribute('data-align')}`);
await clickAt(0);
check('点滑轨最左 → 读出「左缘」、舞台 data-align=start',
  (await page.locator(alignOut).textContent()).trim() === '左缘'
  && await page.locator(CLAY).getAttribute('data-align') === 'start');
await clickAt(0.5);
check('点回正中 → 读出「居中」、data-align 清掉（默认值不落行内）',
  (await page.locator(alignOut).textContent()).trim() === '居中'
  && await page.locator(CLAY).getAttribute('data-align') === null);
check('三档都对得上（0/1/2 → 左缘/start、居中/无、右缘/end）',
  await page.evaluate(() => {
    const stage = document.querySelector('.stage');
    const input = stage.querySelector('#mark-align');
    const out = input.closest('.rs').querySelector('output');   // input 外面还套着 .sl（滑块画布），别只看 parentElement
    const got = [];
    for (const v of ['0', '1', '2']) {
      input.value = v;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      got.push(`${v}=${out.textContent.trim()}/${stage.getAttribute('data-align') ?? '无'}`);
    }
    input.value = '1';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return got.join(' | ');
  }) === '0=左缘/start | 1=居中/无 | 2=右缘/end');
check('滑块改完对齐，另外三行参数没有被带着动（各行互不干扰）',
  await page.evaluate(() => {
    const stage = document.querySelector('.stage');
    const q = id => stage.querySelector(id);
    return q('#mark-size').value === '41' && q('#mark-gap').value === '55' && q('#mark-dy').value === '-12';
  }) === true);

await pick(page, '风格', 'paper');
check('风格选「纸白」→ 同一个舞台的 data-style 换成 paper（结构 / 组件不动，只换风格令牌）',
  await page.locator(CLAY).getAttribute('data-style') === 'paper');
rows = await menuFacts(page);
check('风格选完之后那一行的值跟着变（真页面里它们本来就是同一个设置项）',
  rows.find(r => r.label === '风格').value === '纸白',
  String(rows.find(r => r.label === '风格').value));
// 选完之后那一行的按钮还在（整合后只有一幅舞台，不再有"按钮被藏起来"的情况），焦点不能掉到 body
check('选完风格后焦点回到那一行的按钮（不落 body）',
  await page.evaluate(() => document.activeElement?.classList.contains('rv') ?? false) === true
  && await page.locator(CLAY).getAttribute('data-style') === 'paper',
  await page.evaluate(() => `${document.activeElement?.tagName}.${document.activeElement?.className}`));
// 再从面板里切回暖陶（发布态里换风格只有这一条通路）。
await pick(page, '风格', 'clay');
await page.waitForTimeout(60);
check('在面板里换风格时，面板不会被收掉（换风格本来就是在设置里做的事）',
  await page.locator(`${CLAY} .panel`).isVisible() === true);
rows = await menuFacts(page);
check('从面板切回暖陶 → 「风格」那一行的值也跟着回到「暖陶」',
  await page.locator(CLAY).isVisible() === true
  && rows.find(r => r.label === '风格').value === '暖陶',
  String(rows.find(r => r.label === '风格').value));

// ---------- E. 关闭：Esc 与点面板外 ----------
await page.locator(rv('默认搜索引擎')).click();
await page.waitForTimeout(60);
await page.keyboard.press('Escape');
await page.waitForTimeout(60);
check('Esc 关掉菜单，并把焦点还给那一行的按钮', await openCount(page) === 0
  && await page.evaluate(() => document.activeElement?.classList.contains('rv') ?? false) === true);
check('Esc 只关一层：设置面板还开着',
  await page.locator(`${CLAY} .panel`).isVisible() === true);

await page.locator(rv('默认搜索引擎')).click();
await page.waitForTimeout(60);
await page.locator('.stage .q').click();
await page.waitForTimeout(60);
check('点面板之外 → 菜单自己收起来', await openCount(page) === 0);
// 点面板之外顺手把面板也收了（真页面本来就有的逻辑），要用就再打开
await openPanel();

// ---------- F. 「自定义…」开的弹窗 ----------
await page.locator(rv('默认搜索引擎')).click();
await page.locator(actionOpt('默认搜索引擎', 'custom')).click();
await page.waitForTimeout(60);
const dlg = `${CLAY} .dlg-back[data-dlg]`;
check('选「自定义…」→ 打开自定义搜索引擎弹窗', await page.locator(dlg).isVisible() === true);
check('弹窗是个正经的模态对话框（role=dialog / aria-modal=true / 有标题）',
  await page.locator(`${dlg} .dlg`).getAttribute('role') === 'dialog'
  && await page.locator(`${dlg} .dlg`).getAttribute('aria-modal') === 'true'
  && (await page.locator(`${dlg} .dlg-title`).textContent()).trim() === '自定义搜索引擎');
check('选「自定义…」不会把那一行的值改成"自定义…"（值还是 Bing）',
  await page.locator(`${rv('默认搜索引擎')} > span`).textContent() === 'Bing');
check('开弹窗的同时菜单收起来了（一次只开一层）', await openCount(page) === 0);
check('打开时焦点在「名称」输入框里',
  await page.evaluate(() => document.activeElement?.hasAttribute('data-dlg-name') ?? false) === true);
check('什么都没填 → 保存按钮是禁用的', await page.locator(`${dlg} [data-dlg-save]`).isDisabled() === true);
check('弹窗里写了 %s 占位说明（用 <code> 排）',
  (await page.locator(`${dlg} .dlg-note`).textContent()).includes('%s')
  && await page.locator(`${dlg} .dlg-note code`).count() === 1);

await page.locator(`${dlg} [data-dlg-name]`).fill('知乎');
await page.waitForTimeout(40);
check('只填名称、没填地址 → 保存仍然禁用', await page.locator(`${dlg} [data-dlg-save]`).isDisabled() === true);
check('在弹窗里点来点去，背后的设置面板不会被收掉（弹窗算面板的一部分）',
  await page.locator(`${CLAY} .panel`).isVisible() === true);

await page.locator(`${dlg} [data-dlg-url]`).fill('https://www.zhihu.com/search');
await page.waitForTimeout(40);
check('地址里没有 %s → 保存仍然禁用（占位符是这套设置的硬要求）',
  await page.locator(`${dlg} [data-dlg-save]`).isDisabled() === true);

await page.locator(`${dlg} [data-dlg-url]`).fill('https://www.zhihu.com/search?q=%s');
await page.waitForTimeout(40);
check('名称非空 + 地址含 %s → 保存按钮可用', await page.locator(`${dlg} [data-dlg-save]`).isEnabled() === true);

await page.locator(`${dlg} [data-dlg-save]`).click();
await page.waitForTimeout(60);
check('点保存 → 弹窗关掉', await page.locator(dlg).isHidden() === true);
check('关掉弹窗后焦点回到那一行的按钮（不是打在刚被藏起来的菜单项上）',
  await page.evaluate(() => document.activeElement?.classList.contains('rv') ?? false) === true
  && await page.evaluate(() => document.activeElement?.closest('.row')?.querySelector('.rl')?.textContent.trim() ?? null) === '默认搜索引擎');
check('点保存 → 「默认搜索引擎」那一行显示你填的名称',
  (await page.locator(`${rv('默认搜索引擎')} > span`).textContent()).trim() === '知乎',
  (await page.locator(`${rv('默认搜索引擎')} > span`).textContent()).trim());
rows = await menuFacts(page);
eng = rows.find(r => r.label === '默认搜索引擎');
check('保存后：自定义引擎作为一条真引擎加进菜单（压在「自定义…」这个动作之前）',
  eng.opts.map(o => o[1]).join(' | ') === 'Bing | Google | 知乎 | 自定义…',
  eng.opts.map(o => o[1]).join(' | '));
check('新引擎自动参与轮切（它的 ✓ 是亮的），而作为动作的「自定义…」不亮',
  eng.selected.includes('custom')
  && await page.evaluate(() => {
    const o = [...document.querySelectorAll('.stage .menu-engine .menu-opt')].at(-1);
    return o.dataset.action === 'custom' && o.getAttribute('aria-selected') !== 'true';
  }) === true, eng.selected.join());
check('发丝线只画在作为动作的「自定义…」上（新加进来那条真引擎没有线）',
  await page.evaluate(() => {
    const os = [...document.querySelectorAll(
      '.stage .row:has(.rl) .menu-engine .menu-opt')];
    const line = o => getComputedStyle(o).borderTopWidth !== '0px';
    return line(os.at(-1)) === true && os.slice(0, -1).every(o => line(o) === false);
  }) === true);
check('保存即生效：搜索线右侧的引擎名跟着写成自定义名（不是还留 Bing）',
  (await page.locator(`${CLAY} .search .tag`).textContent()).trim() === '知乎');
check('选项表本身没被改名（最后一项仍然叫「自定义…」）',
  eng.opts.at(-1)[1] === '自定义…', eng.opts.at(-1)[1]);

await page.locator(rv('默认搜索引擎')).click();
await page.locator(actionOpt('默认搜索引擎', 'custom')).click();
await page.waitForTimeout(60);
check('再开弹窗时「名称」里带出上次填的名字',
  await page.locator(`${dlg} [data-dlg-name]`).inputValue() === '知乎');
check('地址也带出来了（上一轮只带名字，这轮补上）',
  await page.locator(`${dlg} [data-dlg-url]`).inputValue() === 'https://www.zhihu.com/search?q=%s');
await page.locator(`${dlg} [data-dlg-cancel]`).click();
await page.waitForTimeout(60);
check('点取消 → 弹窗关、值不变', await page.locator(dlg).isHidden() === true
  && (await page.locator(`${rv('默认搜索引擎')} > span`).textContent()).trim() === '知乎');
check('点取消关掉弹窗后，焦点也回到那一行的按钮',
  await page.evaluate(() => document.activeElement?.classList.contains('rv') ?? false) === true);

await page.locator(rv('默认搜索引擎')).click();
await page.locator(actionOpt('默认搜索引擎', 'custom')).click();
await page.waitForTimeout(60);
// 遮罩铺满视口、卡片居中，所以点左上角那一小块空白处 = 点遮罩（点卡片正中不会关）
await page.locator(dlg).click({ position: { x: 20, y: 20 } });
await page.waitForTimeout(60);
check('点弹窗外面（遮罩）→ 弹窗关', await page.locator(dlg).isHidden() === true);

await page.locator(rv('默认搜索引擎')).click();
await page.locator(actionOpt('默认搜索引擎', 'custom')).click();
await page.waitForTimeout(60);
// aria-modal 说"这是个模态"，键盘就得真被关在里头：不然 Tab 两下就落到被遮罩盖住的搜索框里
let trapped = true;
const stops = [];
for (let i = 0; i < 5; i += 1) {
  await page.keyboard.press('Tab');
  const where = await page.evaluate(() => {
    const back = document.querySelector('.stage .dlg-back');
    const a = document.activeElement;
    return { inside: back.contains(a), what: a?.dataset?.dlgName !== undefined ? 'name'
      : a?.dataset?.dlgUrl !== undefined ? 'url'
        : a?.dataset?.dlgCancel !== undefined ? 'cancel'
          : a?.dataset?.dlgSave !== undefined ? 'save' : (a?.tagName ?? null) };
  });
  if (!where.inside) trapped = false;
  stops.push(where.what);
}
check('弹窗里连按 Tab 焦点始终被关在弹窗内（aria-modal 配了焦点陷阱）', trapped, stops.join(' → '));
check('焦点循环里没有漏掉「取消」（禁用时的「保存」本来就该跳过）', stops.includes('cancel'), stops.join(' → '));

await page.keyboard.press('Escape');
await page.waitForTimeout(60);
check('Esc 的优先级：先关弹窗，设置面板还开着',
  await page.locator(dlg).isHidden() === true && await page.locator(`${CLAY} .panel`).isVisible() === true);
check('Esc 关掉弹窗后，焦点回到那一行的按钮',
  await page.evaluate(() => document.activeElement?.classList.contains('rv') ?? false) === true);

// ---------- G. 前端不实装：不进 storage、不改真页面零件 ----------
check('全程没有碰 chrome.storage（页面里根本没有这个 API，碰了就会报错）',
  await page.evaluate(() => typeof chrome === 'undefined' || !chrome.storage));
check('页面里已经没有那句提示行（用户 m03467 删掉了，三套都不该有）',
  await page.evaluate(() => {
    const stage = document.querySelector('.stage');
    const out = {};
    for (const s of ['clay', 'paper', 'grid']) {
      stage.dataset.style = s;
      out[s] = stage.querySelectorAll('.hint').length;
    }
    stage.dataset.style = 'clay';
    return out.clay === 0 && out.paper === 0 && out.grid === 0;
  }) === true);
check('引导语 / 参数行 / 分隔线三套都显示（差异只剩令牌，不再有"内容级"分叉）',
  await page.evaluate(() => {
    const stage = document.querySelector('.stage');
    const seen = {};
    for (const s of ['clay', 'paper', 'grid']) {
      stage.dataset.style = s;
      seen[s] = [
        stage.querySelector('.mark').offsetParent !== null,
        [...stage.querySelectorAll('.row-param')].every(p => p.offsetParent !== null),
        stage.querySelector('.row-sep').offsetParent !== null,
      ].join();
    }
    stage.dataset.style = 'clay';
    return JSON.stringify(seen);
  }) === JSON.stringify({ clay: 'true,true,true', paper: 'true,true,true', grid: 'true,true,true' }));
check('菜单与弹窗是三套共用的同一份 DOM（整合后不再只有暖陶有），换风格不动它',
  await page.evaluate(() => {
    const stage = document.querySelector('.stage');
    const menus = stage.querySelectorAll('.menu').length;
    const dlg = stage.querySelectorAll('[data-dlg]').length;
    stage.dataset.style = 'grid';
    const same = stage.querySelectorAll('.menu').length === menus
      && stage.querySelectorAll('[data-dlg]').length === dlg;
    stage.dataset.style = 'clay';
    return menus === 5 && dlg === 1 && same;
  }) === true);
await page.close();

// ---------- H0. 菜单的分层：V3 投影（m01541 用户从五版方案里挑的）----------
page = await open('clay+panel');
await page.locator(rv('默认搜索引擎')).click();
await page.waitForTimeout(60);
const menuShadow = await page.evaluate(() => {
  const m = document.querySelector('.stage .menu:not([hidden])');
  const cs = getComputedStyle(m);
  return { shadow: cs.boxShadow, bg: cs.backgroundColor };
});
check('浅色下菜单与面板同色（V3 不改颜色，只加投影；--surface-raised / #efe9de）',
  menuShadow.bg === 'rgb(239, 233, 222)', menuShadow.bg);
check('浅色下菜单带着暖墨投影（--shadow-warm 那两层都在）',
  menuShadow.shadow.includes('rgba(20, 20, 19, 0.14) 0px 8px 24px')
  && menuShadow.shadow.includes('rgba(20, 20, 19, 0.08) 0px 1px 3px'),
  menuShadow.shadow);
await page.close();

// ---------- H. 暗色下的菜单与弹窗 ----------
page = await open('clay+dark+panel');
await page.locator(rv('默认搜索引擎')).click();
await page.waitForTimeout(60);
const menuSkin = await page.evaluate(() => {
  const m = document.querySelector('.stage .menu:not([hidden])');
  const cs = getComputedStyle(m);
  const btn = m.parentElement.querySelector('.rv');
  return {
    bg: cs.backgroundColor,
    border: cs.borderTopColor,
    radius: cs.borderTopLeftRadius,
    shadow: cs.boxShadow,
    rowValueColor: getComputedStyle(btn.querySelector('span')).color,
    chev: getComputedStyle(btn.querySelector('.chev')).color,
    optColors: [...m.querySelectorAll('.menu-opt')].map(o => [
      o.dataset.action ? `${o.dataset.value}(动作)` : o.dataset.value,
      getComputedStyle(o).color,
    ]),
  };
});
check('暗色下菜单底色 = 抬升面（--surface-raised / 深色 #252320）',
  menuSkin.bg === 'rgb(37, 35, 32)', menuSkin.bg);
check('暗色下菜单边框 = 暗色发丝线（--border）', menuSkin.border !== menuSkin.bg, menuSkin.border);
check('暗色下菜单圆角走令牌 --r-md（12px）', menuSkin.radius === '12px', menuSkin.radius);
check('暗色下菜单照样投影（用户 m02895：三套都放大投影；暖陶暗色用暖墨黑那一版）',
  menuSkin.shadow === 'rgba(0, 0, 0, 0.45) 0px 8px 24px 0px, rgba(0, 0, 0, 0.3) 0px 1px 3px 0px',
  menuSkin.shadow);
check('暗色下菜单里勾选着的几项都用主文字色（--text / 奶白 #faf9f5），没勾的动作项用次级色',
  menuSkin.optColors.length === 3
  && menuSkin.optColors.find(([v]) => v === 'bing')?.[1] === 'rgb(250, 249, 245)'
  && menuSkin.optColors.find(([v]) => v === 'google')?.[1] === 'rgb(250, 249, 245)'
  && menuSkin.optColors.find(([v]) => v === 'custom(动作)')?.[1] === 'rgb(160, 157, 150)',
  JSON.stringify(menuSkin.optColors));
check('暗色下触发那一行的值也是次级色（--text-2），与面板其它行一致',
  menuSkin.rowValueColor === 'rgb(160, 157, 150)', menuSkin.rowValueColor);
await page.locator(actionOpt('默认搜索引擎', 'custom')).click();
await page.waitForTimeout(60);
const dlgSkin = await page.evaluate(() => {
  const stage = document.querySelector('.stage');
  const save = stage.querySelector('[data-dlg-save]');
  const back = stage.querySelector('.dlg-back');
  const name = stage.querySelector('[data-dlg-name]');
  const url = stage.querySelector('[data-dlg-url]');
  const snap = el => [getComputedStyle(el).backgroundColor, getComputedStyle(el).color];
  const disabled = snap(save);
  // 填上名称与含 %s 的地址，让保存按钮真的可用，再读一次（验收"禁用 / 可用"两态）
  name.value = '知乎';
  url.value = 'https://www.zhihu.com/search?q=%s';
  name.dispatchEvent(new Event('input', { bubbles: true }));
  url.dispatchEvent(new Event('input', { bubbles: true }));
  const enabled = snap(save);
  return {
    disabledBg: disabled[0],
    disabledColor: disabled[1],
    enabledBg: enabled[0],
    enabledColor: enabled[1],
    scrim: getComputedStyle(back).backgroundColor,
  };
});
check('暗色下弹窗主按钮：禁用时是描边灰（.dlg-btn-primary:disabled 不再被"暗色要反色"压掉），填好后才是奶白底 + 深字',
  dlgSkin.disabledBg === 'rgba(255, 255, 255, 0.12)' && dlgSkin.disabledColor === 'rgb(160, 157, 150)'
  && dlgSkin.enabledBg === 'rgb(250, 249, 245)' && dlgSkin.enabledColor === 'rgb(24, 23, 21)',
  `禁用 ${dlgSkin.disabledBg} / ${dlgSkin.disabledColor} → 可用 ${dlgSkin.enabledBg} / ${dlgSkin.enabledColor}`);
check('遮罩是半透明暖墨（--warm-scrim）', /^rgba\(20, 20, 19, 0\.4\)$/.test(dlgSkin.scrim), dlgSkin.scrim);
await page.close();

// ---------- I. hash 摆状态（截图/视觉回归用） ----------
page = await open('clay+menu');
check('#clay+menu：面板展开 + 引擎菜单是开着的', await page.locator(`${CLAY} .panel`).isVisible() === true
  && await openCount(page) === 1 && await page.locator(menu('默认搜索引擎')).isVisible() === true);
check('#clay+menu：没有元素拿着焦点（焦点环会让基准图不稳）',
  await page.evaluate(() => document.activeElement === document.body) === true);
await page.close();

page = await open('clay+dlg');
check('#clay+dlg：弹窗开着，保存按钮是禁用的（空状态）',
  await page.locator(`${CLAY} .dlg-back[data-dlg]`).isVisible() === true
  && await page.locator(`${CLAY} [data-dlg-save]`).isDisabled() === true);
check('#clay+dlg：焦点没停在输入框里（同上，为了基准图稳定）',
  await page.evaluate(() => document.activeElement === document.body) === true);
await page.close();

// ---------- J. 与实验室那张稿子对得上（同一组默认值 = 同一个构图） ----------
page = await open('clay');
const here = await page.evaluate(() => {
  const stage = document.querySelector('.stage');
  const m = stage.querySelector('.mark').getBoundingClientRect();
  const l = stage.querySelector('.search').getBoundingClientRect();
  return { markTop: Math.round(m.top), markCenter: Math.round((m.left + m.right) / 2), lineTop: Math.round(l.top), lineCenter: Math.round((l.left + l.right) / 2) };
});
await page.close();
page = await open('', LAB);
const lab = await page.evaluate(() => {
  const m = document.querySelector('.g-mark').getBoundingClientRect();
  const l = document.querySelector('.search').getBoundingClientRect();
  return { markTop: Math.round(m.top), markCenter: Math.round((m.left + m.right) / 2), lineTop: Math.round(l.top), lineCenter: Math.round((l.left + l.right) / 2) };
});
await page.close();
check('Preview 里的暖陶与 全局设计.html 那张稿子构图一致（标顶边差 ≤1px）',
  Math.abs(here.markTop - lab.markTop) <= 1, `${here.markTop} vs ${lab.markTop}`);
check('两张稿子的搜索线位置一致（顶边与中心各差 ≤1px）',
  Math.abs(here.lineTop - lab.lineTop) <= 1 && Math.abs(here.lineCenter - lab.lineCenter) <= 1,
  `线顶 ${here.lineTop} vs ${lab.lineTop} / 线心 ${here.lineCenter} vs ${lab.lineCenter}`);
check('引导语同中轴（差 ≤1px）', Math.abs(here.markCenter - lab.markCenter) <= 1,
  `${here.markCenter} vs ${lab.markCenter}`);

/* ---------- L. 引擎菜单的拖动排序 + 轮切跟着菜单次序走（用户 m01021 第 3、4 条） ---------- */
page = await open('clay');
const ENG = `${CLAY} [data-menu-key="engine"]`;   // 纯 CSS 选择器：evaluate 里也能用（:has/:text-is 只归 Playwright）
const openEngine = async () => {
  await openPanel();
  if (await page.locator(ENG).isHidden()) {
    await page.locator(rv('默认搜索引擎')).click();
    await page.waitForTimeout(60);
  }
};
// 只认"引擎那一张清单"里的选项：别的菜单也有 .menu-opt，全局抓会把它们一起抓进来
const engineList = () => page.evaluate(sel => [...document.querySelectorAll(`${sel} .menu-opt`)]
  .map(o => o.dataset.value + (o.dataset.action ? '(动作)' : '')), ENG);
const marks = () => page.evaluate(sel => {
  const opts = [...document.querySelectorAll(`${sel} .menu-opt`)];
  const hit = c => opts.filter(o => o.classList.contains(c))
    .map(o => o.dataset.value + (o.dataset.action ? '(动作)' : ''));
  return { dragging: hit('is-dragging'), before: hit('is-drop-before'), after: hit('is-drop-after') };
}, ENG);
// 整页的光标：只有引擎清单那些才是 grab，别的菜单一律不是（否则是误导）
const cursorsOf = () => page.evaluate(() => [...document.querySelectorAll(
  '.stage .menu .menu-opt')].map(o => [
  o.closest('.menu-engine')
    ? (o.dataset.action ? '动作' : o.dataset.value)
    : `其它菜单:${o.dataset.value}`,
  getComputedStyle(o).cursor,
]));
const optAt = value => page.locator(`${ENG} .menu-opt[data-value="${value}"]:not([data-action])`);
// 真鼠标拖：按住某条引擎 → 挪过 4px 阈值 → 停到目标行中线的另一侧 → 松手
const dragEngine = async (from, to, side) => {
  await openEngine();
  const a = await optAt(from).boundingBox();
  const b = await optAt(to).boundingBox();
  const x = a.x + a.width - 18;
  const endY = side === 'after' ? b.y + b.height - 3 : b.y + 3;
  await page.mouse.move(x, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(x, a.y + a.height / 2 + 9, { steps: 2 });   // 过 4px 阈值 → 进入拖动
  await page.waitForTimeout(40);
  const mid = await marks();
  const cursors = await cursorsOf();
  const orderMid = (await engineList()).join(' | ');
  await page.mouse.move(x, endY, { steps: 4 });
  await page.waitForTimeout(40);
  const target = await marks();
  const lineStyle = await page.evaluate(sel => {
    const o = document.querySelector(`${sel} .menu-opt.is-drop-before, ${sel} .menu-opt.is-drop-after`);
    if (!o) return null;
    const src = getComputedStyle(o, o.classList.contains('is-drop-before') ? '::before' : '::after');
    return { height: src.height, color: src.backgroundColor, content: src.content };
  }, ENG);
  await page.mouse.up();
  await page.waitForTimeout(90);
  return { mid, target, orderMid, lineStyle, cursors, after: await marks(), order: (await engineList()).join(' | ') };
};

// 先把自定义引擎定义出来：两条引擎的轮切是个 2-循环，次序换不换看着一样，看不出"跟着菜单走"
await openEngine();
await page.locator(actionOpt('默认搜索引擎', 'custom')).click();
await page.waitForTimeout(60);
await page.locator(`${CLAY} [data-dlg-name]`).fill('知乎');
await page.locator(`${CLAY} [data-dlg-url]`).fill('https://www.zhihu.com/search?q=%s');
await page.locator(`${CLAY} [data-dlg-save]`).click();
await page.waitForTimeout(90);
check('先备好三条引擎（Bing / Google / 知乎）才看得出轮切次序',
  (await engineList()).join(' | ') === 'bing | google | custom | custom(动作)',
  (await engineList()).join(' | '));

const drag = await dragEngine('bing', 'google', 'after');
check('拖动中：源行被标上 is-dragging（"轻度指引"的一半）',
  drag.mid.dragging.join() === 'bing', JSON.stringify(drag.mid));
check('拖动中：没松手时次序一动不动（松手才换位，不边拖边跳）',
  drag.orderMid === 'bing | google | custom | custom(动作)', drag.orderMid);
check('拖到 Google 与 知乎 之间 → 落点标在下面那条的前缘（is-drop-before = 知乎）',
  drag.target.before.join() === 'custom' && drag.target.after.length === 0, JSON.stringify(drag.target));
check('落点线是一条 1px 的珊瑚发丝线（伪元素画的，不占布局、不挤动别的行）',
  drag.lineStyle?.height === '1px' && drag.lineStyle?.color === 'rgb(204, 120, 92)'
  && drag.lineStyle?.content !== 'none',
  JSON.stringify(drag.lineStyle));
check('拖动中源行是 grabbing、其它引擎行是 grab，作为动作的「自定义…」仍是 pointer',
  drag.cursors.find(([v]) => v === 'bing')?.[1] === 'grabbing'
  && drag.cursors.find(([v]) => v === 'google')?.[1] === 'grab'
  && drag.cursors.find(([v]) => v === '动作')?.[1] === 'pointer',
  JSON.stringify(drag.cursors));
check('别的菜单（左侧 / 焦点 / 暗色 / 风格）一个都不给 grab 光标（能拖的只有引擎清单）',
  drag.cursors.filter(([v]) => v.startsWith('其它菜单')).every(([, c]) => c !== 'grab'),
  JSON.stringify(drag.cursors.filter(([v]) => v.startsWith('其它菜单'))));
check('松手 → 次序真换了（Bing 落到 Google 之后、知乎之前），✓ 一个没被翻掉',
  drag.order === 'google | bing | custom | custom(动作)', drag.order);
check('松手后拖动痕迹清干净了（没有 is-dragging、没有落点线）',
  drag.after.dragging.length === 0 && drag.after.before.length === 0 && drag.after.after.length === 0,
  JSON.stringify(drag.after));
check('松手后焦点还在被拖的那一条上（手感不丢）',
  await page.evaluate(() => document.activeElement?.dataset.value ?? null) === 'bing');
check('菜单没被顺手关掉（拖动不是"点面板之外"）',
  await page.locator(ENG).isVisible() === true);
check('拖动换位不翻 ✓（三条引擎都还勾着）',
  (await menuFacts(page)).find(r => r.label === '默认搜索引擎').selected.slice().sort().join() === 'bing,custom,google');

// 轮切次序跟着菜单走：现在 知乎 生效，新次序是 Google → Bing → 知乎
const tagText = async () => (await page.locator(`${CLAY} .search .tag`).textContent()).trim();
check('当前引擎是刚保存的知乎（自定义引擎一保存就生效）', await tagText() === '知乎', await tagText());
await page.locator(`${CLAY} .search .tag`).click();
await page.waitForTimeout(60);
check('点引擎名 → 按"菜单由上到下"轮切（知乎 → 绕回排第一的 Google）',
  await tagText() === 'Google', await tagText());
await page.locator(`${CLAY} .search .tag`).click();
await page.waitForTimeout(60);
check('再点 → 到 Bing（走的是新次序，不是默认的 Bing→Google）',
  await tagText() === 'Bing', await tagText());
await page.locator(`${CLAY} .search .tag`).click();
await page.waitForTimeout(60);
check('再点 → 回到知乎，一圈走完', await tagText() === '知乎', await tagText());

// 键盘通路：Alt + ↑ 把当前这条往前挪
await openEngine();
await optAt('bing').focus();
await page.keyboard.press('Alt+ArrowUp');
await page.waitForTimeout(60);
check('键盘通路：Alt+↑ 把当前这条往前挪一条（Bing 回到第一位）',
  (await engineList()).join(' | ') === 'bing | google | custom | custom(动作)',
  (await engineList()).join(' | '));
check('键盘挪完焦点还留在这一条上（可以连着按）',
  await page.evaluate(() => document.activeElement?.dataset.value ?? null) === 'bing');

check('输入框里没有占位文案（用户 m01021 第 1 条），可访问名留在 aria-label 上',
  await page.evaluate(() => {
    const q = document.querySelector('.stage .q');
    return q.getAttribute('placeholder') === null && q.getAttribute('aria-label') === '搜索';
  }) === true);
check('占位文案是**框架**的一部分：三套都没有（用户 m03467：内容与 UI 不随皮肤变）',
  await page.evaluate(async () => {
    const stage = document.querySelector('.stage');
    const styleRow = [...stage.querySelectorAll('.panel .row')]
      .find(r => r.querySelector('.rl').textContent === '风格');
    const out = {};
    for (const s of ['paper', 'grid', 'clay']) {
      if (styleRow.querySelector('.menu').hidden) {
        styleRow.querySelector('.rv').click();
        await new Promise(r => setTimeout(r, 40));
      }
      styleRow.querySelector(`.menu-opt[data-value="${s}"]`).click();
      await new Promise(r => setTimeout(r, 40));
      out[s] = document.querySelector('.stage .q').placeholder;
    }
    return JSON.stringify(out);
  }) === JSON.stringify({ paper: '', grid: '', clay: '' }));
await page.close();

/* ---------- K. 亮暗切换的过场：D1 逐色渐变（只在暖陶这一套，用户 m00768 选定） ---------- */
// 这一节不能用 open()：它会注入 * { transition: none }，正好把要验的东西掐掉
const rawOpen = async hash => {
  const p = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  p.on('pageerror', e => errors.push(String(e)));
  await p.goto(`${PAGE}#${hash}`);
  await p.waitForTimeout(120);
  return p;
};

page = await rawOpen('clay');
const declared = await page.evaluate(() => {
  const cs = getComputedStyle(document.querySelector('.stage'));
  return {
    props: cs.transitionProperty,
    durs: cs.transitionDuration,
    eases: cs.transitionTimingFunction,
    dur: cs.getPropertyValue('--dur-theme').trim(),
  };
});
// m03794 起过渡挂在 [data-style] 上（亮暗与换肤的缓和属于框架功能），三套共用同一条规则；
// 首屏那一次由 Preview.html 的 [data-booting] 瞬时落位，所以这里读到的就是用户切换时那条
const CLAY_PROPS = ['--bg', '--surface', '--surface-2', '--surface-raised', '--panel-bg',
  '--panel-shadow-color', '--scrim', '--slider-fill', '--tile-hover',
  '--border', '--border-strong', '--text', '--text-2', '--text-3', '--ring',
  '--panel-r', '--slider-knob', '--slider-r'];
check('舞台把 18 个会随皮肤变的属性都挂上了过渡（15 个颜色 + 面板圆角 + 头大小 + 头圆角）',
  declared.props.split(', ').join('|') === CLAY_PROPS.join('|'),
  declared.props);
check('过渡时长就是令牌 --dur-theme（420ms），18 个属性一个不落',
  declared.dur === '420ms' && declared.durs.split(', ').every(d => d === '0.42s'),
  `${declared.dur} / ${declared.durs}`);
const EASE_MID = 'cubic-bezier(0.45, 0, 0.55, 1)';
check('曲线是中心对称的 --ease-mid（cubic-bezier(.45, 0, .55, 1)），不是那条一上来就拉满的 --ease',
  declared.eases.includes(EASE_MID) && declared.eases.split(EASE_MID).join('').replaceAll(', ', '') === '',
  declared.eases);

// 按帧采样：切暗的那一瞬，底色与墨迹是不是真的在走中间态
const trace = await page.evaluate(async () => {
  const stage = document.querySelector('.stage');
  const mark = stage.querySelector('.mark');
  const q = stage.querySelector('.q');
  const read = () => ({
    t: performance.now(),
    bg: getComputedStyle(stage).getPropertyValue('--bg').trim(),
    text: getComputedStyle(mark).color,
    input: getComputedStyle(q).color,
  });
  const out = [read()];
  stage.setAttribute('data-theme', 'dark');
  const t0 = performance.now();
  while (performance.now() - t0 < 460) {
    await new Promise(r => requestAnimationFrame(r));
    out.push(read());
  }
  return out;
});
const rgbOf = s => (s.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
const lum = c => rgbOf(c).map(v => {
  const x = v / 255;
  return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
}).reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
const contrast = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (hi + 0.05) / (lo + 0.05);
};
const frameCount = trace.length;
// "字看不见"的窗口：墨迹对底色掉到 2:1 以下的帧一共占了多少毫秒
let mud = 0;
for (let i = 1; i < trace.length; i += 1) {
  if (contrast(trace[i].text, trace[i].bg) < 2) mud += trace[i].t - trace[i - 1].t;
}
check('底色与文字都真的走了中间态（不是一帧换完）',
  new Set(trace.map(s => s.bg)).size > 3 && new Set(trace.map(s => s.text)).size > 3,
  `底 ${new Set(trace.map(s => s.bg)).size} 个取值 / 字 ${new Set(trace.map(s => s.text)).size} 个取值，共 ${frameCount} 帧`);
check('起止两端就是这一套的两个端点（奶油底暖墨字 → 暖墨底奶油字）',
  trace[0].bg === 'rgb(250, 249, 245)' && trace[0].text === 'rgb(20, 20, 19)'
  && trace.at(-1).bg === 'rgb(24, 23, 21)' && trace.at(-1).text === 'rgb(250, 249, 245)',
  `${trace[0].bg}/${trace[0].text} → ${trace.at(-1).bg}/${trace.at(-1).text}`);
check('"文字看不见"的窗口被压到一两帧（< 时长的 1/4 = 105ms）', mud < 105, `${Math.round(mud)}ms`);
console.log(`  ·   D1 实测：${frameCount} 帧采样，"字看不见"合计 ${Math.round(mud)}ms；`
  + `底色 ${new Set(trace.map(s => s.bg)).size} 个取值、标题 ${new Set(trace.map(s => s.text)).size} 个取值`);
check('输入框里的字也跟着一起走（不是只有标题在变）',
  new Set(trace.map(s => s.input)).size > 3,
  `${new Set(trace.map(s => s.input)).size} 个取值`);
await page.close();

// 尊重"减少动态效果"：只把时长归零
const rmPage = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
await rmPage.goto(`${PAGE}#clay`);
const rm = await rmPage.evaluate(async () => {
  const stage = document.querySelector('.stage');
  const dur = getComputedStyle(stage).getPropertyValue('--dur-theme').trim();
  stage.setAttribute('data-theme', 'dark');
  await new Promise(r => requestAnimationFrame(r));
  const bg = getComputedStyle(stage).getPropertyValue('--bg').trim();
  return { dur, bg };
});
check('prefers-reduced-motion: reduce 下 --dur-theme 归零、底色一帧到位',
  rm.dur === '0s' && rm.bg === 'rgb(24, 23, 21)', `${rm.dur} / ${rm.bg}`);
await rmPage.close();

check('没有 console / page 错误', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
console.log(`\n${failures.length === 0 ? '全部通过' : '有失败项'}：${passed + failures.length} 项（通过 ${passed}，失败 ${failures.length}）`);
if (failures.length) {
  console.log(failures.map(f => `  - ${f}`).join('\n'));
  process.exitCode = 1;
}
