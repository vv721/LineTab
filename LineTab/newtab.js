/* ============================================================
   新标签页的行为层：原生 JS、零依赖、零构建。
   运行时零网络请求 —— 只有你按下回车搜索时，浏览器才会离开本页。

   状态只有一个源（settings），所有变化都走 render*() 一个方向：
   settings → 页面。反过来（页面 → settings）只有事件处理里那几行写入。
   ============================================================ */
'use strict';

/* ---------- 1. 常量 ---------- */
const STORE_KEY = 'newtab.settings';
const DEFAULTS = {
  style: 'paper',        // 默认 纸白；另一套 点阵在面板「风格」里切
  engine: 'bing',        // 默认搜索引擎
  lead: 'icon',          // 搜索框左侧元素：icon = 放大镜，prompt = ">" 提示符
  focus: 'line',         // 焦点反馈：line = 底线变文字色，hold = 界面不动（只靠光标指示）
  dark: null,            // 明暗三态：null = 跟随系统，true = 常暗，false = 常亮
};

const ENGINES = {
  bing: { name: 'Bing', url: 'https://www.bing.com/search?q=' },
  google: { name: 'Google', url: 'https://www.google.com/search?q=' },
};

/* 只留两套风格族（B 雾青与 D 夜墨已按用户要求删除，见 tokens.css 末尾的说明） */
const STYLES = [
  { id: 'paper', name: '纸白' },
  { id: 'grid', name: '点阵' },
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
   面板上循环显示这三档 —— 「跟随系统」必须能从界面上回去，
   否则点过一次勾选框就永远脱离系统了。 */
const DARK_MODES = [
  { id: 'auto', name: '跟随系统' },
  { id: 'on', name: '常暗' },
  { id: 'off', name: '常亮' },
];

const SEARCH_PREFIX = { g: 'google', b: 'bing' }; // 输入 "g 关键词" 临时用 Google
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
    return merged;
  });
}

/* ---------- 3. 元素 ---------- */
const el = {
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

function applyStyle() {
  const style = currentStyle();
  document.documentElement.dataset.style = style;
  el.styleValue.textContent = nameOf(STYLES, style);
}

function applyDark() {
  const isDark = currentDark();
  if (isDark) document.documentElement.dataset.theme = 'dark';
  else delete document.documentElement.dataset.theme;
  el.darkValue.textContent = nameOf(DARK_MODES, currentDarkMode());
}

function applyEngine() {
  el.engineValue.textContent = ENGINES[settings.engine].name;
  el.engineTag.textContent = ENGINES[settings.engine].name.toUpperCase();
}

function applyLead() {
  const lead = currentLead();
  document.documentElement.dataset.lead = lead;
  el.leadValue.textContent = nameOf(LEADS, lead);
}

function applyFocus() {
  const focus = currentFocus();
  document.documentElement.dataset.focus = focus;
  el.focusValue.textContent = nameOf(FOCUSES, focus);
}

function renderAll() {
  applyStyle();
  applyEngine();
  applyLead();
  applyFocus();
  applyDark();
}

/* ---------- 5. 搜索 ---------- */
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

  window.location.href = ENGINES[engineId].url + encodeURIComponent(query);
}

/* ---------- 7. 设置面板 ---------- */
function openPanel(open) {
  el.panel.hidden = !open;
  el.settings.setAttribute('aria-expanded', String(open));
  if (open) el.engine.focus();
}

function cycle(list, current) {
  const index = list.findIndex((item) => item.id === current);
  return list[(index + 1) % list.length].id;
}

function cycleDark() {
  const next = { auto: null, on: true, off: false }[cycle(DARK_MODES, currentDarkMode())];
  if (!setSetting('dark', next)) return;
  delete overrides.dark;      // 手动操作以 settings 为准，hash 借来的状态就此失效
  applyDark();
}

