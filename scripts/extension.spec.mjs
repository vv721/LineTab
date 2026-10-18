// ============================================================
// 扩展本身能不能用（T1–T9）：真的把 newtab-extension 装进浏览器再验。
//
// 为什么不在这儿做像素比对：这个 project 用的是 Playwright 自带的那份 Chromium，
// 与你本机 Chrome 的渲染不保证逐像素一致 —— 视觉的事交给 chrome project（channel: 'chrome'）。
// 这里只验"扩展化"才可能出现的问题：覆盖生效、权限、同步存储、零外部请求。
//
// 浏览器从哪来：Playwright 1.63 期望 chromium-1243，但本机 playwright 的 CDN 连不上
// （ECONNRESET），所以复用本机已缓存的 Chromium（scripts 里 make-icons.mjs 也是这么找的）。
// 找不到才回落到 channel: 'chromium'（那时说明真的装上了）。
// 为什么要用 Chromium 而不是本机 Chrome：Google Chrome 与 Edge 已经移除了命令行侧载扩展的开关，
// 只有 Chromium 还认 --load-extension（见 https://playwright.dev/docs/chrome-extensions）。
// ============================================================
import { test, expect, chromium } from '@playwright/test';
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXT_DIR, PROJECT_ROOT } from './runtime-files.mjs';

/* 装进浏览器的就是 LineTab/ 这一个目录（和手动装载时选的目录完全同一份），
   profile 之类的中间产物留在项目根的 tmp/ 下。 */
const ROOT = EXT_DIR;
const PROFILE_ROOT = join(PROJECT_ROOT, 'tmp', 'ext-profile');
const STORE_KEY = 'newtab.settings';

// 装一次扩展要几秒，用例里还要重启浏览器，30 秒不够
test.describe.configure({ mode: 'serial', timeout: 120_000 });

// 上一次跑剩下的 profile 目录整个清掉（每个用例的目录名本来就带时间戳，这里只是别越攒越多）
test.beforeAll(() => {
  rmSync(PROFILE_ROOT, { recursive: true, force: true });
});

/** 本机缓存的完整版 Chromium（chromium-XXXX，不是 headless_shell），取版本最新的那个 */
function localChromium() {
  const root = join(process.env.LOCALAPPDATA ?? '', 'ms-playwright');
  if (!existsSync(root)) return null;
  const builds = readdirSync(root)
    .map((name) => /^chromium-(\d+)$/.exec(name))
    .filter(Boolean)
    .map((match) => ({ build: Number(match[1]), exe: join(root, match[0], 'chrome-win64', 'chrome.exe') }))
    .filter((item) => existsSync(item.exe))
    .sort((a, b) => a.build - b.build);
  return builds.length ? builds[builds.length - 1].exe : null;
}

/**
 * 每个用例一个**本次运行专属**的 profile 目录：绝不复用路径。
 *
 * 为什么不用"删掉再建同名目录"：Windows 上 rmSync 返回之后，上一次的 Chromium 未必已经退出，
 * 它还会把还攥在手里的状态写回刚建好的同名目录。实测这会让 t3 带着上一轮的"默认引擎 = Google"
 * 复活，于是 T3 第一条断言（应该去 Bing）稳定失败 —— 页面本身没问题，是这条夹层在骗人。
 * 不复用路径，这个坑就不存在了。
 */
