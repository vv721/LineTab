// 一次性探针：验「暖陶 的引导语（Type something）＋ 面板里那 5 个参数」接进
// Preview.html 之后是不是真的对 —— 结构、默认取值、参数生效，以及
// "只动了暖陶这一套"（纸白 / 点阵 与 真页面零件都没被碰）。
// 跑法：node tmp/check-lead.mjs（工作目录 newtab-extension）。用完即删。
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PAGE = pathToFileURL(path.join(ROOT, 'Preview.html')).href;

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

const open = async (hash = 'clay') => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(`${PAGE}#${hash}`);
  // 量几何前关掉过渡：滑块与对齐会动 transform / font-size，不等它走完会读到中间值。
  await page.addStyleTag({ content: '* { transition: none !important; }' });
  await page.waitForTimeout(250);
  return page;
};

// 整合之后只有一幅舞台：每套风格的状态靠设置面板里「风格」那一行切过去读，
// 元素在不在 DOM 里是一回事、看不看得见是另一回事（三套共用同一份 markup，取值各按自己的风格给）。
const stageFacts = page => page.evaluate(async () => {
  const out = {};
  const stage = document.querySelector('.stage');
  const styleRow = [...stage.querySelectorAll('.panel .row')]
    .find(r => r.querySelector('.rl').textContent === '风格');
  for (const s of ['paper', 'grid', 'clay']) {
    if (styleRow.querySelector('.menu').hidden) {
      styleRow.querySelector('.rv').click();
      await new Promise(r => setTimeout(r, 40));
    }
    styleRow.querySelector(`.menu-opt[data-value="${s}"]`).click();
    await new Promise(r => setTimeout(r, 60));
    const box = stage.querySelector('.fieldbox');
    const mark = stage.querySelector('.mark');
    const search = stage.querySelector('.search');
    out[s] = {
      marks: stage.querySelectorAll('.mark').length,
      markShown: mark.offsetParent !== null,
      ariaHidden: mark ? mark.getAttribute('aria-hidden') : null,
      markIsFirst: box?.firstElementChild?.classList.contains('mark') ?? false,
      markBeforeSearch: mark && search
        ? (mark.compareDocumentPosition(search) & Node.DOCUMENT_POSITION_FOLLOWING) > 0
        : null,
      boxTransform: getComputedStyle(box).transform,
      firstOrNull: box?.firstElementChild?.className ?? null,
      firstChildIsIco: search?.firstElementChild?.classList.contains('ico') ?? false,
      placeholder: stage.querySelector('.q')?.getAttribute('placeholder') ?? null,
      ariaLabel: stage.querySelector('.q')?.getAttribute('aria-label') ?? null,
      tag: stage.querySelector('.search .tag')?.textContent.trim() ?? null,
      hintCount: stage.querySelectorAll('.hint').length,
      rows: stage.querySelectorAll('.panel .row').length,
      rowsShown: [...stage.querySelectorAll('.panel .row')].filter(r => r.offsetParent !== null).length,
      paramsShown: [...stage.querySelectorAll('.row-param')].filter(r => r.offsetParent !== null).length,
      seps: stage.querySelectorAll('.panel .row-sep').length,
      sepShown: stage.querySelector('.row-sep').offsetParent !== null,
      hintCount: stage.querySelectorAll('.hint').length,
    };
  }
  // 循环最后停在暖陶（后面的段落默认按暖陶读）；面板全程开着，不用再管它
  return out;
});

const clayGeometry = page => page.evaluate(() => {
  const stage = document.querySelector('.stage');
  const mark = stage.querySelector('.mark');
  const line = stage.querySelector('.search');
  const box = stage.querySelector('.fieldbox');
  const m = mark.getBoundingClientRect();
  const l = line.getBoundingClientRect();
  const b = box.getBoundingClientRect();
  const ms = getComputedStyle(mark);
  return {
    size: ms.fontSize,
    weight: ms.fontWeight,
    spacing: ms.letterSpacing,
    color: ms.color,
    gap: Math.round(l.top - m.bottom),
    markCenter: Math.round((m.left + m.right) / 2),
    lineCenter: Math.round((l.left + l.right) / 2),
    markLeft: Math.round(m.left),
    markRight: Math.round(m.right),
    boxLeft: Math.round(b.left),
    boxRight: Math.round(b.right),
    boxTransform: getComputedStyle(box).transform,
    lineTransform: getComputedStyle(line).transform,
    inlineFontSize: mark.style.fontSize,
    inlineGap: mark.style.marginBottom,
    inlineBox: box.style.transform,
    inlineLine: line.style.transform,
    align: stage.getAttribute('data-align'),
    // 「整组竖直」读的是 .fieldbox 的 translateY
    groupShift: Number((getComputedStyle(box).transform.match(/matrix\(1, 0, 0, 1, 0, (-?[\d.]+)\)/) || [])[1] ?? 0),
  };
});

