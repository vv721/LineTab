// ============================================================
// 真页面的视觉回归：把 LineTab/newtab.html（真新标签页，无看稿工具条）的
// 九种状态逐像素钉住。和 visual.spec.mjs 的分工：
//   visual.spec.mjs —— Preview.html，用来挑风格、比候选；
//   newtab.spec.mjs  —— 交付页 LineTab/newtab.html，用来防止已定下的样子被改坏。
//
// 两件为了"确定性"必须做的事：
//   1) 页面不显示时间（时钟已被拿掉），所以没有需要钉死的时钟；
//   2) 截图文件名统一带 newtab- 前缀：不能和 visual.spec.mjs 的
//      paper.png / grid.png 撞名，否则两套基准图会互相覆盖。
// ============================================================
import { test, expect } from '@playwright/test';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { EXT_DIR } from './runtime-files.mjs';

// 按脚本自身位置解析页面路径，这样从任何工作目录跑都能找到
const PAGE = pathToFileURL(path.join(EXT_DIR, 'newtab.html')).href;

/* 二级菜单：行按钮现在只负责开菜单，真正改设置的是菜单项（同步 Preview 之后就是这样）。
   下面两个小工具把这套交互收成一句话，省得每条用例都写两遍定位。 */
function rowOf(page, id) {
  return page.locator('#panel .row').filter({ has: page.locator('#' + id) });
}

async function choose(page, id, value) {
  await page.locator('#' + id).click();
  const option = rowOf(page, id).locator('.menu-opt[data-value="' + value + '"]');
  await expect(option).toBeVisible();
  await option.click();
  await expect(rowOf(page, id).locator('.menu')).toBeHidden();
}

const SHOTS = [
  'paper',
  'paper+dark',
  'paper+panel',
  'paper+prompt',   // 左侧元素换成 ">" 提示符
  'paper+hold',     // 焦点反馈换成"界面不动"
  'paper+still',    // 显式失焦后的静止样子（页面打开是自动聚焦的，见下）
  'grid',
  'grid+dark',      // C 在暗色下点阵要还在
  'grid+panel',     // 点阵不许从设置面板里透出来（以前真踩过的 bug）
  'clay',           // 第三套皮肤：暖陶（用户 m00693 要求看稿页的全部设计都得在发布形态里）
  'clay+dark',
  'clay+panel',
  'paper+menu',     // 二级菜单（引擎那张）：勾选 + 拖动排序 + 末尾「自定义…」
  'clay+dlg',       // 自定义搜索引擎弹窗
];

