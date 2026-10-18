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
    if (shot.includes('panel')) {
      await expect(page.locator('#panel')).toBeVisible(); // hash 里的 +panel 会在加载时展开面板
    } else {
      await expect(page.locator('#panel')).toBeHidden();
    }
    // 宫格已从定稿页删掉：任何镜头下都不该冒出快捷方式块
    await expect(page.locator('.tile')).toHaveCount(0);
    // 面板行数是有意锁住的（增删设置项必须同步改这里，免得悄悄少一行没人发现）
    await expect(page.locator('#panel .row')).toHaveCount(5);

    /* 打开就自动聚焦搜索框，所以除了 still 这一个镜头，其它镜头都按这个真实状态拍
       （line 档下这意味着底线是近黑的 —— 那是默认的样子，不是摆出来的）。 */
    if (shot.includes('still')) {
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

  await page.locator('#dark').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('#dark-value')).toHaveText('常暗');

  await page.locator('#dark').click();
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('#dark-value')).toHaveText('常亮');

  await page.locator('#dark').click();
  await expect(page.locator('#dark-value')).toHaveText('跟随系统'); // 三态闭环

  // 存过"常暗"之后重开：不该被 hash 或系统偏好压回去
  await page.locator('#dark').click();
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
  await page.locator('#dark').click(); // 跟随系统 → 常暗
  await page.locator('#dark').click(); // 常暗 → 常亮
  await expect(page.locator('#dark-value')).toHaveText('常亮');

  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'dark');
});

test('搜索框左侧元素真的会在放大镜与 ">" 之间换掉', async ({ page }) => {
  await page.goto(`${PAGE}#paper+panel`);

  await expect(page.locator('html')).toHaveAttribute('data-lead', 'icon');
  await expect(page.locator('.search .ico')).toBeVisible();
  await expect(page.locator('.search .prompt')).toBeHidden();

  await page.locator('#lead').click();

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
  await page.locator('#focus').click();
  await expect(page.locator('html')).toHaveAttribute('data-focus', 'hold');
  await page.locator('#q').focus();
  await page.waitForTimeout(250);
  const holdColor = await search.evaluate((node) => getComputedStyle(node).borderBottomColor);
  expect(holdColor).toBe(blurColor);
});

test('地址栏 hash 借来的风格不会落盘', async ({ page }) => {
  await page.goto(`${PAGE}#grid+dark+panel`);
  await expect(page.locator('html')).toHaveAttribute('data-style', 'grid');

  // 随便点一个无关设置：旧实现在这里会把 hash 借来的 grid+dark 一起存进去
  await page.locator('#engine').click();

  await page.goto(PAGE); // 不带 hash 再打开一次
  await expect(page.locator('html')).toHaveAttribute('data-style', 'paper');
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'dark');
});

test('手动改的左侧元素与焦点反馈，重开之后仍然生效', async ({ page }) => {
  await page.goto(`${PAGE}#paper+panel`);
  await expect(page.locator('html')).toHaveAttribute('data-lead', 'icon');

  await page.locator('#lead').click(); // 放大镜 → "> 提示符
  await page.locator('#focus').click(); // 深灰细线 → 不变
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
  await page.locator('#style').click();
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

  // 跟随系统 → 常暗（真实点击）
  await page.locator('#dark').click();
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

  await page.locator('#style').click();
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