const clayParams = page => page.evaluate(() => {
  const stage = document.querySelector('.stage');
  const params = {};
  for (const i of stage.querySelectorAll('input[data-param]')) {
    params[i.dataset.param] = {
      min: i.min,
      max: i.max,
      step: i.step,
      value: i.value,
      out: (i.id && stage.querySelector(`output[for="${i.id}"]`)?.textContent.trim()) || null,
      label: (i.id && stage.querySelector(`label[for="${i.id}"]`)?.textContent.trim()) || null,
    };
  }
  // 「引导语对齐」这轮由二级下拉菜单改成了滑块（用户 m00768：版式控件统一成滑块），
  // 当前档显示在紧跟滑块的 output 里，行里不再有 .rv 按钮
  const alignRow = [...stage.querySelectorAll('.panel .row')]
    .find(r => r.querySelector('.rl')?.textContent.trim() === '引导语对齐');
  return {
    params,
    alignLabel: alignRow?.querySelector('output')?.textContent.trim() ?? null,
    alignRowLabel: alignRow?.querySelector('.rl')?.textContent.trim() ?? null,
    alignIsSlider: !!alignRow?.querySelector('input[type="range"]') && !alignRow?.querySelector('.rv'),
  };
});

const setParam = (page, param, value) => page.evaluate(([p, v]) => {
  const input = document.querySelector(`.stage input[data-param="${p}"]`);
  input.value = String(v);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}, [param, value]);

// ---------- A. 引导语：三套共用同一份 markup，各按自己的风格给字体与默认值（用户 m02895） ----------
let page = await open('clay+panel');
let facts = await stageFacts(page);
const STYLES3 = ['paper', 'grid', 'clay'];
check('三套都恰好一个引导语，并且真的看得见',
  STYLES3.every(s => facts[s].marks === 1 && facts[s].markShown === true),
  JSON.stringify(Object.fromEntries(STYLES3.map(s => [s, `${facts[s].marks}/${facts[s].markShown}`]))));
// 换肤那一拍（用户 m05145 的 A3）DOM 里短暂是"两张脸"，读完约 650ms 才收尾成一张 ——
// 所以要读的时候优先读新脸那一份，避免把"两张脸拼起来的文本"当成重复。
check('引导语就是 Type something',
  (await page.locator('.stage .mark').evaluate(el =>
    (el.querySelector('.is-new') ?? el).textContent)).trim() === 'Type something');
