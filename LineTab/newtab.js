/* ============================================================
   新标签页的行为层：原生 JS、零依赖、零构建。
   运行时零网络请求 —— 只有你按下回车搜索时，浏览器才会离开本页。

   状态只有一个源（settings），所有变化都走 render*() 一个方向：
   settings → 页面。反过来（页面 → settings）只有事件处理里那几行写入。
   有状态的东西一共三样：五项设置（风格 / 引擎 / 左侧元素 / 焦点反馈 / 明暗）、
   引导语那 5 个排版参数、引擎清单（次序 / 参与轮切 / 自定义的那一条）。
   ============================================================ */
'use strict';

/* ---------- 1. 常量 ---------- */
const STORE_KEY = 'newtab.settings';
const DEFAULTS = {
  style: 'paper',        // 默认 纸白
  engine: 'bing',        // 当前搜索引擎
  lead: 'icon',          // 搜索框左侧元素：icon = 放大镜，prompt = ">" 提示符
  focus: 'line',         // 焦点反馈：line = 底线变文字色，hold = 界面不动（只靠光标指示）
  dark: null,            // 明暗三态：null = 跟随系统，true = 常暗，false = 常亮
  mark: null,            // 引导语参数：null = 全用令牌默认值（见 markBase）
  engines: null,         // 引擎清单：{ order, on, custom }，null = 内置两条都勾上
};

const ENGINES = {
  bing: { name: 'Bing', url: 'https://www.bing.com/search?q=' },
  google: { name: 'Google', url: 'https://www.google.com/search?q=' },
};

/* 三套皮肤：纸白 / 点阵 / 暖陶。暖陶从看稿页的探索里搬进正式区（用户 m00693）——
   令牌本来就在 tokens.css，缺的只是这张表里的一行。 */
const STYLES = [
  { id: 'paper', name: '纸白' },
  { id: 'grid', name: '点阵' },
  { id: 'clay', name: '暖陶' },
];

/* 左侧元素与焦点反馈：口味问题，都做成设置项，默认值就是定稿那一组 */
const LEADS = [
  { id: 'icon', name: '放大镜' },
  { id: 'prompt', name: '> 提示符' },
];

const FOCUSES = [
  { id: 'line', name: '深灰细线' },
  { id: 'hold', name: '不变' },
];

/* 明暗三态：存储里仍是 null / true / false（不加新键，老数据自动映射），
   面板上这三档 —— 「跟随系统」必须能从界面上回去。 */
const DARK_MODES = [
  { id: 'auto', name: '跟随系统' },
  { id: 'on', name: '常暗' },
  { id: 'off', name: '常亮' },
];

const SEARCH_PREFIX = { g: 'google', b: 'bing' }; // 输入 "g 关键词" 临时用 Google

/* 引导语那 5 个参数：键名、滑块量程、默认值（tokens.css 的 --mark-* 是设计取值来源，
   这里只是"读不到令牌时的兜底"与滑块量程）。对齐是三个档位、按空间顺序排。 */
const MARK_KEYS = ['size', 'gap', 'align', 'dy', 'dx'];
const MARK_ALIGNS = ['start', 'center', 'end'];
const MARK_ALIGN_LABELS = ['左缘', '居中', '右缘'];
const MARK_RANGES = {
  size: [20, 64],
  gap: [0, 72],
  dy: [-40, 40],
  dx: [-120, 120],
};
const MARK_FALLBACK = { size: 41, gap: 55, align: 'center', dy: -12, dx: 0 };

/* A3 · 换肤时引导语逐单元交叉淡入：拆字的几个阈值与两个时长比例 */
const FACE_SEG = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
/* 连写脚本不能按字素拆（拆开就断笔）：Arabic / Hebrew / Syriac / Thaana / Nko */
const FACE_CONNECTING = /[\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Syriac}\p{Script=Thaana}\p{Script=Nko}]/u;
const FACE_UNIT_MAX = 60;
const FACE_STEP_MAX = 26;
const FACE_RATIO = 0.6;
const FACE_FILL = 0.805;

const CHECK_SVG = '<svg class="menu-check" viewBox="0 0 24 24" fill="none" stroke="currentColor"'
  + ' stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
  + '<path d="M5 12.5l4.5 4.5L19 7"></path></svg>';

/* ---------- 2. 状态 ---------- */
let settings = Object.assign({}, DEFAULTS);

/* 地址栏 hash 摆出来的状态（挑风格 / 出图用）单独放：
   它只影响本次显示，绝不写进 settings，所以不会被任何一次 saveSettings() 顺手落盘。 */
const overrides = {};

/* 存储还没回来之前不接受写入。窗口只有几毫秒，但后果是"丢设置"：
   此时的 settings 还只是默认值，若把"默认值 + 刚点的那一项"整体写进存储，
   用户之前存过的其余设置就被抹掉了。所以写入只走 setSetting() 这一个口子。 */
let ready = false;

function setSetting(key, value) {
  if (!ready) return false;
  settings[key] = value;
  saveSettings();
  return true;
}

/* 引擎清单的三个可变部分。settings.engines 是它的存档形状（见 commitEngines）。 */
const engineState = {
  order: ['bing', 'google'],
  on: new Set(['bing', 'google']),
  custom: null,
};

/* 引导语参数：markBase 是令牌默认值（init 时从 computedStyle 读），
   markState 是"当前页面上真正生效的那一组"。两者相等时就不写行内样式。 */
let markBase = Object.assign({}, MARK_FALLBACK);
let markState = Object.assign({}, MARK_FALLBACK);
let markText = '';       // A3 拆字用的原文（换肤期间会被换成两张脸，之后要还原）
const params = new Map(); // key -> { input, output, canvas }

/* ---------- 2b. 存储 ----------
   正式运行（chrome-extension://）走 chrome.storage.sync，换台电脑也能带着设置。
   开发期直接开 newtab.html（file://）时没有 chrome.storage，就退回 localStorage，
   两条路径给上层完全一样的形状（读是异步的、写是同步发起的），调用方不用分叉。 */
