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

// 6) 05 节：四种"整体一起换"的过场。
//    用页内 rAF 采样把中间态录下来（按真实时长 420ms、约 20ms 一帧），
//    断言四件事：谁在插值、换色点落在哪、以及"文字看不见的窗口"有多长。
//    最后这条是这一节的核心约束 —— 亮暗互换时墨迹与底色必然在某一刻撞上同一个灰度，
//    差别只在那一刻持续多久：D1 要它一闪而过，D2/D3 根本不让它出现。
const DARK_BG = 'rgb(24, 24, 24)';
const LIGHT_BG = 'rgb(249, 249, 249)';
const DUR = 420;
const STEP = 20;
const rgbOf = (s) => (s.match(/\d+/g) || []).map(Number);
const progress = (value, from, to) => {
  const a = rgbOf(from)[0];
  const b = rgbOf(to)[0];
  const v = rgbOf(value)[0];
  return b === a ? 0 : (v - a) / (b - a);
};
const lumOf = (s) => {
  const [r, g, b] = rgbOf(s);
  const f = (v) => {
    const n = v / 255;
    return n <= 0.03928 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const contrastOf = (a, b) => {
  const x = lumOf(a);
  const y = lumOf(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
const brightnessOf = (filter) => {
  const m = filter.match(/brightness\(([\d.]+)\)/);
  return m ? parseFloat(m[1]) : 1;
};
// 一次过场里"文字与底色的对比度掉到 2:1 以下"的总时长（毫秒）
// 主墨（--text，正文）与次墨（--text-2，设置行的标签）都要算 ——
// 只盯正文会漏掉"正文还行、行标签糊了"这种半糊状态（D2 翻转时机选错就长这样）。
const mudWindow = (tr, pick = (s) => s.text) => tr.out.reduce((sum, s, i) => {
  if (i === 0) return 0;
  return contrastOf(pick(s), s.bg) < 2 ? sum + (s.t - tr.out[i - 1].t) : sum;
}, 0);
const nearest = (tr, ms) => tr.out.reduce((best, s) => (Math.abs(s.t - ms) < Math.abs(best.t - ms) ? s : best), tr.out[0]);

check('05 节有四行样张（含对照的硬切）', (await page.$$('.demo')).length === 4);
check('每行各一张完整的脸（亮暗由容器决定）', (await page.$$('.demo .demo-face')).length === 4);
check('时长来自令牌 --dur-theme = 420ms',
  (await page.$eval('.demo', (el) => getComputedStyle(el).getPropertyValue('--dur-theme').trim())) === '420ms',
  await page.$eval('.demo', (el) => getComputedStyle(el).getPropertyValue('--dur-theme').trim()));
check('曲线来自令牌 --ease-mid',
  (await page.$eval('.demo[data-demo="d1"]', (el) => getComputedStyle(el).transitionTimingFunction)).includes('0.45'),
  await page.$eval('.demo[data-demo="d1"]', (el) => getComputedStyle(el).transitionTimingFunction.split(',')[0]));

const traces = await page.evaluate(async ({ step, count }) => {
  const q = (k) => document.querySelector(`.demo[data-demo="${k}"]`);
  const read = (el) => {
    const face = el.querySelector('.demo-face');
    const cs = getComputedStyle(face);
    return {
      bg: cs.backgroundColor,
      text: cs.color,
      muted: getComputedStyle(el.querySelector('.demo-rl')).color,
      filter: cs.filter,
      isDark: el.hasAttribute('data-dark'),
    };
  };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const trace = async (key) => {
    const el = q(key);
    document.querySelector('[data-reset]').click();
    await wait(150);
    const before = read(el);
    const t0 = performance.now();
    document.querySelector(`[data-flip="${key}"]`).click();
    const out = [];
    for (let i = 0; i <= count; i += 1) {
      while (performance.now() - t0 < i * step) await new Promise((r) => requestAnimationFrame(r));
      out.push({ t: Math.round(performance.now() - t0), ...read(el) });
    }
    const after = read(el);
    document.querySelector('[data-reset]').click();
    await wait(150);
    return { key, before, after, out };
  };
  const all = {};
  for (const key of ['d0', 'd1', 'd2', 'd3']) all[key] = await trace(key);
  return all;
}, { step: STEP, count: Math.round(DUR / STEP) + 2 });

const d0 = traces.d0;
const d1 = traces.d1;
const d2 = traces.d2;
const d3 = traces.d3;

// D0 硬切：一帧到位，全程没有中间值
check('D0 硬切：首帧即暗、背景自始至终只有一个取值',
  d0.out[0].bg === d0.after.bg && new Set(d0.out.map((s) => s.bg)).size === 1,
  `${d0.out[0].bg} / 共 ${new Set(d0.out.map((s) => s.bg)).size} 个取值`);
check('D0 的浅底/深底就是语义底色的两端',
  d0.before.bg === LIGHT_BG && d0.after.bg === DARK_BG, `${d0.before.bg} → ${d0.after.bg}`);

// D1 逐色渐变：材质与墨迹都在插值，且撞上同一灰度只在一瞬
const d1bg = new Set(d1.out.map((s) => s.bg)).size;
const d1text = new Set(d1.out.map((s) => s.text)).size;
const d1Cross = d1.out.reduce((best, s) => (contrastOf(s.text, s.bg) < contrastOf(best.text, best.bg) ? s : best), d1.out[0]);
check('D1 背景与文字都在走中间态',
  d1bg > 8 && d1text > 8, `背景 ${d1bg} 个取值 / 文字 ${d1text} 个取值`);
check('D1 撞上同一灰度发生在半程附近',
  Math.abs(d1Cross.t - DUR / 2) <= 80, `最接近的一帧在 ${d1Cross.t}ms（对比度 ${contrastOf(d1Cross.text, d1Cross.bg).toFixed(2)}:1）`);
check('D1 曲线两头慢、中间快（25% 时刻只走了不到 40%）',
  progress(nearest(d1, DUR * 0.25).bg, d1.before.bg, d1.after.bg) < 0.4,
  `${(progress(nearest(d1, DUR * 0.25).bg, d1.before.bg, d1.after.bg) * 100).toFixed(0)}%`);
check('D1 到点了两边都走完',
  Math.abs(progress(d1.out[d1.out.length - 1].bg, d1.before.bg, d1.after.bg) - 1) < 0.02 &&
  Math.abs(progress(d1.out[d1.out.length - 1].text, d1.before.text, d1.after.text) - 1) < 0.02,
  `背景 ${(progress(d1.out[d1.out.length - 1].bg, d1.before.bg, d1.after.bg) * 100).toFixed(0)}% / 文字 ${(progress(d1.out[d1.out.length - 1].text, d1.before.text, d1.after.text) * 100).toFixed(0)}%`);

// D2 中点翻转：材质插值、墨迹只有两个取值，且换的那一帧底色正在两端中点
const d2bg = new Set(d2.out.map((s) => s.bg)).size;
const d2Flip = d2.out.findIndex((s) => s.text === d2.after.text);
check('D2 材质走中间态、墨迹完全不插值',
  d2bg > 8 && new Set(d2.out.map((s) => s.text)).size === 2,
  `背景 ${d2bg} 个取值 / 文字 ${new Set(d2.out.map((s) => s.text)).size} 个取值`);
check('D2 墨迹在半程那一帧翻转',
  d2Flip > 0 && Math.abs(d2.out[d2Flip].t - DUR / 2) <= 45, `第 ${d2.out[d2Flip]?.t}ms`);
check('D2 翻转时底色正在两端中点（黑白两套字都不吃亏）',
  Math.abs(rgbOf(d2.out[d2Flip].bg)[0] - (rgbOf(LIGHT_BG)[0] + rgbOf(DARK_BG)[0]) / 2) <= 25,
  `底色 ${d2.out[d2Flip].bg}`);

// D3 曝光过场：颜色一步换掉，换色点落在亮度最低处
const d3bg = d3.out.map((s) => s.bg);
const d3Swap = d3bg.findIndex((bg) => bg === d3.after.bg);
const d3bright = d3.out.map((s) => brightnessOf(s.filter));
const d3Dip = d3bright.indexOf(Math.min(...d3bright));
check('D3 颜色是直接换的（只有两个取值）',
  new Set(d3bg).size === 2 && d3Swap > 0, `${new Set(d3bg).size} 段 / 换色在第 ${d3Swap} 帧`);
check('D3 换色点落在 45% 附近（420ms → 约 189ms）',
  d3Swap > 0 && Math.abs(d3.out[d3Swap].t - DUR * 0.45) <= 50, `${d3.out[d3Swap]?.t}ms`);
check('D3 换色那一刻画面还压着（先用亮度垫住，再换色）',
  d3Dip <= d3Swap && d3bright[d3Swap - 1] < 0.99 && d3bright[d3Swap] < 1,
  `前一帧 ${d3bright[d3Swap - 1]} / 当帧 ${d3bright[d3Swap]} / 最暗 ${d3bright[d3Dip]}@${d3Dip}`);
check('D3 收尾时亮度回到常态',
  brightnessOf(d3.out[d3.out.length - 1].filter) === 1, d3.out[d3.out.length - 1].filter);

// 这一节真正的验收线：四版都不许让文字"整段看不见"（正文与行标签都算）。
// 上限定在时长的 1/4（105ms ≈ 6 帧）：D1 那种"整体化开"必然会软一小段（实测正文 56ms、
// 行标签 77ms），而最早那版"材质先跑、墨迹延迟 30%"实测 139ms，就该被判掉。
const MUD_CAP = DUR * 0.25;
const mud = { d0: mudWindow(d0), d1: mudWindow(d1), d2: mudWindow(d2), d3: mudWindow(d3) };
const mudMuted = {
  d0: mudWindow(d0, (s) => s.muted),
  d1: mudWindow(d1, (s) => s.muted),
  d2: mudWindow(d2, (s) => s.muted),
  d3: mudWindow(d3, (s) => s.muted),
};
check('四版正文都没有"看不见"的窗口（对比度 2:1 以下的时长 < 时长 1/4）',
  Object.values(mud).every((ms) => ms < MUD_CAP),
  `d0 ${mud.d0}ms / d1 ${mud.d1}ms / d2 ${mud.d2}ms / d3 ${mud.d3}ms（上限 ${MUD_CAP}ms）`);
check('四版行标签（次墨）也没有"看不见"的窗口',
  Object.values(mudMuted).every((ms) => ms < MUD_CAP),
  `d0 ${mudMuted.d0}ms / d1 ${mudMuted.d1}ms / d2 ${mudMuted.d2}ms / d3 ${mudMuted.d3}ms（上限 ${MUD_CAP}ms）`);

// 慢放：只改一个值（--dur-theme），四种过场一起变慢
await page.click('[data-slow]');
await page.waitForTimeout(80);
const slowDur = await page.$$eval('.demo', (els) => els.map((el) => el.style.getPropertyValue('--dur-theme')));
check('慢放 ×3 = 1260ms，写在各样张上',
  slowDur.length === 4 && slowDur.every((v) => v === '1260ms'), slowDur.join(' / '));
await page.click('[data-slow]');
await page.waitForTimeout(80);
check('取消慢放后行内时长被摘掉',
  (await page.$$eval('.demo', (els) => els.map((el) => el.style.getPropertyValue('--dur-theme')))).every((v) => v === ''));

// 系统里关了动效：时长归零，于是四种都退化成"直接切换"
await page.emulateMedia({ reducedMotion: 'reduce' });
await page.waitForTimeout(60);
check('reduced-motion 下时长归零',
  (await page.$eval('.demo', (el) => getComputedStyle(el).getPropertyValue('--dur-theme').trim())) === '0s',
  await page.$eval('.demo', (el) => getComputedStyle(el).getPropertyValue('--dur-theme').trim()));
await page.click('[data-flip="d1"]');
await page.waitForTimeout(60);
check('reduced-motion 下 D1 直接到位（没有中间态）',
  (await page.$eval('.demo[data-demo="d1"] .demo-face', (el) => getComputedStyle(el).backgroundColor)) === DARK_BG,
  await page.$eval('.demo[data-demo="d1"] .demo-face', (el) => getComputedStyle(el).backgroundColor));
await page.emulateMedia({ reducedMotion: 'no-preference' });
await page.click('[data-reset]');

// 按钮与读数跟着走
await page.click('[data-flip="d1"]');
await page.waitForTimeout(60);
check('切换后行内读数变成"暗"', (await page.textContent('[data-state="d1"]')) === '暗', await page.textContent('[data-state="d1"]'));
await page.click('[data-reset]');
await page.waitForTimeout(60);
check('复位后四行读数都回到"亮"',
  (await page.$$eval('[data-state]', (els) => els.map((el) => el.textContent))).every((v) => v === '亮'));

// ============================================================
// 7) 06 节：面板与二级菜单的分层
//    用户 m01541 的原话是"菜单和选项的下拉菜单颜色基本一致，导致区分度不够"，
//    所以这一节的判据就是把区分度**量出来**：底板底色与菜单底的 WCAG 对比度。
//    五版手段各不相同，断言也必须按各自的手段写死，不能套一个通用阈值：
//      V0 现况        对比度正好 1.00（同色，只靠发丝线）—— 要修的那个
//      V1 再深一档    菜单 = 规范的 surface-cream-strong，比底板深
//      V2 退到画布档  菜单 = 规范的 canvas，比底板浅（与 V1 方向相反）
//      V3 投影        颜色故意不动（对比度仍是 1），分层只能来自 box-shadow
//      V4 换表面模式  菜单 = 暗面 #181715 + on-dark 字（对比度 > 8）
//      V5 就地展开    菜单不在浮层里，且把下面的行推开（面板变高）
//    再验暗色一档：勾上"暗色"六张一起走 —— 深色那边两者同为 #252320，问题一样。
// ============================================================
const LAY = (lay) => `.lay-demo[data-lay="${lay}"]`;
const layFacts = (lay) => page.$eval(LAY(lay), (el) => {
  const panel = el.querySelector('.lay-panel');
  const menu = el.querySelector('.lay-menu');
  const cs = getComputedStyle(menu);
  return {
    panelBg: getComputedStyle(panel).backgroundColor,
    menuBg: cs.backgroundColor,
    menuFg: getComputedStyle(menu.querySelector('.lay-opt.is-on')).color,
    pos: cs.position,
    shadow: cs.boxShadow,
    height: Math.round(panel.getBoundingClientRect().height),
    rows: el.querySelectorAll('.lay-row').length,
    opts: el.querySelectorAll('.lay-opt').length,
    checks: [...el.querySelectorAll('.lay-opt.is-on .lay-check')]
      .filter((c) => getComputedStyle(c).visibility === 'visible').length,
  };
});
const layRatio = (f) => contrastOf(f.panelBg, f.menuBg);

check('06 节有六张样张（V0 对照 + 五版）', (await page.$$('.lay-demo')).length === 6);
const v0 = await layFacts('v0');
check('六张样张结构相同（4 行 / 3 个选项 / 2 个勾）',
  [v0.rows, v0.opts, v0.checks].join() === '4,3,2', `${v0.rows} 行 / ${v0.opts} 项 / ${v0.checks} 勾`);
check('V0 就是你说的问题：底板与菜单同色（对比度 1.00）',
  v0.menuBg === v0.panelBg && layRatio(v0) === 1, `${v0.panelBg} vs ${v0.menuBg} → ${layRatio(v0).toFixed(2)}:1`);

const v1 = await layFacts('v1');
check('V1 菜单换成 surface-cream-strong #e8e0d2，比底板深一档',
  v1.menuBg === 'rgb(232, 224, 210)' && layRatio(v1) > 1.05,
  `${v1.panelBg} vs ${v1.menuBg} → ${layRatio(v1).toFixed(2)}:1`);
const v2 = await layFacts('v2');
check('V2 菜单退到画布档 #faf9f5，比底板浅（方向与 V1 相反）',
  v2.menuBg === 'rgb(250, 249, 245)' && layRatio(v2) > 1.1,
  `${v2.panelBg} vs ${v2.menuBg} → ${layRatio(v2).toFixed(2)}:1`);
const v3 = await layFacts('v3');
check('V3 颜色故意不动（仍是 1.00），分层只在 box-shadow 上',
  v3.menuBg === v3.panelBg && v3.shadow !== 'none' && /blur|px/.test(v3.shadow), v3.shadow);
check('V3 的投影是暖墨两层的候选令牌（含 8px 与 1px 两层）',
  v3.shadow.includes('8px') && v3.shadow.includes('1px'), v3.shadow);
const v4 = await layFacts('v4');
check('V4 菜单整块换暗面 #181715、字用 on-dark（对比度 > 8）',
  v4.menuBg === 'rgb(24, 23, 21)' && v4.menuFg === 'rgb(250, 249, 245)' && layRatio(v4) > 8,
  `${v4.panelBg} vs ${v4.menuBg} → ${layRatio(v4).toFixed(1)}:1，字 ${v4.menuFg}`);
const v5 = await layFacts('v5');
check('V5 不用浮层：菜单 position 不是 absolute', v5.pos !== 'absolute', v5.pos);
check('V5 就地展开把下面的行推开（面板比 V0 高 80px 以上）',
  v5.height > v0.height + 80, `V0 ${v0.height}px vs V5 ${v5.height}px`);

// 暗色一档：六张一起走
await page.click('[data-lay-dark]');
await page.waitForTimeout(80);
const dv0 = await layFacts('v0');
check('暗色：V0 在深色里同样同色（#252320，对比度 1.00）',
  dv0.menuBg === dv0.panelBg && dv0.panelBg === 'rgb(37, 35, 32)', `${dv0.panelBg} vs ${dv0.menuBg}`);
const dv1 = await layFacts('v1');
check('暗色：V1 菜单留在 elevated #252320、底板降一档到 soft #1f1e1b',
  dv1.menuBg === 'rgb(37, 35, 32)' && dv1.panelBg === 'rgb(31, 30, 27)' && layRatio(dv1) > 1.05,
  `${dv1.panelBg} vs ${dv1.menuBg} → ${layRatio(dv1).toFixed(2)}:1`);
const dv2 = await layFacts('v2');
check('暗色：V2 菜单退到 surface-dark #181715',
  dv2.menuBg === 'rgb(24, 23, 21)' && layRatio(dv2) > 1.05, `${dv2.panelBg} vs ${dv2.menuBg}`);
const dv3 = await layFacts('v3');
check('暗色：V3 与 V0 一样同色 —— 阴影在深色上确实不解决问题（已知短板）',
  dv3.menuBg === dv3.panelBg, `${dv3.panelBg} vs ${dv3.menuBg}`);
const dv4 = await layFacts('v4');
check('暗色：V4 的菜单仍是 #181715（"整块换表面"这件事在两种主题里都成立）',
  dv4.menuBg === 'rgb(24, 23, 21)' && layRatio(dv4) > 1.05, `${dv4.panelBg} vs ${dv4.menuBg}`);
const dv5 = await layFacts('v5');
check('暗色：V5 仍是就地展开（面板仍比 V0 高）', dv5.pos !== 'absolute' && dv5.height > dv0.height + 80,
  `V0 ${dv0.height}px vs V5 ${dv5.height}px`);
await page.click('[data-lay-dark]');
await page.waitForTimeout(80);
check('取消暗色后六张一起回到浅色',
  (await page.$$eval('.lay-demo', (els) => els.map((el) => el.hasAttribute('data-theme')))).every((v) => v === false));

check('无 console error / pageerror', errors.length === 0, errors.join(' | '));

await browser.close();
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.extra ? '  → ' + r.extra : ''}`);
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed} passed / ${failed} failed`);
process.exit(failed ? 1 : 0);