function bindEvents() {
  el.search.addEventListener('submit', submitSearch);

  el.settings.addEventListener('click', () => openPanel(el.panel.hidden));

  // 点面板外面就收起来
  document.addEventListener('click', (event) => {
    if (el.panel.hidden) return;
    if (el.panel.contains(event.target) || el.settings.contains(event.target)) return;
    openPanel(false);
  });

  el.engine.addEventListener('click', () => {
    const next = cycle(Object.keys(ENGINES).map((id) => ({ id })), settings.engine);
    if (!setSetting('engine', next)) return;
    applyEngine();
  });

  el.lead.addEventListener('click', () => {
    if (!setSetting('lead', cycle(LEADS, settings.lead))) return;
    delete overrides.lead;    // 手动选了，hash 借来的就此失效
    applyLead();
  });

  el.focus.addEventListener('click', () => {
    if (!setSetting('focus', cycle(FOCUSES, settings.focus))) return;
    delete overrides.focus;
    applyFocus();
  });

  el.style.addEventListener('click', () => {
    if (!setSetting('style', cycle(STYLES, settings.style))) return;
    delete overrides.style;   // 手动选了风格，hash 借来的风格就此失效
    applyStyle();
  });

  el.dark.addEventListener('click', cycleDark);

  document.addEventListener('keydown', (event) => {
    /* 按住不放会每秒触发几十次，而每一次都写一次存储 —— 直接撞 sync 的写入配额
       （见 saveSettings）。这几个键都是"点一下"的动作，重复触发没有意义。 */
    if (event.repeat) return;

    const typing = document.activeElement === el.q;

    if (event.key === 'Escape') {
      openPanel(false);
      el.q.blur();
      return;
    }
    if (event.key === '/' && !typing) {
      event.preventDefault();
      el.q.focus();
      return;
    }
    // 数字键 1–2 切风格、d 切明暗：都是正式快捷键（不是开发期的临时代码）
    if (typing || event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key >= '1' && event.key <= String(STYLES.length)) {
      if (!setSetting('style', STYLES[Number(event.key) - 1].id)) return;
      delete overrides.style;
      applyStyle();
    }
    if (event.key === 'd') cycleDark();
  });

  // 用户没明确选过明暗时，跟着系统走
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (settings.dark === null && typeof overrides.dark !== 'boolean') applyDark();
  });
}

/* ---------- 8. 启动 ---------- */
/* 支持用地址栏 hash 直接摆好状态，方便出图和对比，例如：
   newtab.html#grid              —— 点阵
   newtab.html#grid+dark+panel   —— 点阵 + 常暗 + 面板
   newtab.html#grid+prompt+hold  —— 点阵 + `>` 左侧元素 + 焦点时界面不动
   newtab.html#grid+auto         —— 点阵 + 跟随系统（看暗色下点阵还在不在）
   注意：这里只写进 overrides（本次显示），不落盘。 */
function applyHashOverrides() {
  const parts = decodeURIComponent(window.location.hash.replace(/^#/, '')).split('+');

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
  return parts.includes('panel');
}

async function init() {
  // 先用默认值画一帧：存储若是异步的（chrome.storage.sync）也不会先白屏。
  // 代价是存储回来时若风格不是默认那套，会看到一次跳变（存储通常几毫秒返回）；
  // 这期间的点击已被 setSetting() 挡住，所以不会丢设置。
  renderAll();
  bindEvents();

  settings = await loadSettings();
  ready = true; // 从这里开始才允许写入

  // hash 覆盖放在持久化值之后，免得被它盖掉
  const openOnLoad = applyHashOverrides();
  renderAll();
  if (openOnLoad) openPanel(true);

  /* 打开新标签页就能直接打字 —— 这是新标签页最该有的一条。
     Chrome 有时会把焦点收给地址栏，所以窗口重新拿到焦点时再补一次；
     只在页面上什么都没聚焦（activeElement 是 body）时补，免得把面板里的按钮焦点抢走。 */
  el.q.focus();
  window.addEventListener('focus', () => {
    if (document.activeElement === document.body) el.q.focus();
  });
}

init();