const HAS_SYNC = typeof chrome !== 'undefined' && !!chrome.storage && !!chrome.storage.sync;

/* 两份存储都存同一个信封：{ savedAt: 毫秒时间戳, values: 设置 }。
   为什么要时间戳：sync 是异步的、还可能因配额失败，localStorage 镜像反而更新。
   读回时如果只看 sync，镜像里那次改动就永远丢了（而且不会自愈）——
   所以两份都记时间，拿较新的那份。旧版本存的是裸设置对象，normalize() 认它。 */
function normalize(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const values = raw.values && typeof raw.values === 'object' ? raw.values : raw;
  return { savedAt: Number(raw.savedAt) || 0, values };
}

function readLocal() {
  try {
    return normalize(JSON.parse(localStorage.getItem(STORE_KEY) || 'null'));
  } catch (err) {
    return null; // 存储被禁用（隐私模式等）或内容坏了
  }
}

function writeLocal(payload) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(payload));
  } catch (err) {
    /* 写不进去就算了：本次会话内仍然生效 */
  }
}

async function readSync() {
  if (!HAS_SYNC) return null;
  try {
    const got = await chrome.storage.sync.get(STORE_KEY);
    return normalize(got && got[STORE_KEY]);
  } catch (err) {
    console.warn('[LineTab] 读同步存储失败，用本地镜像顶上', err);
    return null;
  }
}

async function readStore() {
  const [local, synced] = [readLocal(), await readSync()];
  /* 只有一份就直接用它；两份都有就取时间较新的（同一毫秒时以 sync 为准）。 */
  const picked = !local ? synced : !synced ? local : synced.savedAt >= local.savedAt ? synced : local;
  return picked ? picked.values : null;
}

async function writeSync(payload) {
  if (!HAS_SYNC) return;
  try {
    await chrome.storage.sync.set({ [STORE_KEY]: payload });
  } catch (err) {
    /* 配额或策略问题：不弹窗打断输入；镜像带着更新的时间戳，下次加载会由它胜出 */
    console.warn('[LineTab] 写同步存储失败，等下次加载会用本地镜像', err);
  }
}

/* sync 有 120 次/分钟、1800 次/小时的写入配额。面板上是"点一下就存"，
   连点几下不该撞配额，所以把短时间内的多次写入合并成一次。 */
let writeTimer = null;

function saveSettings() {
  writeLocal({ savedAt: Date.now(), values: settings }); // 镜像立刻写：sync 慢或者失败时它兜底
  if (!HAS_SYNC) return;
  clearTimeout(writeTimer);
  writeTimer = setTimeout(() => {
    writeTimer = null;
    writeSync({ savedAt: Date.now(), values: settings });
  }, 200);
}

/* 合并窗口里关掉标签页 / 页面被藏起来时，把还没发出去的那次写入补上。
   （实测：改完设置 18ms 内关页，没有这一手就会丢掉那次改动。） */
function flushSync() {
  if (writeTimer === null) return;
  clearTimeout(writeTimer);
  writeTimer = null;
  writeSync({ savedAt: Date.now(), values: settings });
}

window.addEventListener('pagehide', flushSync);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flushSync();
});

function loadSettings() {
  return readStore().then((stored) => {
    const merged = Object.assign({}, DEFAULTS, stored);
    /* 存量清理：存过的风格可能已经被删掉（例如以前的 "mist"/"night"）。
       不校验的话页面会落回默认外观、面板却显示一个不存在的名字。 */
    if (!STYLES.some((style) => style.id === merged.style)) merged.style = DEFAULTS.style;
    if (!LEADS.some((lead) => lead.id === merged.lead)) merged.lead = DEFAULTS.lead;
    if (!FOCUSES.some((focus) => focus.id === merged.focus)) merged.focus = DEFAULTS.focus;
    if (merged.dark !== null && typeof merged.dark !== 'boolean') merged.dark = DEFAULTS.dark;
    return merged;
  });
}

/* 存档的引擎清单可能来自旧版本、也可能被手改坏：认不出来的值一律丢掉，
   自定义那条只有在"名字非空且地址含 %s"时才算数。 */
/* 地址只写域名（zhihu.com/...）时浏览器会当成本扩展内的相对路径，翻页直接失败。
   一律补 https:// —— "能保存"必须等于"能搜"。 */
function withScheme(url) {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(url) ? url : 'https://' + url;
}

function normalizeEngines(raw) {
  const valid = new Set(Object.keys(ENGINES));
  let custom = null;
  if (raw && raw.custom && typeof raw.custom === 'object') {
    const name = typeof raw.custom.name === 'string' ? raw.custom.name.trim() : '';
    const url = typeof raw.custom.url === 'string' ? withScheme(raw.custom.url.trim()) : '';
    if (name && url.includes('%s')) {
      custom = { name, url };
      valid.add('custom');
    }
  }
  const order = [];
  const add = (id) => {
    if (valid.has(id) && !order.includes(id)) order.push(id);
  };
  if (raw && Array.isArray(raw.order)) raw.order.forEach((id) => add(String(id)));
  add('bing');
  add('google');
  add('custom');
  const on = new Set();
  if (raw && Array.isArray(raw.on)) raw.on.forEach((id) => on.add(String(id)));
  const checked = order.filter((id) => on.has(id));
  if (!checked.length) order.forEach((id) => checked.push(id));
  return { order, on: new Set(checked), custom };
}

function normalizeMark(raw) {
  const out = Object.assign({}, markBase);
  if (!raw || typeof raw !== 'object') return out;
  for (const key of Object.keys(MARK_RANGES)) {
    const value = Number(raw[key]);
    if (!Number.isFinite(value)) continue;
    const [min, max] = MARK_RANGES[key];
    out[key] = Math.min(max, Math.max(min, value));
  }
  if (MARK_ALIGNS.includes(raw.align)) out.align = raw.align;
  return out;
}