for (const shot of SHOTS) {
  test(`新标签页 ${shot}`, async ({ page }) => {
    await page.goto(`${PAGE}#${shot}`);

    // 先确认页面真的按这个镜头摆好了，再截图 —— 否则截到的是"没生效"的样子
    await expect(page.locator('html')).toHaveAttribute('data-style', shot.split('+')[0]);
    await expect(page.locator('html')).toHaveAttribute(
      'data-lead',
      shot.includes('prompt') ? 'prompt' : 'icon'
    );
    await expect(page.locator('html')).toHaveAttribute(
      'data-focus',
      shot.includes('hold') ? 'hold' : 'line'
    );
    const withMenu = shot.includes('menu');
    const withDlg = shot.includes('dlg');
    if (shot.includes('panel') || withMenu || withDlg) {
      await expect(page.locator('#panel')).toBeVisible(); // hash 里的 +panel 会在加载时展开面板
    } else {
      await expect(page.locator('#panel')).toBeHidden();
    }
    // 宫格已从定稿页删掉：任何镜头下都不该冒出快捷方式块
    await expect(page.locator('.tile')).toHaveCount(0);
    /* 引导语是框架件，三套皮肤都有（同步 m00693）：镜头里它必须真的在 */
    await expect(page.locator('#mark')).toBeVisible();
    /* 面板行数是有意锁住的（增删设置项必须同步改这里，免得悄悄少一行没人发现）：
       5 行设置 + 一条分隔线 + 5 行引导语参数 */
    await expect(page.locator('#panel .row')).toHaveCount(10);
    await expect(page.locator('#panel .row-param')).toHaveCount(5);
    await expect(page.locator('#panel .row-sep')).toHaveCount(1);
    // 菜单 / 弹窗是 hash 摆出来的：都在，且只有一张菜单开着
    await expect(page.locator('#panel .menu:not([hidden])')).toHaveCount(withMenu ? 1 : 0);
    if (withDlg) await expect(page.locator('#dlg-back')).toBeVisible();
    else await expect(page.locator('#dlg-back')).toBeHidden();

    /* 打开就自动聚焦搜索框，所以除了 still 这一个镜头，其它镜头都按这个真实状态拍
       （line 档下这意味着底线是近黑的 —— 那是默认的样子，不是摆出来的）。
       用 hash 摆出菜单 / 弹窗的镜头反过来：焦点必须留在原地，否则截图会随焦点环漂移。 */
    if (withMenu || withDlg) {
      await expect(page.locator('#q')).not.toBeFocused();
    } else if (shot.includes('still')) {
      await page.locator('#q').blur();
      await page.waitForTimeout(250); // 底线颜色有 150ms 过渡，不等它走完会拍到中间值
      await expect(page.locator('#q')).not.toBeFocused();
    } else {
      await expect(page.locator('#q')).toBeFocused();
    }

    await expect(page).toHaveScreenshot(`newtab-${shot.replace(/\+/g, '-')}.png`);
  });
}

test('输入 g 前缀走 Google（默认仍是 Bing，不改设置）', async ({ page }) => {
  await page.goto(`${PAGE}#paper`);

  const requested = [];
  page.on('request', (request) => requested.push(request.url()));
  // 只记录、不真的联网：这一步会 abort，所以测试在离线环境下也能量出提交的地址
  await page.route('**/*', (route) => route.abort());

  await page.fill('#q', 'g 天气');
  await page.press('#q', 'Enter');

  await expect
    .poll(() => requested.some((url) => url.startsWith('https://www.google.com/search?q=')))
    .toBe(true);
});

test('明暗三态会循环「跟随系统 → 常暗 → 常亮」，并且重开仍然生效', async ({ page }) => {
  await page.goto(`${PAGE}#paper+panel`);

  // 默认 = 跟随系统（值为 null，不是"没设置过"）
  await expect(page.locator('#dark-value')).toHaveText('跟随系统');

  await choose(page, 'dark', 'on');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('#dark-value')).toHaveText('常暗');

  await choose(page, 'dark', 'off');
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('#dark-value')).toHaveText('常亮');

  await choose(page, 'dark', 'auto');
  await expect(page.locator('#dark-value')).toHaveText('跟随系统'); // 三态闭环

  // 存过"常暗"之后重开：不该被 hash 或系统偏好压回去
  await choose(page, 'dark', 'on');
  await expect(page.locator('#dark-value')).toHaveText('常暗');
  await page.goto(PAGE);
  await expect(page.locator('#dark-value')).toHaveText('常暗');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('「跟随系统」真的跟着系统走，而常亮不会被系统的暗色带走', async ({ page }) => {
  await page.goto(`${PAGE}#paper+panel`);

  // 系统变暗 + 处于"跟随系统" → 页面要变暗，但设置仍然显示"跟随系统"
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('#dark-value')).toHaveText('跟随系统');

  // 切到"常亮"：系统再怎么暗也不跟
  await page.emulateMedia({ colorScheme: 'light' });
  await choose(page, 'dark', 'on');   // 跟随系统 → 常暗
  await choose(page, 'dark', 'off');  // 常暗 → 常亮
  await expect(page.locator('#dark-value')).toHaveText('常亮');

  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'dark');
});