function freshProfile(name) {
  const dir = join(PROFILE_ROOT, `${name}-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`);
  if (!dir.startsWith(PROFILE_ROOT)) throw new Error(`profile 路径不对：${dir}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function launch(profileDir) {
  const executablePath = localChromium();
  return chromium.launchPersistentContext(profileDir, {
    ...(executablePath ? { executablePath } : { channel: 'chromium' }),
    headless: true,
    viewport: { width: 1440, height: 900 },
    args: [
      `--disable-extensions-except=${ROOT}`,
      `--load-extension=${ROOT}`,
      '--no-first-run',
      '--no-default-browser-check',
    ],
  });
}

/**
 * 打开新标签页并等它跳到扩展页。
 * 走 chrome://newtab/ 是故意的：跳转本身就在验「覆盖生效」；扩展 id 也从跳转后的 URL 里拿，
 * 不需要按 SHA256 规则去算（那条路在中文目录下有编码坑）。
 */
async function openNewTab(context) {
  const page = context.pages()[0] ?? (await context.newPage());
  await page.goto('chrome://newtab/', { waitUntil: 'domcontentloaded' });
  await page.waitForURL(/^chrome-extension:\/\//, { timeout: 20_000 });
  const url = new URL(page.url());
  return { page, id: url.host, base: `${url.protocol}//${url.host}` };
}

/* 二级菜单：行按钮只负责开菜单，改设置要点菜单项（与 Preview 同一套交互）。 */
function rowOf(page, id) {
  return page.locator('#panel .row').filter({ has: page.locator('#' + id) });
}

async function choose(page, id, value) {
  await page.locator('#' + id).click();
  const row = rowOf(page, id);
  const option = row.locator('.menu-opt[data-value="' + value + '"]');
  await expect(option).toBeVisible();
  const wasOn = id === 'engine' ? await option.getAttribute('aria-selected') : null;
  await option.click();
  if (id === 'engine') {
    // 引擎那行是多选：点一下是"翻面"，且菜单特意不收起 —— 认出翻面再按 Esc 收
    await expect(option).toHaveAttribute('aria-selected', wasOn === 'true' ? 'false' : 'true');
    await page.keyboard.press('Escape');
  }
  await expect(row.locator('.menu')).toBeHidden();
}

test('T1 覆盖了新标签页：chrome://newtab/ 会跳到扩展页', async () => {
  const context = await launch(freshProfile('t1'));
  try {
    const { page, id, base } = await openNewTab(context);
    expect(page.url()).toBe(`${base}/newtab.html`);
    console.log(`扩展 id：${id}`);
    await expect(page.locator('#q')).toBeVisible();
  } finally {
    await context.close();
  }
});

test('T2 页面结构与自动聚焦：真的能直接打字', async () => {
  const context = await launch(freshProfile('t2'));
  try {
    const { page } = await openNewTab(context);

    // 打开就聚焦在搜索框 —— 这是"新标签页"最该有的一条
    await expect(page.locator('#q')).toBeFocused();

    // 面板结构与网页版一致：5 行设置 + 分隔线 + 5 行引导语参数
    await expect(page.locator('#panel .row')).toHaveCount(10);
    await expect(page.locator('#panel .row-param')).toHaveCount(5);
    await expect(page.locator('#engine-tag')).toHaveText('Bing');
    // 引导语（Type something）已经在发布形态里
    await expect(page.locator('#mark')).toHaveText('Type something');

    // 权限只有"存储"：页面上真的能用到 chrome.storage.sync
    const hasSync = await page.evaluate(() => typeof chrome !== 'undefined' && !!chrome.storage && !!chrome.storage.sync);
    expect(hasSync).toBe(true);

    // 直接打字（不点输入框）就该进到搜索框里
    await page.keyboard.type('天气');
    await expect(page.locator('#q')).toHaveValue('天气');
  } finally {
    await context.close();
  }
});

test('T3 回车真的会带着关键词跳去搜索引擎（Bing / Google 都对）', async () => {
  const context = await launch(freshProfile('t3'));
  try {
    const { page, base } = await openNewTab(context);

    /* 只拦 http(s)，只记录、不真联网。
       注意这里用 fulfill 而不是 abort：abort 主框架导航会把当前文档换成 Chrome 的
       "无法访问此网站"错误页，后面的元素就都找不到了（实测直接挂到用例超时）。
       顶一张空白页上去，导航就是成功的，页面还能继续用。 */
    const requested = [];
    await page.route(/^https?:\/\//, (route) => {
      requested.push(route.request().url());
      return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>stub</title>' });
    });

    await page.fill('#q', '测试');
    await page.press('#q', 'Enter');
    await expect
      .poll(() => requested.some((url) => url.startsWith('https://www.bing.com/search?q=')))
      .toBe(true);
    expect(requested.find((url) => url.includes('bing.com'))).toBe(
      `https://www.bing.com/search?q=${encodeURIComponent('测试')}`
    );

    // 回到新标签页，面板里把默认引擎换成 Google，再搜一次
    await page.goto(`${base}/newtab.html`, { waitUntil: 'domcontentloaded' });
    await page.locator('#settings').click();
    /* 内置两条默认都勾着（Bing 是当前值）。取消 Bing，当前引擎会自动落到 Google。 */
    await choose(page, 'engine', 'bing');
    await expect(page.locator('#engine-value')).toHaveText('Google');
    await page.locator('#q').fill('天气');
    await page.press('#q', 'Enter');
    await expect
      .poll(() => requested.some((url) => url.startsWith('https://www.google.com/search?q=')))
      .toBe(true);
    expect(requested.find((url) => url.includes('google.com'))).toBe(
      `https://www.google.com/search?q=${encodeURIComponent('天气')}`
    );
  } finally {
    await context.close();
  }
});