/* ---------- 3. 元素 ---------- */
const el = {
  mark: document.getElementById('mark'),
  fieldbox: document.getElementById('fieldbox'),
  search: document.getElementById('search'),
  q: document.getElementById('q'),
  engineTag: document.getElementById('engine-tag'),
  settings: document.getElementById('settings'),
  panel: document.getElementById('panel'),
  engine: document.getElementById('engine'),
  engineValue: document.getElementById('engine-value'),
  lead: document.getElementById('lead'),
  leadValue: document.getElementById('lead-value'),
  focus: document.getElementById('focus'),
  focusValue: document.getElementById('focus-value'),
  dark: document.getElementById('dark'),
  darkValue: document.getElementById('dark-value'),
  style: document.getElementById('style'),
  styleValue: document.getElementById('style-value'),
  dlgBack: document.getElementById('dlg-back'),
  dlgName: document.getElementById('dlg-name'),
  dlgUrl: document.getElementById('dlg-url'),
  dlgCancel: document.getElementById('dlg-cancel'),
  dlgSave: document.getElementById('dlg-save'),
};

/* ---------- 4. 渲染（settings → 页面，单向） ---------- */
function nameOf(list, id) {
  const hit = list.find((item) => item.id === id);
  return hit ? hit.name : id;
}

function currentStyle() { return overrides.style || settings.style; }

function currentLead() { return overrides.lead || settings.lead; }

function currentFocus() { return overrides.focus || settings.focus; }

function currentDarkMode() {
  if (typeof overrides.dark === 'boolean') return overrides.dark ? 'on' : 'off';
  if (settings.dark === null) return 'auto';
  return settings.dark ? 'on' : 'off';
}

function currentDark() {
  const mode = currentDarkMode();
  if (mode === 'auto') return window.matchMedia('(prefers-color-scheme: dark)').matches;
  return mode === 'on';
}

/* 这一行当前选的是哪个值 —— 菜单的 ✓ 与行尾的文字都从这里取 */
function currentValue(key) {
  if (key === 'engine') return settings.engine;
  if (key === 'lead') return currentLead();
  if (key === 'focus') return currentFocus();
  if (key === 'dark') return currentDarkMode();
  return currentStyle();
}

function paintStyle(animate) {
  const next = currentStyle();
  const root = document.documentElement;
  /* A3：换肤的那一次要把旧脸先冻住，所以播放函数必须在 dataset.style 换掉**之前**拿；
     首屏（data-booting）与 reduced-motion 下 beginFaceSwitch() 返回 null，退化成直切。 */
  const play = animate && root.dataset.style !== next && !root.hasAttribute('data-booting')
    ? beginFaceSwitch()
    : null;
  root.dataset.style = next;
  if (play) play();
  el.styleValue.textContent = nameOf(STYLES, next);
  paintMenu('style');
}

function paintDark() {
  const isDark = currentDark();
  if (isDark) document.documentElement.dataset.theme = 'dark';
  else delete document.documentElement.dataset.theme;
  el.darkValue.textContent = nameOf(DARK_MODES, currentDarkMode());
  paintMenu('dark');
}

function paintEngine() {
  const name = engineName(settings.engine);
  el.engineValue.textContent = name;
  /* 标签里写"内容"（句子形 Bing），大小写由 CSS 按皮肤给 */
  el.engineTag.textContent = name;
  el.engineTag.setAttribute('aria-label', '切换搜索引擎，当前 ' + name);
  paintMenu('engine');
}

function paintLead() {
  const lead = currentLead();
  document.documentElement.dataset.lead = lead;
  el.leadValue.textContent = nameOf(LEADS, lead);
  paintMenu('lead');
}

function paintFocus() {
  const focus = currentFocus();
  document.documentElement.dataset.focus = focus;
  el.focusValue.textContent = nameOf(FOCUSES, focus);
  paintMenu('focus');
}

function renderAll() {
  paintStyle(false);
  paintEngine();
  paintLead();
  paintFocus();
  paintDark();
  paintParams();
  renderMark();
}

/* ---------- 4b. 引导语参数 ---------- */
function num(style, name, fallback) {
  const value = Number.parseFloat(style.getPropertyValue(name));
  return Number.isFinite(value) ? value : fallback;
}

/* 设计取值只有一个来源：令牌。滑块不另存一份默认值，开局直接问 computedStyle。 */
function readMarkDefaults() {
  const cs = getComputedStyle(document.documentElement);
  return {
    size: num(cs, '--mark-size', MARK_FALLBACK.size),
    gap: num(cs, '--mark-gap', MARK_FALLBACK.gap),
    align: 'center',
    dy: num(cs, '--mark-dy', MARK_FALLBACK.dy),
    dx: num(cs, '--mark-dx', MARK_FALLBACK.dx),
  };
}

function renderMark() {
  const same = (key) => markState[key] === markBase[key];
  el.mark.style.fontSize = same('size') ? '' : markState.size + 'px';
  el.mark.style.marginBottom = same('gap') ? '' : markState.gap + 'px';
  el.fieldbox.style.transform = same('dy') ? '' : 'translateY(' + markState.dy + 'vh)';
  el.search.style.transform = same('dx') ? '' : 'translateX(' + markState.dx + 'px)';
  if (markState.align === 'center') document.documentElement.removeAttribute('data-align');
  else document.documentElement.setAttribute('data-align', markState.align);
}

function readParam(key) {
  const param = params.get(key);
  if (!param) return;
  const value = Number(param.input.value);
  if (key === 'align') {
    markState.align = MARK_ALIGNS[value] || 'center';
  } else {
    markState[key] = value;
  }
}