test('搜索框左侧元素真的会在放大镜与 ">" 之间换掉', async ({ page }) => {
  await page.goto(`${PAGE}#paper+panel`);

  await expect(page.locator('html')).toHaveAttribute('data-lead', 'icon');
  await expect(page.locator('.search .ico')).toBeVisible();
  await expect(page.locator('.search .prompt')).toBeHidden();

  await choose(page, 'lead', 'prompt');

  await expect(page.locator('html')).toHaveAttribute('data-lead', 'prompt');
  await expect(page.locator('#lead-value')).toHaveText('> 提示符');
  await expect(page.locator('.search .ico')).toBeHidden();
  await expect(page.locator('.search .prompt')).toBeVisible();
});

test('焦点反馈的两态：底线变文字色 vs 界面不动', async ({ page }) => {
  await page.goto(`${PAGE}#paper+panel`);
  const search = page.locator('.search');

  // 页面打开就是聚焦状态，所以先显式失焦，才拿得到"不聚焦"时的底线颜色
  await expect(page.locator('#q')).toBeFocused();
  await page.locator('#q').blur();
  await page.waitForTimeout(250);
  const blurColor = await search.evaluate((node) => getComputedStyle(node).borderBottomColor);

  // 默认（F5 深灰细线）：聚焦后底线从 --border-strong 变成文字色
  await expect(page.locator('html')).toHaveAttribute('data-focus', 'line');
  await page.locator('#q').focus();
  // 颜色带 150ms 过渡：不等它走完会读到中间值
  await page.waitForTimeout(250);
  const focusColor = await search.evaluate((node) => getComputedStyle(node).borderBottomColor);
  expect(focusColor).toBe('rgb(13, 13, 13)');
  expect(focusColor).not.toBe(blurColor);

  // 切成"不变"（F3）之后，聚焦不该再动底线
  await choose(page, 'focus', 'hold');
  await expect(page.locator('html')).toHaveAttribute('data-focus', 'hold');
  await page.locator('#q').focus();
  await page.waitForTimeout(250);
  const holdColor = await search.evaluate((node) => getComputedStyle(node).borderBottomColor);
  expect(holdColor).toBe(blurColor);
});

test('地址栏 hash 借来的风格不会落盘', async ({ page }) => {
  await page.goto(`${PAGE}#grid+dark+panel`);
  await expect(page.locator('html')).toHaveAttribute('data-style', 'grid');

  // 随便改一个无关设置：旧实现在这里会把 hash 借来的 grid+dark 一起存进去
  await choose(page, 'lead', 'prompt');

  await page.goto(PAGE); // 不带 hash 再打开一次
  await expect(page.locator('html')).toHaveAttribute('data-style', 'paper');
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'dark');
});

test('手动改的左侧元素与焦点反馈，重开之后仍然生效', async ({ page }) => {
  await page.goto(`${PAGE}#paper+panel`);
  await expect(page.locator('html')).toHaveAttribute('data-lead', 'icon');

  await choose(page, 'lead', 'prompt');   // 放大镜 → "> 提示符
  await choose(page, 'focus', 'hold');    // 深灰细线 → 不变
  await expect(page.locator('html')).toHaveAttribute('data-lead', 'prompt');
  await expect(page.locator('html')).toHaveAttribute('data-focus', 'hold');

  // 关键：不带任何 hash 重开。旧实现会在 applyHashOverrides() 里把
  // overrides.lead/focus 无条件压回默认值，于是存了也用不上（P1 回归）。
  await page.goto(PAGE);
  await expect(page.locator('html')).toHaveAttribute('data-lead', 'prompt');
  await expect(page.locator('html')).toHaveAttribute('data-focus', 'hold');
  await expect(page.locator('#lead-value')).toHaveText('> 提示符');
  await expect(page.locator('#focus-value')).toHaveText('不变');
  await expect(page.locator('.search .prompt')).toBeVisible();
});

