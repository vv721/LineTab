/* 临时探针：T3 为什么抓不到搜索请求。
   直接复用扩展测试的启动方式，把每一步都打出来。 */
import { chromium } from '@playwright/test';
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PROFILE = join(ROOT, 'tmp', 'probe-profile');

function localChromium() {
  const base = join(process.env.LOCALAPPDATA || '', 'ms-playwright');
  if (!existsSync(base)) return null;
  const dirs = readdirSync(base).filter((name) => /^chromium-\d+$/.test(name)).sort();
  for (const dir of dirs.reverse()) {
    const exe = join(base, dir, 'chrome-win64', 'chrome.exe');
    if (existsSync(exe)) return exe;
  }
  return null;
}

rmSync(PROFILE, { recursive: true, force: true });
mkdirSync(PROFILE, { recursive: true });

const context = await chromium.launchPersistentContext(PROFILE, {
  executablePath: localChromium() ?? undefined,
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
page.on('console', (msg) => console.log('[console]', msg.type(), msg.text()));
page.on('pageerror', (err) => console.log('[pageerror]', err.message));
page.on('request', (req) => {
  if (!/^chrome-extension:|^chrome:|^devtools:/.test(req.url())) console.log('[request]', req.resourceType(), req.url());
});

await page.goto('chrome://newtab/');
await page.waitForURL(/^chrome-extension:\/\//);
console.log('URL:', page.url());

const seen = [];
await page.route(/^https?:\/\//, (route) => {
  seen.push(route.request().url());
  console.log('[route] 命中:', route.request().url());
  return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>stub</title>' });
});

await page.fill('#q', '测试');
console.log('输入框的值:', await page.inputValue('#q'));
await page.press('#q', 'Enter');
await page.waitForTimeout(1500);
console.log('route 记录:', JSON.stringify(seen));
console.log('当前 URL:', page.url());
console.log('页面标题:', await page.title());

await context.close();