function paintParam(key) {
  const param = params.get(key);
  if (!param) return;
  const value = Number(param.input.value);
  const min = Number(param.input.min);
  const max = Number(param.input.max);
  const span = max - min || 1;
  param.canvas.style.setProperty('--slider-frac', String((value - min) / span));
  if (key === 'align') param.output.textContent = MARK_ALIGN_LABELS[value] || '';
  else if (key === 'dy') param.output.textContent = value + '%';
  else param.output.textContent = value + 'px';
}

function paintParams() {
  for (const [key, param] of params) {
    const current = key === 'align' ? Math.max(0, MARK_ALIGNS.indexOf(markState.align)) : markState[key];
    param.input.value = String(current);
    paintParam(key);
  }
}

/* 滑块自己画：原生 input 铺满画布只留命中/拖动/键盘身位，
   看得见的轨道与滑块头是 .sl 的伪元素与 .knob —— 三者共用 --slider-frac 一条算式。 */
function initParams() {
  for (const input of document.querySelectorAll('[data-param]')) {
    const key = input.dataset.param;
    const canvas = document.createElement('span');
    canvas.className = 'sl';
    const knob = document.createElement('span');
    knob.className = 'knob';
    knob.setAttribute('aria-hidden', 'true');
    input.replaceWith(canvas);
    canvas.append(input, knob);
    const output = canvas.parentElement.querySelector('output');
    params.set(key, { input, output, canvas });
    input.addEventListener('input', () => {
      readParam(key);
      paintParam(key);
      renderMark();
    });
    /* 拖的时候只画，松手（change）才落盘：一次拖动会发几十个 input 事件，
       每个都写一次存储会白撞 sync 的配额。 */
    input.addEventListener('change', saveMark);
  }
}

function saveMark() {
  const same = MARK_KEYS.every((key) => markState[key] === markBase[key]);
  setSetting('mark', same ? null : Object.assign({}, markState));
}

/* ---------- 4c. A3 · 换肤时引导语逐单元交叉淡入 ---------- */
let faceTimer = 0;
let faceGen = 0;

/* 把一段文本拆成"两张脸都能用"的单元：空白留作文本节点、其余每个字素一个 span.
   连写脚本会被整段留在一个 span 里吗？不会——是否拆字是调用方按 FACE_CONNECTING 先判的。 */
function faceUnits(text) {
  const units = [];
  let count = 0;
  for (const part of FACE_SEG.segment(text)) {
    if (/^\s+$/.test(part.segment)) {
      units.push(document.createTextNode(part.segment));
      continue;
    }
    const span = document.createElement('span');
    span.className = 'mk-u';
    span.style.setProperty('--i', String(count));
    span.textContent = part.segment;
    units.push(span);
    count += 1;
  }
  return { units, count };
}

function finishFaceSwitch() {
  if (faceTimer) {
    clearTimeout(faceTimer);
    faceTimer = 0;
  }
  faceGen += 1;
  el.mark.classList.remove('is-flying', 'is-plain');
  el.mark.textContent = markText;
  el.mark.style.removeProperty('--mk-face');
  el.mark.style.removeProperty('--mk-step');
}

/* 返回 null = 这次不做过场（首屏 / 时长归零 / 没有原文），调用方直接换皮肤。 */
function beginFaceSwitch() {
  if (faceTimer) finishFaceSwitch();
  const world = num(getComputedStyle(el.mark), '--dur-theme', 0);
  if (!(world > 0) || !markText) return null;

  const gen = faceGen;
  const oldFace = document.createElement('span');
  oldFace.className = 'mk-face is-old';
  /* 旧脸必须把"换肤前"的字体钉住：dataset.style 一换，它继承的 --font-display 立刻变了 */
  oldFace.style.fontFamily = getComputedStyle(el.mark).fontFamily;

  const oldUnits = faceUnits(markText);
  const newUnits = faceUnits(markText);
  const split = newUnits.count > 1 && newUnits.count <= FACE_UNIT_MAX && !FACE_CONNECTING.test(markText);

  el.mark.textContent = '';
  el.mark.classList.toggle('is-plain', !split);
  oldFace.append(...oldUnits.units);

  const newFace = document.createElement('span');
  newFace.className = 'mk-face is-new';
  newFace.append(...newUnits.units);
  el.mark.append(oldFace, newFace);

  const face = world * FACE_RATIO;
  const step = split ? Math.min(FACE_STEP_MAX, (world * FACE_FILL) / Math.max(1, newUnits.count - 1)) : 0;
  el.mark.style.setProperty('--mk-face', face + 'ms');
  el.mark.style.setProperty('--mk-step', step + 'ms');

  return () => {
    el.mark.getBoundingClientRect(); // 强制 reflow：让"起点"这一帧先成立，再开始动
    requestAnimationFrame(() => {
      if (gen !== faceGen) return;   // 期间已经收尾 / 又换了一次皮肤
      el.mark.classList.add('is-flying');
      const span = face + Math.max(0, step * (newUnits.count - 1));
      faceTimer = window.setTimeout(finishFaceSwitch, span + 60);
    });
  };
}

/* ---------- 5. 搜索 ---------- */
function engineName(id) {
  if (id === 'custom') return engineState.custom ? engineState.custom.name : '自定义';
  return ENGINES[id] ? ENGINES[id].name : id;
}

function engineById(id) {
  if (id === 'custom') return engineState.custom;
  return ENGINES[id] || ENGINES[DEFAULTS.engine];
}

function submitSearch(event) {
  event.preventDefault();
  const raw = el.q.value.trim();
  if (!raw) return;

  // "g 关键词" / "b 关键词"：临时换引擎，不改默认设置
  const parts = raw.split(/\s+/);
  let engineId = settings.engine;
  let query = raw;
  if (parts.length > 1 && SEARCH_PREFIX[parts[0].toLowerCase()]) {
    engineId = SEARCH_PREFIX[parts[0].toLowerCase()];
    query = parts.slice(1).join(' ');
  }

  const engine = engineById(engineId);
  if (!engine) return;
  const word = encodeURIComponent(query);
  window.location.href = engine.url.includes('%s') ? engine.url.replace('%s', word) : engine.url + word;
}