test('T4 设置写进 chrome.storage.sync，重开浏览器仍然生效', async () => {
  const dir = freshProfile('t4');

  // 第一次打开：改一项设置，确认它真的进了 sync，然后清掉本地镜像
  let context = await launch(dir);
  try {
    const { page } = await openNewTab(context);
    await page.locator('#settings').click();
    await choose(page, 'lead', 'prompt');
    await expect(page.locator('html')).toHaveAttribute('data-lead', 'prompt');

    // saveSettings() 有 200ms 合并窗口，等它真的写进去再验证
    await page.waitForTimeout(800);
    const stored = await page.evaluate((key) => chrome.storage.sync.get(key), STORE_KEY);
    expect(stored[STORE_KEY]?.values?.lead).toBe('prompt');

    /* 关键一步：把 localStorage 镜像清掉。
       不清的话"重开还在"可能只是 localStorage 的功劳 —— 那样这条用例就证明不了 sync 通路。 */
    await page.evaluate(() => localStorage.clear());
  } finally {
    await context.close();
  }

  // 第二次打开：同一个 profile，设置只可能来自 chrome.storage.sync
  context = await launch(dir);
  try {
    const { page } = await openNewTab(context);
    await expect(page.locator('html')).toHaveAttribute('data-lead', 'prompt');
    await expect(page.locator('#lead-value')).toHaveText('> 提示符');
  } finally {
    await context.close();
  }
});

test('T5 存着一个已经不存在的风格时，回落到默认风格（存量清理）', async () => {
  const context = await launch(freshProfile('t5'));
  try {
    const { page } = await openNewTab(context);
    /* 存进 sync 的是信封 { savedAt, values }（见 newtab.js 的 normalize()） */
    const seed = (value) =>
      page.evaluate(
        ([key, v]) => chrome.storage.sync.set({ [key]: { savedAt: Date.now(), values: v } }),
        [STORE_KEY, value],
      );

    /* 先做一次正面控制：存一套**有效**风格，页面必须真的跟着变。
       它证明"存储里的值确实会被读进 DOM"，下面那次断言才有意义。

       第二层护栏：断言前先等 #q 拿到焦点。data-style 在 HTML 里就写着静态值 "paper"，
       刷新后不等 JS 跑完就断言，等于在断言静态标记 —— 那样把回落白名单整行删掉也照样绿
       （实测踩到过）。自动聚焦是 init() 的最后一步，它成立就说明设置已经读进来并渲染完了。 */
    await seed({ style: 'grid' });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('#q')).toBeFocused();
    await expect(page.locator('html')).toHaveAttribute('data-style', 'grid');

    // 再塞一套早已删掉的风格（"mist" 是以前的 B 雾青）
    await seed({ style: 'mist' });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('#q')).toBeFocused();
    await expect(page.locator('html')).toHaveAttribute('data-style', 'paper');
    await expect(page.locator('#style-value')).toHaveText('纸白');
  } finally {
    await context.close();
  }
});