/* ============================================================
   过场：D1 逐色渐变（m00768 定的框架行为，原来看稿页有、交付页没有）
   这几条盯的是"交付页真的拿到了看稿页那套过场"，不是像素：
   像素由上面的 newtab-*.png 钉住，这里钉的是"中途有没有插值"。
   ============================================================ */

/** 半程采样：点一下某个设置之后，每 40ms 记一次 --bg / --panel-r，共记 14 次（≈560ms，比 420ms 长） */
async function sampleTransition(page) {
  return page.evaluate(() => new Promise((resolve) => {
    const cs = getComputedStyle(document.documentElement);
    const seen = [];
    const tick = () => {
      seen.push({
        t: performance.now(),
        bg: cs.getPropertyValue('--bg').trim(),
        r: cs.getPropertyValue('--panel-r').trim(),
        text: cs.getPropertyValue('--text').trim(),
      });
      if (seen.length < 14) setTimeout(tick, 40);
      else resolve(seen);
    };
    tick();
  }));
}

test('换肤是逐色渐变：底色与圆角都在中途插值，而不是一帧跳过去', async ({ page }) => {
  await page.goto(`${PAGE}#paper+panel`);
  await expect(page.locator('html')).not.toHaveAttribute('data-booting', '');
  await expect(page.locator('html')).toHaveAttribute('data-style', 'paper');

  // 过渡表真的挂在这个元素上（18 个自定义属性，少一个就有某处仍是硬切）
  const table = await page.locator('html').evaluate((n) => getComputedStyle(n).transitionProperty);
  for (const prop of ['--bg', '--text', '--panel-bg', '--border-strong', '--panel-r']) {
    expect(table).toContain(prop);
  }

  const before = await page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    return { bg: cs.getPropertyValue('--bg').trim(), r: cs.getPropertyValue('--panel-r').trim() };
  });

  // 走真实的设置面板：纸白 → 点阵（不是直接改 dataset，那样测不到真实路径）
  await choose(page, 'style', 'grid');
  await expect(page.locator('html')).toHaveAttribute('data-style', 'grid');
  const seen = await sampleTransition(page);

  const bgs = [...new Set(seen.map((s) => s.bg))];
  const rs = [...new Set(seen.map((s) => s.r))];
  // 中途至少出现过一个"既不是起点也不是终点"的底色与圆角
  expect(bgs.length).toBeGreaterThan(2);
  expect(rs.length).toBeGreaterThan(2);

  // 圆角从 12px 慢慢收到 4px（点阵那套是见方四角），中途不许是两端的跳变
  const mid = seen.filter((s) => parseFloat(s.r) > 4.05 && parseFloat(s.r) < 11.95);
  expect(mid.length).toBeGreaterThan(2);

  // 走完之后落到点阵的终值
  const after = await page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    return { bg: cs.getPropertyValue('--bg').trim(), r: cs.getPropertyValue('--panel-r').trim() };
  });
  expect(after.r).toBe('4px');
  expect(after.bg).not.toBe(before.bg);

  // 最后一条：真的画出来了 —— 面板的 computed 圆角跟令牌一致（--panel-r 没被别的规则盖掉）
  const panelRadius = await page.locator('#panel').evaluate((n) => getComputedStyle(n).borderTopLeftRadius);
  expect(panelRadius).toBe('4px');
});

test('亮暗切换走同一条过场：字与底一起变，不是先黑底后黑字', async ({ page }) => {
  await page.goto(`${PAGE}#paper+panel`);
  await expect(page.locator('html')).not.toHaveAttribute('data-booting', '');

  // 跟随系统 → 常暗（真实点击：行 → 菜单项）
  await choose(page, 'dark', 'on');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const seen = await sampleTransition(page);

  // 亮底 → 暗底：中途必须出现"既不是浅色也不是深色"的中间色
  const bgs = [...new Set(seen.map((s) => s.bg))];
  expect(bgs.length).toBeGreaterThan(2);
  // 文字色同理（同一时长、同一条曲线：不允许"底已经黑了、字还黑着"）
  const texts = [...new Set(seen.map((s) => s.text))];
  expect(texts.length).toBeGreaterThan(2);
});