/* ---------- 6. 设置面板与二级菜单 ---------- */
const ROW_KEYS = ['engine', 'lead', 'focus', 'dark', 'style'];
const rows = new Map();
let openMenuKey = null;

function menuOptions(key) {
  if (key === 'engine') {
    const list = engineState.order.map((id) => ({ value: id, label: engineName(id) }));
    /* "自定义…"永远是最后一条动作项：自定义引擎已经存在时，上面那条才是可勾的选项 */
    list.push({ value: 'custom', label: '自定义…', action: true });
    return list;
  }
  if (key === 'lead') return LEADS.map((item) => ({ value: item.id, label: item.name }));
  if (key === 'focus') return FOCUSES.map((item) => ({ value: item.id, label: item.name }));
  if (key === 'dark') return DARK_MODES.map((item) => ({ value: item.id, label: item.name }));
  return STYLES.map((item) => ({ value: item.id, label: item.name }));
}

function paintMenu(key) {
  const item = rows.get(key);
  if (!item) return;
  const value = currentValue(key);
  for (const option of item.menu.querySelectorAll('.menu-opt')) {
    /* 动作项（「自定义…」）开的是弹窗、不是选项，永远不可能是"选中" */
    const selected = !option.dataset.action && (key === 'engine'
      ? engineState.on.has(option.dataset.value)
      : option.dataset.value === value);
    option.setAttribute('aria-selected', String(selected));
  }
}

function rebuildMenu(key) {
  const item = rows.get(key);
  if (!item) return;
  item.menu.textContent = '';
  for (const option of menuOptions(key)) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'menu-opt';
    button.setAttribute('role', 'option');
    button.setAttribute('aria-selected', 'false');
    button.dataset.value = option.value;
    if (option.action) button.dataset.action = option.value;
    const label = document.createElement('span');
    label.textContent = option.label;
    button.insertAdjacentHTML('beforeend', CHECK_SVG);
    button.prepend(label);
    if (option.action) {
      button.addEventListener('click', () => openDialog(item.btn));
    } else {
      button.addEventListener('click', () => selectOption(key, option.value));
    }
    item.menu.append(button);
  }
  paintMenu(key);
}

function openMenu(key, moveFocus = true) {
  const item = rows.get(key);
  if (!item) return;
  if (openMenuKey && openMenuKey !== key) closeMenus();
  closeDialog(false);
  item.menu.hidden = false;
  item.btn.setAttribute('aria-expanded', 'true');
  openMenuKey = key;
  if (moveFocus) {
    const selected = item.menu.querySelector('.menu-opt[aria-selected="true"]')
      || item.menu.querySelector('.menu-opt');
    if (selected) selected.focus();
  }
}

function closeMenus() {
  if (!openMenuKey) return;
  const item = rows.get(openMenuKey);
  if (item) {
    item.menu.hidden = true;
    item.btn.setAttribute('aria-expanded', 'false');
  }
  openMenuKey = null;
}

/* 面板里的焦点：行按钮还在（面板开着）就还给它，否则退回设置按钮 */
function focusRow(key) {
  const btn = el[key];
  if (btn && btn.offsetParent !== null) btn.focus();
  else el.settings.focus();
}

function selectOption(key, value) {
  if (key === 'engine') {
    toggleEngine(value);
    return; // 引擎那行可以连着勾几个，菜单不关
  }
  if (key === 'lead') {
    if (setSetting('lead', value)) {
      delete overrides.lead;
      paintLead();
    }
  } else if (key === 'focus') {
    if (setSetting('focus', value)) {
      delete overrides.focus;
      paintFocus();
    }
  } else if (key === 'dark') {
    const next = { auto: null, on: true, off: false }[value];
    if (setSetting('dark', next)) {
      delete overrides.dark;
      paintDark();
    }
  } else if (key === 'style') {
    if (setSetting('style', value)) {
      delete overrides.style;   // 手动选了风格，hash 借来的风格就此失效
      paintStyle(true);
    }
  }
  closeMenus();
  focusRow(key);
}

function commitEngines() {
  if (!ready) return;
  settings.engines = {
    order: engineState.order.slice(),
    on: [...engineState.on],
    custom: engineState.custom,
  };
  saveSettings();
}

function toggleEngine(value) {
  const on = engineState.on;
  if (on.has(value)) {
    if (on.size <= 1) return;   // 至少留一个：否则这一行成了空菜单
    on.delete(value);
  } else {
    on.add(value);
  }
  if (!on.has(settings.engine)) {
    settings.engine = engineState.order.find((id) => on.has(id)) || value;
    commitEngines();
    setSetting('engine', settings.engine);
  } else {
    commitEngines();
  }
  paintEngine();
}

function reorderEngine(value, to) {
  const order = engineState.order;
  const from = order.indexOf(value);
  if (from < 0 || from === to) return;
  order.splice(from, 1);
  order.splice(Math.max(0, Math.min(order.length, to)), 0, value);
  commitEngines();
  rebuildMenu('engine');
  paintMenu('engine');
}

function rotateEngine(step) {
  const pool = engineState.order.filter((id) => engineState.on.has(id));
  if (!pool.length) return;
  const index = pool.indexOf(settings.engine);
  const next = pool[(index + step + pool.length) % pool.length];
  if (!setSetting('engine', next)) return;
  paintEngine();
}