test('T6 页面自己不发起任何外部网络请求', async () => {
  const context = await launch(freshProfile('t6'));
  const external = [];
  // 监听要挂在 context 上、并且在打开页面之前挂：页面加载时的字体/图标请求也得算数
  context.on('request', (request) => {
    if (/^https?:\/\//i.test(request.url())) external.push(request.url());
  });
  try {
    const { page } = await openNewTab(context);

    // 再给"万一有请求"留出时间：埋点、延迟加载都在这儿会露头
    await page.waitForTimeout(1000);
    expect(external).toEqual([]);
  } finally {
    await context.close();
  }
});

/* 下面两条合起来守 code_review 抓到的那条数据丢失路径（P2）：
   saveSettings() 把 sync 写入合并 200ms，窗口内页面消失就丢掉那次改动；
   而 localStorage 镜像当时不会被读回，所以永远不会自愈。
   两条都用 clock.install() 冻结页面计时器 —— 让"合并窗口"永远不到点、时序完全确定。 */

test('T7 合并窗口内关页：改动由本地镜像保住（两份存储取较新的一份）', async () => {
  const dir = freshProfile('t7');
  const STALE = { savedAt: 1, values: { style: 'paper' } }; // sync 里故意放一份"旧"的

  let context = await launch(dir);
  try {
    const { page } = await openNewTab(context);
    await page.evaluate(([key, v]) => chrome.storage.sync.set({ [key]: v }), [STORE_KEY, STALE]);
    await page.clock.install(); // 冻结计时器：200ms 的合并永远不会到点
    await page.locator('#settings').click();
    await choose(page, 'style', 'grid'); // 切到 点阵 → 只写进了本地镜像
    await expect(page.locator('html')).toHaveAttribute('data-style', 'grid');
    // 负面控制：sync 里还是那份旧的，说明这次改动确实没发出去
    const before = await page.evaluate((key) => chrome.storage.sync.get(key), STORE_KEY);
    expect(before[STORE_KEY]?.values?.style).toBe('paper');
  } finally {
    await context.close(); // 关页：镜像留下，sync 没赶上
  }

  context = await launch(dir);
  try {
    const { page } = await openNewTab(context);
    await expect(page.locator('#q')).toBeFocused();
    // 旧实现到这里会读到 sync 里的 paper（镜像永远不被采纳）——这就是修掉的那条路径
    await expect(page.locator('html')).toHaveAttribute('data-style', 'grid');
    await expect(page.locator('#style-value')).toHaveText('点阵');
  } finally {
    await context.close();
  }
});

test('T8 改完设置立刻离开页面：pagehide 会把没发出去的写入补上', async () => {
  const dir = freshProfile('t8');
  const STALE = { savedAt: 1, values: { style: 'paper' } };

  let context = await launch(dir);
  try {
    const { page } = await openNewTab(context);
    await page.evaluate(([key, v]) => chrome.storage.sync.set({ [key]: v }), [STORE_KEY, STALE]);
    await page.clock.install();
    await page.locator('#settings').click();
    await choose(page, 'style', 'grid');
    await expect(page.locator('html')).toHaveAttribute('data-style', 'grid');

    /* 只留 sync 这一条路：镜像先清掉，再真的导航走（等同"改完马上回车去搜索"）。
       下一位能读回 grid，只可能是 pagehide 那次 flush 把写入发出去了。 */
    await page.evaluate(() => localStorage.clear());
    await page.goto('about:blank');
  } finally {
    await context.close();
  }

  context = await launch(dir);
  try {
    const { page } = await openNewTab(context);
    await expect(page.locator('#q')).toBeFocused();
    await expect(page.locator('html')).toHaveAttribute('data-style', 'grid');
    await expect(page.locator('#style-value')).toHaveText('点阵');
  } finally {
    await context.close();
  }
});

/* 看稿页那套过场（@property 注册 + [data-style] 过渡表 + [data-booting]）是不是真的
   跟着进了发布形态：这里量的是"中途有没有插值"，不是像素 —— 像素由 chrome project 钉。 */
test('T9 发布形态也挂着逐色过场：换肤中途真的在插值，首屏那一次不过场', async () => {
  const context = await launch(freshProfile('t9'));
  try {
    const { page } = await openNewTab(context);

    // 首屏：脚本两帧后摘掉 data-booting，时长回到令牌里的唯一来源
    await expect(page.locator('html')).not.toHaveAttribute('data-booting', '');
    const dur = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--dur-theme').trim());
    expect(dur).toBe('420ms');

    // 过渡表真的挂在这一页上（--bg 与形状 --panel-r 都在其中）
    const table = await page.evaluate(() => getComputedStyle(document.documentElement).transitionProperty);
    for (const prop of ['--bg', '--text', '--panel-bg', '--panel-r']) expect(table).toContain(prop);

    // 走真实面板：设置 → 风格：纸白 → 点阵
    await page.locator('#settings').click();
    await choose(page, 'style', 'grid');
    await expect(page.locator('html')).toHaveAttribute('data-style', 'grid');

    const seen = await page.evaluate(() => new Promise((resolve) => {
      const cs = getComputedStyle(document.documentElement);
      const out = [];
      const tick = () => {
        out.push({
          bg: cs.getPropertyValue('--bg').trim(),
          r: cs.getPropertyValue('--panel-r').trim(),
        });
        if (out.length < 12) setTimeout(tick, 40);
        else resolve(out);
      };
      tick();
    }));

    expect(new Set(seen.map((s) => s.bg)).size).toBeGreaterThan(2);
    expect(new Set(seen.map((s) => s.r)).size).toBeGreaterThan(2);
    expect(seen.filter((s) => parseFloat(s.r) > 4.05 && parseFloat(s.r) < 11.95).length).toBeGreaterThan(2);

    // 落位之后面板圆角跟点阵令牌一致（12px → 4px）
    await page.waitForTimeout(500);
    const radius = await page.locator('#panel').evaluate((n) => getComputedStyle(n).borderTopLeftRadius);
    expect(radius).toBe('4px');
  } finally {
    await context.close();
  }
});