test('首屏不闪：按 hash 播种的那一次不过场，之后才恢复 420ms', async ({ page }) => {
  await page.goto(`${PAGE}#grid+dark+panel`);

  // 打开瞬间不该有自定义属性的过渡在跑
  const running = await page.evaluate(() => document.getAnimations()
    .filter((a) => a.transitionProperty && a.transitionProperty.startsWith('--')).length);
  expect(running).toBe(0);

  // 两帧之后脚本摘掉 data-booting，时长回到令牌里的那一个来源
  await expect(page.locator('html')).not.toHaveAttribute('data-booting', '');
  const dur = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--dur-theme').trim());
  expect(dur).toBe('420ms');
});

test('系统开了「减少动态效果」时，过场退化成直接切换', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`${PAGE}#paper+panel`);
  await expect(page.locator('html')).not.toHaveAttribute('data-booting', '');

  const dur = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--dur-theme').trim());
  expect(dur).toBe('0s');

  await choose(page, 'style', 'grid');
  await expect(page.locator('html')).toHaveAttribute('data-style', 'grid');
  // 归零之后没有过渡在跑，60ms 读到就是终值（--bg 与 --panel-r 同时落位）
  const snap = await page.evaluate(() => new Promise((resolve) => {
    setTimeout(() => {
      const cs = getComputedStyle(document.documentElement);
      resolve({
        r: cs.getPropertyValue('--panel-r').trim(),
        // 只数自定义属性那几条：行的 hover 背景也有 150ms 过渡，那是另一件事
        anims: document.getAnimations()
          .filter((a) => a.transitionProperty && a.transitionProperty.startsWith('--')).length,
      });
    }, 60);
  }));
  expect(snap.r).toBe('4px');
  expect(snap.anims).toBe(0);
});


test('畸形 hash 也不会把页面卡在「过场归零」：data-booting 由 finally 摘', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));

  // #% 是非法转义：decodeURIComponent 会抛 URIError（老一版会打断 init()）
  await page.goto(`${PAGE}#%`);

  // 这一条就是回归点：异常被吞掉，启动流程照样走到 finally
  await expect(page.locator('html')).not.toHaveAttribute('data-booting', '');
  const dur = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--dur-theme').trim());
  expect(dur).toBe('420ms');
  // 页面还是能用的：默认值落位、输入框拿到焦点
  await expect(page.locator('html')).toHaveAttribute('data-style', 'paper');
  await expect(page.locator('#q')).toBeFocused();
  expect(errors).toEqual([]);
});

/* ============================================================
   同步 Preview 之后新增的那几件事（用户 m00693）：
   二级菜单、引擎多选与轮切、自定义引擎、引导语参数、暖陶第三套皮肤、A3 过场。
   像素由上面的 newtab-*.png 钉住，这里钉的是行为。
   ============================================================ */