/* 菜单里的键盘：上下 / Home / End 在选项间走，引擎那行 Alt+↑↓ 调整次序 */
function onMenuKeydown(item, event) {
  const options = [...item.menu.querySelectorAll('.menu-opt')];
  const index = options.indexOf(document.activeElement);

  if (event.altKey && item.key === 'engine' && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
    event.preventDefault();
    const option = options[index];
    if (!option || option.dataset.action) return;
    const from = engineState.order.indexOf(option.dataset.value);
    const to = from + (event.key === 'ArrowUp' ? -1 : 1);
    if (to < 0 || to >= engineState.order.length) return;
    reorderEngine(option.dataset.value, to);
    const moved = item.menu.querySelector('.menu-opt[data-value="' + option.dataset.value + '"]:not([data-action])');
    if (moved) moved.focus();
    return;
  }

  let next = null;
  if (event.key === 'ArrowDown') next = options[(index + 1 + options.length) % options.length];
  else if (event.key === 'ArrowUp') next = options[(index - 1 + options.length) % options.length];
  else if (event.key === 'Home') next = options[0];
  else if (event.key === 'End') next = options[options.length - 1];
  if (!next) return;
  event.preventDefault();
  next.focus();
}

/* 拖动排序：只认引擎那张清单，平时只有 grab 光标（用户 m01021：别做得生硬） */
function bindEngineDrag(item) {
  let drag = null;
  let swallowClick = false;

  const clearMarks = () => {
    for (const option of item.menu.querySelectorAll('.menu-opt')) {
      option.classList.remove('is-drop-before', 'is-drop-after');
    }
  };

  const dropTarget = (y) => {
    const options = [...item.menu.querySelectorAll('.menu-opt:not([data-action])')];
    for (let i = 0; i < options.length; i += 1) {
      const rect = options[i].getBoundingClientRect();
      if (y < rect.top + rect.height / 2) return { index: i, after: false, option: options[i] };
    }
    const last = options[options.length - 1];
    return last ? { index: options.length - 1, after: true, option: last } : null;
  };

  /* 松手那一下浏览器还会补一个 click：不吞掉的话，刚拖完的选项又会被"点"一次 */
  item.menu.addEventListener('click', (event) => {
    if (!swallowClick) return;
    swallowClick = false;
    event.preventDefault();
    event.stopPropagation();
  }, true);

  item.menu.addEventListener('pointerdown', (event) => {
    const option = event.target.closest('.menu-opt');
    if (!option || option.dataset.action || event.button !== 0) return;
    drag = { option, value: option.dataset.value, y: event.clientY, active: false };
  });

  item.menu.addEventListener('pointermove', (event) => {
    if (!drag) return;
    if (!drag.active) {
      if (Math.abs(event.clientY - drag.y) < 4) return;   // 4px 以内仍是"点"
      drag.active = true;
      swallowClick = true;
      drag.option.classList.add('is-dragging');
      try {
        drag.option.setPointerCapture(event.pointerId);
      } catch (err) {
        /* 没有 pointer capture 也能拖，只是指针离开菜单就断 */
      }
    }
    const target = dropTarget(event.clientY);
    clearMarks();
    if (target) {
      target.option.classList.add(target.after ? 'is-drop-after' : 'is-drop-before');
    }
  });

  const finish = (event) => {
    if (!drag) return;
    const { option, value, active } = drag;
    const target = active ? dropTarget(event.clientY) : null;
    option.classList.remove('is-dragging');
    clearMarks();
    drag = null;
    if (!active || !target) return;
    let to = target.index + (target.after ? 1 : 0);
    const from = engineState.order.indexOf(value);
    if (from < to) to -= 1;
    reorderEngine(value, to);
    const moved = item.menu.querySelector('.menu-opt[data-value="' + value + '"]:not([data-action])');
    if (moved) moved.focus();
  };

  item.menu.addEventListener('pointerup', finish);
  item.menu.addEventListener('pointercancel', () => {
    if (!drag) return;
    drag.option.classList.remove('is-dragging');
    clearMarks();
    drag = null;
  });
}

function initMenus() {
  for (const key of ROW_KEYS) {
    const btn = el[key];
    const row = btn.closest('.row');
    const label = row.querySelector('.rl');
    const menu = document.createElement('div');
    menu.className = key === 'engine' ? 'menu menu-engine' : 'menu';
    menu.hidden = true;
    menu.setAttribute('role', 'listbox');
    menu.setAttribute('aria-label', label ? label.textContent.trim() : key);
    if (key === 'engine') menu.setAttribute('aria-multiselectable', 'true');
    row.append(menu);

    const item = { key, btn, row, menu };
    rows.set(key, item);
    rebuildMenu(key);

    btn.addEventListener('click', () => {
      if (openMenuKey === key) {
        closeMenus();
        return;
      }
      openMenu(key);
    });
    menu.addEventListener('keydown', (event) => onMenuKeydown(item, event));
    if (key === 'engine') bindEngineDrag(item);
  }
}

/* ---------- 7. 自定义搜索引擎弹窗 ---------- */
let dlgReturn = null;

function validateDialog() {
  const name = el.dlgName.value.trim();
  el.dlgSave.disabled = !(name && el.dlgUrl.value.includes('%s'));
}

function openDialog(from, moveFocus = true) {
  closeMenus();
  dlgReturn = from || null;
  el.dlgBack.hidden = false;
  el.dlgName.value = engineState.custom ? engineState.custom.name : '';
  el.dlgUrl.value = engineState.custom ? engineState.custom.url : '';
  validateDialog();
  if (moveFocus) el.dlgName.focus();
  else if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
}

function closeDialog(returnFocus = true) {
  if (el.dlgBack.hidden) return;
  el.dlgBack.hidden = true;
  if (!returnFocus) return;
  if (dlgReturn && dlgReturn.offsetParent !== null) dlgReturn.focus();
  else el.settings.focus();   // 开弹窗那一行已经不在了：交回齿轮，别把光标塞回搜索框
}

