// 探针：本机 Playwright 自带的 Chromium 是 1208（旧），而 @playwright/test 1.63 期望 1243，
// 下载又被墙。先确认「拿旧版 Chromium 的 executablePath 硬上」到底行不行：
// 能不能启动、能不能装扩展、chrome://newtab/ 会不会跳到扩展页。
// 跑法：node tmp/probe-ext-launch.mjs
import { chromium } from '@playwright/test';
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MS = join(process.env.LOCALAPPDATA, 'ms-playwright');

// 找出本机所有完整版 Chromium（不是 headless_shell）
const candidates = readdirSync(MS)
  .filter((name) => /^chromium-\d+$/.test(name))
  .map((name) => join(MS, name, 'chrome-win64', 'chrome.exe'))
  .filter((path) => existsSync(path))
  .sort()
  .reverse();
console.log('本机可用的 Chromium：');
for (const path of candidates) console.log('  ' + path);

const binary = candidates[0];
if (!binary) {
  console.error('一个都没有，得另想办法');
  process.exit(1);
}

const profile = join(ROOT, 'tmp', 'probe-ext-profile');
mkdirSync(profile, { recursive: true });

const context = await chromium.launchPersistentContext(profile, {
  executablePath: binary,
  headless: true,
  viewport: { width: 1440, height: 900 },
  args: [
    `--disable-extensions-except=${ROOT}`,
    `--load-extension=${ROOT}`,
    '--no-first-run',
    '--no-default-browser-check',
  ],
});

const page = context.pages()[0] ?? (await context.newPage());
console.log('\n启动成功');

try {
  await page.goto('chrome://newtab/', { timeout: 8000 });
  await page.waitForTimeout(1200);
  console.log('chrome://newtab/ 之后的 URL：' + page.url());
} catch (err) {
  console.log('导航到 chrome://newtab/ 失败：' + err.message.split('\n')[0]);
}

const state = await page.evaluate(() => ({
  hasChrome: typeof chrome !== 'undefined',
  hasStorage: typeof chrome !== 'undefined' && !!chrome.storage,
  hasSync: typeof chrome !== 'undefined' && !!chrome.storage && !!chrome.storage.sync,
  href: location.href,
  active: document.activeElement ? document.activeElement.id : '(无)',
  rows: document.querySelectorAll('#panel .row').length,
  tag: document.getElementById('engine-tag') ? document.getElementById('engine-tag').textContent : '(没有这个元素)',
})).catch((err) => ({ error: err.message.split('\n')[0] }));
console.log('页面状态：' + JSON.stringify(state, null, 2));

// 顺便确认扩展 id 能不能从 profile 里读出来
const prefs = join(profile, 'Default', 'Secure Preferences');
if (existsSync(prefs)) {
  const json = JSON.parse(readFileSync(prefs, 'utf8'));
  const ids = Object.keys(json?.extensions?.settings || {});
  console.log('profile 里的扩展 id：' + JSON.stringify(ids));
  for (const id of ids) {
    console.log(`  ${id} -> path=${json.extensions.settings[id].path} state=${json.extensions.settings[id].state}`);
  }
}

await context.close();