test('行按钮打开二级菜单：焦点进菜单，Esc 收起并把焦点还给那一行', async ({ page }) => {
  await page.goto(`${PAGE}#paper+panel`);
  const lead = page.locator('#lead');
  await lead.click();

  const menu = rowOf(page, 'lead');
  await expect(menu.locator('.menu')).toBeVisible();
  await expect(lead).toHaveAttribute('aria-expanded', 'true');
  // 当前选中项先拿到焦点，键盘能接着用
  await expect(menu.locator('.menu-opt[aria-selected="true"]')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(menu.locator('.menu-opt[data-value="prompt"]')).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(menu.locator('.menu')).toBeHidden();
  await expect(lead).toHaveAttribute('aria-expanded', 'false');
  await expect(lead).toBeFocused();
  // Esc 只收一层：菜单收起，面板还在
  await expect(page.locator('#panel')).toBeVisible();
});

test('引擎那行是多选：至少留一个，取消当前引擎会自动落到剩下那个', async ({ page }) => {
  await page.goto(`${PAGE}#paper+panel`);
  await page.locator('#engine').click();
  const menu = rowOf(page, 'engine');
  const bing = menu.locator('.menu-opt[data-value="bing"]');
  const google = menu.locator('.menu-opt[data-value="google"]');
  await expect(bing).toHaveAttribute('aria-selected', 'true');
  await expect(google).toHaveAttribute('aria-selected', 'true');

  // 取消 Google：菜单不关（这一行可以连着勾几个），标签仍是 Bing
  await google.click();
  await expect(google).toHaveAttribute('aria-selected', 'false');
  await expect(menu.locator('.menu')).toBeVisible();
  await expect(page.locator('#engine-tag')).toHaveText('Bing');

  // 只剩一个时再点它：不许把这一行点空
  await bing.click();
  await expect(bing).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#engine-tag')).toHaveText('Bing');

  // 勾回 Google，再点标签：只在"勾着的"里面轮切
  await google.click();
  await page.keyboard.press('Escape');
  await page.locator('#engine-tag').click();
  await expect(page.locator('#engine-tag')).toHaveText('Google');
  await expect(page.locator('#engine-value')).toHaveText('Google');

  // 取消 Bing 之后，标签再怎么点也不该轮回到它
  // （点页面别处会自动收起面板，所以先把面板重新打开）
  await page.locator('#settings').click();
  await page.locator('#engine').click();
  await bing.click();
  await page.keyboard.press('Escape');
  await page.locator('#engine-tag').click();
  await expect(page.locator('#engine-tag')).toHaveText('Google');
});

test('自定义引擎：地址必须含 %s 才能保存，保存后立刻成为当前引擎并真的用它搜索', async ({ page }) => {
  await page.goto(`${PAGE}#paper+panel`);
  await page.locator('#engine').click();
  await rowOf(page, 'engine').locator('.menu-opt[data-action="custom"]').click();

  const dlg = page.locator('#dlg-back');
  await expect(dlg).toBeVisible();
  await expect(page.locator('#dlg-save')).toBeDisabled();
  await expect(page.locator('#dlg-name')).toBeFocused();

  await page.fill('#dlg-name', '知乎');
  await expect(page.locator('#dlg-save')).toBeDisabled(); // 地址还没填
  // 故意只写域名：保存时补上 https://，否则会被当成本扩展内的相对路径（review 抓到的真缺口）
  await page.fill('#dlg-url', 'zhihu.com/search?q=%s');
  await expect(page.locator('#dlg-save')).toBeEnabled();
  await page.locator('#dlg-save').click();

  await expect(dlg).toBeHidden();
  await expect(page.locator('#engine-tag')).toHaveText('知乎');
  await expect(page.locator('#engine-value')).toHaveText('知乎');

  // 「自定义…」是动作项，不是选项：勾选只该落在上面那条真正的引擎上
  await page.locator('#engine').click();
  await expect(rowOf(page, 'engine').locator('.menu-opt[data-value="custom"]:not([data-action])')).toHaveAttribute('aria-selected', 'true');
  await expect(rowOf(page, 'engine').locator('.menu-opt[data-action="custom"]')).toHaveAttribute('aria-selected', 'false');
  await page.keyboard.press('Escape');

  // 真的用这个模板去搜（只拦下请求、不联网）
  const requested = [];
  await page.route(/^https?:\/\//, (route) => {
    requested.push(route.request().url());
    return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>stub</title>' });
  });
  await page.fill('#q', '天气');
  await page.press('#q', 'Enter');
  await expect
    .poll(() => requested.some((url) => url.startsWith('https://zhihu.com/search?q=')))
    .toBe(true);
  expect(requested.find((url) => url.includes('zhihu.com'))).toBe(
    `https://zhihu.com/search?q=${encodeURIComponent('天气')}`
  );
});