function saveDialog() {
  if (el.dlgSave.disabled) return;
  const name = el.dlgName.value.trim();
  const url = withScheme(el.dlgUrl.value.trim());
  if (!name || !url.includes('%s')) return;
  engineState.custom = { name, url };
  if (!engineState.order.includes('custom')) engineState.order.push('custom');
  engineState.on.add('custom');
  settings.engine = 'custom';
  commitEngines();
  setSetting('engine', 'custom');
  rebuildMenu('engine');
  paintEngine();
  closeDialog();
}

/* ---------- 8. 面板、快捷键、启动 ---------- */
function openPanel(open) {
  el.panel.hidden = !open;
  el.settings.setAttribute('aria-expanded', String(open));
  if (open) return;
  /* 焦点快照必须在 closeMenus() 之前取：收菜单会先把焦点所在的菜单项 hidden 掉，
     那之后 document.activeElement 可能已经不是面板里的元素（随浏览器 fixup 时机变）。 */
  const focusInPanel = el.panel.contains(document.activeElement);
  closeMenus();
  /* 关面板时焦点正停在面板里的某个按钮上，它会跟着 hidden 一起消失、掉到 body。
     交回给打开面板的齿轮按钮 —— 这是「焦点从哪来回哪去」，不是把光标塞回搜索框
     （用户 m01157：光标的来源只该有两种，新标签页自动、点搜索框）。 */
  if (focusInPanel) el.settings.focus();
}

function bindEvents() {
  el.search.addEventListener('submit', submitSearch);

  el.settings.addEventListener('click', () => openPanel(el.panel.hidden));

  /* 点空白处：先收菜单，再收面板。行按钮与菜单项自己管自己，所以先放过它们。 */
  document.addEventListener('click', (event) => {
    const target = event.target;
    if (el.dlgBack.contains(target)) return;
    if (target.closest('.menu')) return;
    if (target.closest('.rv')) return;
    closeMenus();
    if (el.panel.hidden) return;
    if (el.panel.contains(target) || el.settings.contains(target)) return;
    openPanel(false);
  });

  /* 引擎标签 = 轮切开关：点一下走到下一个勾着的引擎。
     点它不搬焦点：mousedown 的默认动作会把这个 span 聚焦，.search 的 :focus-within
     随即亮起（看着像「点了按钮唤醒焦点反馈」），输入框里的光标也跟着没了。
     拦掉聚焦，光标留在原处，点完还能接着打字。 */
  el.engineTag.addEventListener('mousedown', (event) => event.preventDefault());
  el.engineTag.addEventListener('click', () => rotateEngine(1));
  el.engineTag.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    rotateEngine(1);
  });

  /* 弹窗：遮罩点空白关、Esc 关一层、Tab 在弹窗内循环 */
  el.dlgBack.addEventListener('click', (event) => {
    if (event.target === el.dlgBack) closeDialog();
  });
  el.dlgBack.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab') return;
    const focusables = [el.dlgName, el.dlgUrl, el.dlgCancel, el.dlgSave]
      .filter((node) => !node.disabled);
    const index = focusables.indexOf(document.activeElement);
    if (event.shiftKey && index <= 0) {
      event.preventDefault();
      focusables[focusables.length - 1].focus();
    } else if (!event.shiftKey && (index === -1 || index === focusables.length - 1)) {
      event.preventDefault();
      focusables[0].focus();
    }
  });
  el.dlgName.addEventListener('input', validateDialog);
  el.dlgUrl.addEventListener('input', validateDialog);
  el.dlgCancel.addEventListener('click', () => closeDialog());
  el.dlgSave.addEventListener('click', saveDialog);

  /* 滑块：拖动即时生效（见 initParams），松手时由 change 落盘 */

  document.addEventListener('keydown', (event) => {
    /* 按住不放会每秒触发几十次，而每一次都写一次存储 —— 直接撞 sync 的写入配额
       （见 saveSettings）。这几个键都是"点一下"的动作，重复触发没有意义。 */
    if (event.repeat) return;

    const inDialog = !el.dlgBack.hidden;
    const typing = document.activeElement === el.q || inDialog;

    if (event.key === 'Escape') {
      if (inDialog) {
        closeDialog();
        return;
      }
      if (openMenuKey) {
        const key = openMenuKey;
        closeMenus();
        focusRow(key);
        return;
      }
      if (!el.panel.hidden) {
        openPanel(false);
        return;
      }
      el.q.blur();
      return;
    }
    if (inDialog || openMenuKey) return;   // 弹窗与菜单里的键由它们自己处理

    /* 原来这里有一条 `/` 聚焦搜索框的快捷键，m01157 去掉了：光标的来源只留两种
       （新标签页自动、点搜索框）。数字键 1–3 切风格、d 切明暗：都是正式快捷键 */
    if (typing || event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key >= '1' && event.key <= String(STYLES.length)) {
      if (!setSetting('style', STYLES[Number(event.key) - 1].id)) return;
      delete overrides.style;
      paintStyle(true);
    }
    if (event.key === 'd') {
      const next = { auto: null, on: true, off: false }[cycle(DARK_MODES, currentDarkMode())];
      if (!setSetting('dark', next)) return;
      delete overrides.dark;
      paintDark();
    }
  });

  // 用户没明确选过明暗时，跟着系统走
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (settings.dark === null && typeof overrides.dark !== 'boolean') paintDark();
  });
}

function cycle(list, current) {
  const index = list.findIndex((item) => item.id === current);
  return list[(index + 1) % list.length].id;
}

/* 支持用地址栏 hash 直接摆好状态，方便出图和对比，例如：
   newtab.html#grid              —— 点阵
   newtab.html#grid+dark+panel   —— 点阵 + 常暗 + 面板
   newtab.html#clay+stylemenu    —— 暖陶 + 展开「风格」菜单
   newtab.html#paper+dlg         —— 纸白 + 打开自定义引擎弹窗
   注意：这里只写进 overrides（本次显示），不落盘。 */