check('引导语对屏幕阅读器隐藏（aria-hidden）', facts.clay.ariaHidden === 'true', String(facts.clay.ariaHidden));
check('引导语是 .fieldbox 的第一个元素', facts.clay.markIsFirst === true, String(facts.clay.firstOrNull));
check('引导语排在搜索线之前（上下关系）', facts.clay.markBeforeSearch === true);
check('三套的整组竖直都往上抬（--mark-dy 各按自己的风格，都是负数）',
  STYLES3.every(s => /^matrix\(1, 0, 0, 1, 0, -/.test(facts[s].boxTransform)),
  JSON.stringify(Object.fromEntries(STYLES3.map(s => [s, facts[s].boxTransform]))));

// ---------- B. 默认取值 = 用户在实验室里挑定的那一组 ----------
let g = await clayGeometry(page);
check('默认字号 = 41px（令牌 --font-mark）', g.size === '41px', g.size);
check('默认标与线间隔 = 55px', Math.abs(g.gap - 55) <= 1, `${g.gap}px`);
check('默认整组竖直 = −12% 视口高（900 × 12% = 108px）', Math.abs(g.groupShift + 108) <= 1, `${g.groupShift}px`);
check('默认标与线同中轴（差 ≤1px）', Math.abs(g.markCenter - g.lineCenter) <= 1, `标 ${g.markCenter} / 线 ${g.lineCenter}`);
check('页面里已经没有那句提示行（用户 m03467 删掉了，三套都不该有）',
  STYLES3.every(s => facts[s].hintCount === 0),
  JSON.stringify(Object.fromEntries(STYLES3.map(s => [s, facts[s].hintCount]))));
check('字重 400（规范：display 不加粗）', g.weight === '400', g.weight);
check('带负字距（--ls-tight）', parseFloat(g.spacing) < 0, g.spacing);
check('颜色是主文字色（暖墨 #141413）', g.color === 'rgb(20, 20, 19)', g.color);

// ---------- C. 面板里那 5 行参数 ----------
let p = await clayParams(page);
check('三套 面板 = 真页面 5 行 + 参数 5 行', STYLES3.every(s => facts[s].rows === 10),
  JSON.stringify(Object.fromEntries(STYLES3.map(s => [s, facts[s].rows]))));
check('三套的 10 行全都看得见（参数行不再只活在暖陶）',
  STYLES3.every(s => facts[s].rowsShown === 10 && facts[s].paramsShown === 5),
  JSON.stringify(Object.fromEntries(STYLES3.map(s => [s, `${facts[s].rowsShown} 行 / 参数 ${facts[s].paramsShown} 行`]))));
check('分隔线也在三套里都看得见',
  STYLES3.every(s => facts[s].seps === 1 && facts[s].sepShown === true),
  JSON.stringify(Object.fromEntries(STYLES3.map(s => [s, `${facts[s].seps}/${facts[s].sepShown}`]))));
check('① 字号滑块 20–64、当前 41', p.params.size?.min === '20' && p.params.size?.max === '64' && p.params.size?.value === '41',
  JSON.stringify(p.params.size));
check('② 间隔滑块 0–72、当前 55', p.params.gap?.min === '0' && p.params.gap?.max === '72' && p.params.gap?.value === '55',
  JSON.stringify(p.params.gap));
check('③ 整组竖直滑块 −40–40（用户要求给更多上下空间）、当前 −12',
  p.params.dy?.min === '-40' && p.params.dy?.max === '40' && p.params.dy?.value === '-12', JSON.stringify(p.params.dy));
check('④ 搜索线偏移滑块 −120–120、当前 0',
  p.params.dx?.min === '-120' && p.params.dx?.max === '120' && p.params.dx?.value === '0', JSON.stringify(p.params.dx));
check('五个滑块的 step 都是 1',
  ['size', 'gap', 'align', 'dy', 'dx'].every(k => p.params[k]?.step === '1'));
check('每个滑块都有 label 关联',
  ['size', 'gap', 'align', 'dy', 'dx'].every(k => (p.params[k]?.label ?? '').length > 0),
  JSON.stringify(Object.fromEntries(['size', 'gap', 'align', 'dy', 'dx'].map(k => [k, p.params[k]?.label]))));
check('每行右侧都报出当前值（对齐这一格报的是档位名，不是数字）',
  p.params.size?.out === '41px' && p.params.gap?.out === '55px' && p.params.align?.out === '居中'
  && p.params.dy?.out === '-12%' && p.params.dx?.out === '0px',
  [p.params.size?.out, p.params.gap?.out, p.params.align?.out, p.params.dy?.out, p.params.dx?.out].join(' / '));
check('对齐这行是滑块（3 档，不是菜单），显示当前档「居中」，行标题「引导语对齐」',
  p.alignLabel === '居中' && p.alignRowLabel === '引导语对齐' && p.alignIsSlider === true,
  `${p.alignRowLabel} / ${p.alignLabel} / 滑块 ${p.alignIsSlider}`);
check('对齐滑块 min=0 max=2、当前停在正中间那一档',
  p.params.align?.min === '0' && p.params.align?.max === '2' && p.params.align?.value === '1',
  JSON.stringify(p.params.align));

// ---------- D. 参数真的生效 ----------
await setParam(page, 'size', 48);
await page.waitForTimeout(60);
g = await clayGeometry(page);
check('① 字号拉到 48 → 计算字号 48px', g.size === '48px', g.size);

await setParam(page, 'gap', 8);
await page.waitForTimeout(60);
g = await clayGeometry(page);
check('② 间隔拉到 8 → 实测间隔 8px', Math.abs(g.gap - 8) <= 1, `${g.gap}px`);

// 对齐改成滑块之后的驱动力：设 value + 派发 input，与真的拖动滑轨等价
const alignRowSel = '.stage .panel .row:has(.rl:text-is("引导语对齐"))';
const ALIGN_AT = { start: 0, center: 1, end: 2 };
const pickAlign = async value => {
  await setParam(page, 'align', ALIGN_AT[value]);
  await page.waitForTimeout(60);
};

await pickAlign('start');
g = await clayGeometry(page);
check('③ 对齐 → 左缘：标左缘与线左缘对齐（差 ≤1px）',
  g.align === 'start' && Math.abs(g.markLeft - g.boxLeft) <= 1, `${g.align}：标 ${g.markLeft} / 线框 ${g.boxLeft}`);
const alignText = await page.locator(`${alignRowSel} output`).textContent();
check('③ 从滑块选「左缘」后这一行的读数跟着变', alignText.trim() === '左缘', alignText.trim());

await pickAlign('end');
g = await clayGeometry(page);
check('③ 再选右缘：标右缘与线右缘对齐（差 ≤1px）',
  g.align === 'end' && Math.abs(g.markRight - g.boxRight) <= 1, `${g.align}：标 ${g.markRight} / 线框 ${g.boxRight}`);

await pickAlign('center');
g = await clayGeometry(page);
check('③ 选回「居中」，data-align 属性清掉', g.align === null, String(g.align));

await setParam(page, 'dy', -40);
await page.waitForTimeout(60);
g = await clayGeometry(page);
check('④ 整组竖直拉到 −40 → 上移 360px', Math.abs(g.groupShift + 360) <= 1, `${g.groupShift}px`);

await setParam(page, 'dx', -40);
await page.waitForTimeout(60);
g = await clayGeometry(page);
check('⑤ 搜索线偏移 −40 → 线中心 680', Math.abs(g.lineCenter - 680) <= 1, `${g.lineCenter}`);
check('⑤ 线偏移时标不动（标中心仍在 720）', Math.abs(g.markCenter - 720) <= 1, `${g.markCenter}`);

// 改回默认 → 行内样式必须被清掉（设计值仍然只来自 CSS / 令牌）
await setParam(page, 'size', 41);
await setParam(page, 'gap', 55);
await setParam(page, 'dy', -12);
await setParam(page, 'dx', 0);
await page.waitForTimeout(60);
g = await clayGeometry(page);
check('回到默认值后行内样式被清空（字号 / 间隔 / 整组 / 线）',
  g.inlineFontSize === '' && g.inlineGap === '' && g.inlineBox === '' && g.inlineLine === '',
  JSON.stringify({ size: g.inlineFontSize, gap: g.inlineGap, box: g.inlineBox, line: g.inlineLine }));

// ---------- E. 真页面零件没被碰 + 暗色 ----------
check('暖陶的放大镜仍在，且仍是搜索框第一格', facts.clay.firstChildIsIco === true);
check('框里没有占位文案（用户 m01021 第 1 条：引导语已经说了该说什么）',
  facts.clay.placeholder === null, String(facts.clay.placeholder));
check('可访问名仍是「搜索」（文案删了，读屏还得念得出来）', facts.clay.ariaLabel === '搜索', String(facts.clay.ariaLabel));
check('占位文案三套一致（都是空的）—— 内容不随皮肤变（用户 m03467）',
  facts.paper.placeholder === null && facts.grid.placeholder === null,
  `${facts.paper.placeholder} / ${facts.grid.placeholder}`);
check('右侧引擎标签仍是 Bing（句子大小写）', facts.clay.tag === 'Bing', String(facts.clay.tag));
check('纸白 / 点阵 的放大镜也没被引导语挤掉',
  facts.paper.firstChildIsIco === true && facts.grid.firstChildIsIco === true);
await page.close();

page = await open('clay+dark');
const darkMark = await page.evaluate(
  () => getComputedStyle(document.querySelector('.stage .mark')).color,
);
check('暗色下标 = 奶油白 #faf9f5', darkMark === 'rgb(250, 249, 245)', darkMark);
await page.close();

check('没有 console / page 错误', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
console.log(`\n${failures.length === 0 ? '全部通过' : '有失败项'}：${passed + failures.length} 项（通过 ${passed}，失败 ${failures.length}）`);
if (failures.length) {
  console.log(failures.map(f => `  - ${f}`).join('\n'));
  process.exitCode = 1;
}