test('引导语参数：滑块即时改画面，松手才落盘，重开还在；回到默认值时不留行内样式', async ({ page }) => {
  await page.goto(`${PAGE}#paper+panel`);
  const mark = page.locator('#mark');

  // 令牌默认值：41px / 55px / 居中 / −12% / 0
  await expect(mark).toHaveCSS('font-size', '41px');
  await expect(rowOf(page, 'mark-size').locator('output')).toHaveText('41px');
  await expect(rowOf(page, 'mark-align').locator('output')).toHaveText('居中');

  await page.locator('#mark-size').fill('64');
  await expect(mark).toHaveCSS('font-size', '64px');
  await expect(rowOf(page, 'mark-size').locator('output')).toHaveText('64px');

  // 对齐档位 0 = 左缘：写的是 html[data-align]，不是行内样式
  await page.locator('#mark-align').fill('0');
  await expect(page.locator('html')).toHaveAttribute('data-align', 'start');
  await expect(rowOf(page, 'mark-align').locator('output')).toHaveText('左缘');

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#q')).toBeFocused();
  await expect(mark).toHaveCSS('font-size', '64px');
  await expect(page.locator('html')).toHaveAttribute('data-align', 'start');
  await expect(rowOf(page, 'mark-size').locator('output')).toHaveText('64px');

  // 拖回默认值：值等于令牌默认，就把行内样式清掉，重新归令牌管
  // （reload 会带着 hash，所以面板本来就是开着的）
  await expect(page.locator('#panel')).toBeVisible();
  await page.locator('#mark-size').fill('41');
  await page.locator('#mark-align').fill('1');
  await expect(mark).toHaveCSS('font-size', '41px');
  await expect(mark).not.toHaveAttribute('style', /font-size/);
  await expect(page.locator('html')).not.toHaveAttribute('data-align', 'start');
});

test('暖陶在发布形态里是第三套皮肤：奶油底 + 衬线引导语 + 12px 面板圆角', async ({ page }) => {
  await page.goto(`${PAGE}#clay+panel`);
  await expect(page.locator('html')).toHaveAttribute('data-style', 'clay');

  const bg = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--bg').trim());
  expect(bg).toBe('rgb(250, 249, 245)'); // DESIGN-claude.md 的 colors.canvas（#faf9f5，注册成 <color> 后按 rgb 读）
  await expect(page.locator('#panel')).toHaveCSS('border-top-left-radius', '12px');

  const family = await page.locator('#mark').evaluate((node) => getComputedStyle(node).fontFamily);
  expect(family).toContain('Source Han Serif');

  // 数字键 3 也到得了它（三套风格，快捷键跟着扩到 3）
  await page.goto(`${PAGE}#paper`);
  await expect(page.locator('#q')).toBeFocused();
  await page.locator('#q').blur();
  await page.keyboard.press('3');
  await expect(page.locator('html')).toHaveAttribute('data-style', 'clay');
});

test('换肤时引导语逐单元交叉淡入，落定后回到一整句', async ({ page }) => {
  await page.goto(`${PAGE}#paper+panel`);
  await expect(page.locator('#mark')).toHaveText('Type something');

  await choose(page, 'style', 'grid');

  // 拆成字素单元，两张脸叠着错峰淡入
  await expect(page.locator('#mark .mk-u').first()).toBeVisible();
  await expect(page.locator('#mark.is-flying')).toHaveCount(1);
  // 过场结束后把新脸提成唯一文本：不留 span、不留 --mk-face
  await expect(page.locator('#mark')).toHaveText('Type something');
  await expect(page.locator('#mark .mk-u')).toHaveCount(0);
  await expect(page.locator('#mark')).not.toHaveAttribute('style', /--mk-face/);
});