function applyHashOverrides() {
  /* hash 是手打的，可能是畸形转义（#% 之类），decodeURIComponent 会抛 URIError。
     抛出去就会打断 init()，见文件末尾 init().finally() 里那段注释。 */
  let raw = '';
  try {
    raw = decodeURIComponent(window.location.hash.replace(/^#/, ''));
  } catch (err) {
    raw = ''; // 当作没带 hash
  }
  const parts = raw.split('+');

  /* 左侧元素与焦点反馈也按 hash 借，但**只有显式写了才借**：
     若像风格那样无条件写一遍默认值，一次不带 hash 的打开就会把 overrides
     压成默认值、盖掉用户存过的设置（存了 prompt 却显示放大镜）。
     手动点一下会删掉这两项，让 settings 接管。 */
  if (parts.includes('prompt')) overrides.lead = 'prompt';
  if (parts.includes('icon')) delete overrides.lead;
  if (parts.includes('hold')) overrides.focus = 'hold';
  if (parts.includes('line')) delete overrides.focus;

  const wanted = STYLES.find((style) => parts.includes(style.id));
  if (wanted) overrides.style = wanted.id;
  if (parts.includes('dark')) overrides.dark = true;
  if (parts.includes('light')) overrides.dark = false;
  if (parts.includes('auto')) delete overrides.dark; // 显式回到"跟随系统"，放最后所以它赢

  return {
    panel: parts.includes('panel'),
    menu: parts.includes('stylemenu') ? 'style' : parts.includes('menu') ? 'engine' : null,
    dlg: parts.includes('dlg'),
  };
}

async function init() {
  /* 设计取值先问令牌：滑块默认值与"等于默认就清掉行内样式"全靠它 */
  markBase = readMarkDefaults();
  markState = Object.assign({}, markBase);
  markText = el.mark.textContent.trim();

  initParams();
  initMenus();

  // 先用默认值画一帧：存储若是异步的（chrome.storage.sync）也不会先白屏。
  // 代价是存储回来时若风格不是默认那套，会看到一次跳变（存储通常几毫秒返回）；
  // 这期间的点击已被 setSetting() 挡住，所以不会丢设置。
  renderAll();
  bindEvents();

  settings = await loadSettings();
  ready = true; // 从这里开始才允许写入

  const stored = normalizeEngines(settings.engines);
  engineState.order = stored.order;
  engineState.on = stored.on;
  engineState.custom = stored.custom;
  /* 存的引擎可能已经被取消勾选 / 从来不存在：落回第一个勾着的 */
  if (!engineState.on.has(settings.engine)) {
    settings.engine = engineState.order.find((id) => engineState.on.has(id)) || DEFAULTS.engine;
  }
  markState = normalizeMark(settings.mark);

  // hash 覆盖放在持久化值之后，免得被它盖掉
  const want = applyHashOverrides();
  renderAll();
  rebuildMenu('engine');

  if (want.panel || want.menu || want.dlg) openPanel(true);
  if (want.menu) openMenu(want.menu, false);
  if (want.dlg) openDialog(null, false);

  /* 打开新标签页就能直接打字 —— 这是新标签页最该有的一条。
     Chrome 有时会把焦点收给地址栏，所以窗口重新拿到焦点时再补一次；
     只在页面上什么都没聚焦（activeElement 是 body）时补，免得把面板里的按钮焦点抢走。
     用 hash 摆出菜单 / 弹窗时（出图用）反过来：焦点留在原地，截图才逐字节稳定。 */
  if (want.menu || want.dlg) {
    /* 出图用的 hash 镜头：焦点必须留在原地，否则截图会随焦点环漂移。
       光 blur() 不够 —— Chrome 会在标签页真正拿到窗口焦点时，把解析阶段排队的
       autofocus 再 flush 一次。后台标签里加载时这一拍会晚于这里的 blur()，焦点又
       回到搜索框。所以摘掉 autofocus，并在用户真的动手之前一直把搜索框的焦点按下去。 */
    el.q.removeAttribute('autofocus');
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    const park = () => { if (document.activeElement === el.q) el.q.blur(); };
    document.addEventListener('focusin', park);
    const unpark = () => document.removeEventListener('focusin', park);
    document.addEventListener('pointerdown', unpark, { once: true, capture: true });
    document.addEventListener('keydown', unpark, { once: true, capture: true });
    return;
  }
  el.q.focus();
  /* 这条只补「刚打开就已经被 Chrome 交给地址栏」那一拍：用户一动手（点或按键）就解除。
     否则按 Esc 放掉光标后，切回标签页又会把光标塞回搜索框 —— 而光标的来源只该有两种
     （用户 m01157：新标签页自动、点搜索框）。 */
  let autoFocusArmed = true;
  const disarmAutoFocus = () => { autoFocusArmed = false; };
  document.addEventListener('pointerdown', disarmAutoFocus, { once: true, capture: true });
  document.addEventListener('keydown', disarmAutoFocus, { once: true, capture: true });
  window.addEventListener('focus', () => {
    if (autoFocusArmed && document.activeElement === document.body) el.q.focus();
  });
}

/* 首屏那两帧已经画完了（默认值 → 存档值 / hash 值），这时候才允许过场介入：
   摘掉 data-booting，--dur-theme 恢复成 tokens.css 里的 420ms。
   用两帧而不是一帧：第一帧是「提交这次渲染」，第二帧才是「它真的被画出来了」。

   为什么放在 finally 而不是 init() 末尾：init() 里以后再加任何 await / 解码，
   都可能抛在这之前。那样 data-booting 会永久留在 <html> 上，--dur-theme 恒为 0s，
   页面照常能用、只是换肤与亮暗永远退回硬切 —— 一个无声的永久降级，比崩掉还难查。 */
init()
  .catch((err) => console.error('[LineTab] 启动失败，页面按默认值继续', err))
  .finally(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => document.documentElement.removeAttribute('data-booting'));
    });
  });
