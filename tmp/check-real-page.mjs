import { chromium } from '@playwright/test';
import { existsSync, readdirSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = "D:\\桌面\\dsh\\newtab-extension\\LineTab";
const TMP = "D:\\桌面\\dsh\\newtab-extension\\tmp";
const PROFILE = join(TMP, 'shot-profile');
rmSync(PROFILE, { recursive: true, force: true });
mkdirSync(PROFILE, { recursive: true });

function localChromium() {
  const root = join(process.env.LOCALAPPDATA ?? '', 'ms-playwright');
  if (!existsSync(root)) return null;
  const builds = readdirSync(root).map((n) => /^chromium-(\d+)$/.exec(n)).filter(Boolean)
    .map((m) => ({ build: Number(m[1]), exe: join(root, m[0], 'chrome-win64', 'chrome.exe') }))
    .filter((i) => existsSync(i.exe)).sort((a, b) => a.build - b.build);
  return builds.length ? builds[builds.length - 1].exe : null;
}

const exe = localChromium();
const ctx = await chromium.launchPersistentContext(PROFILE, {
  ...(exe ? { executablePath: exe } : { channel: 'chromium' }),
  headless: true,
  viewport: { width: 1440, height: 900 },
  args: ['--disable-extensions-except=' + ROOT, '--load-extension=' + ROOT, '--no-first-run', '--no-default-browser-check'],
});

const first = ctx.pages()[0] ?? (await ctx.newPage());
await first.goto('chrome://newtab/', { waitUntil: 'domcontentloaded' });
await first.waitForURL(/^chrome-extension:\/\//, { timeout: 20000 });
const u = new URL(first.url());
const origin = u.protocol + '//' + u.host;

async function shoot(name, hash) {
  // 必须新开一页：同一文档里改 hash 不会重跑脚本（README 坑 181 行）
  const p = await ctx.newPage();
  await p.goto(origin + '/newtab.html' + hash, { waitUntil: 'load' });
  await p.waitForTimeout(1200);
  const info = await p.evaluate(() => {
    const cs = getComputedStyle(document.querySelector('.panel'));
    const root = getComputedStyle(document.documentElement);
    return {
      style: document.documentElement.dataset.style,
      panelRadius: cs.borderTopLeftRadius,
      booting: document.documentElement.hasAttribute('data-booting'),
      durTheme: root.getPropertyValue('--dur-theme').trim(),
      panelOpacity: getComputedStyle(document.getElementById('panel')).opacity,
      focused: document.activeElement && document.activeElement.id,
    };
  });
  console.log(name, JSON.stringify(info));
  await p.screenshot({ path: join(TMP, name + '.png') });
  await p.close();
}

await shoot('real-paper', '');
await shoot('real-grid-panel', '#grid+panel');
await ctx.close();
