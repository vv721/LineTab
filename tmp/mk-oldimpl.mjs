// 一次性审查工具：把"旧写法"复刻到 tmp/oldimpl/，用来验证 scripts/newtab.spec.mjs
// 里新增的两条行为断言是否真的会因为旧写法变红。只写 tmp/，不动交付文件。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'tmp', 'oldimpl');
fs.mkdirSync(DIR, { recursive: true });
for (const f of ['newtab.html', 'newtab.css', 'tokens.css']) {
  fs.copyFileSync(path.join(ROOT, f), path.join(DIR, f));
}

let js = fs.readFileSync(path.join(ROOT, 'newtab.js'), 'utf8');
const before = js;

// 旧写法①：宫格数据源不按 settings.source 取，来源只换个字
js = js.replace('function applySource() {\n  el.sourceValue.textContent = nameOf(SOURCES, settings.source);\n  renderTiles(); // 来源换了，宫格要跟着换 —— 这一行就是接 topSites 时要复用的缝\n}',
  'function applySource() {\n  el.sourceValue.textContent = nameOf(SOURCES, settings.source);\n}');
js = js.replace('for (const tile of TILE_SOURCES[settings.source] || TILES_TOP) {', 'for (const tile of TILES_TOP) {');

// 旧写法①补：宫格只在整页渲染时画一次
js = js.replace('function renderAll() {\n  applyStyle();', 'function renderAll() {\n  applyStyle();\n  renderTiles();');

// 旧写法②：启动链先等存储再画（不预渲染）
js = js.replace('  // 先用默认值画一帧：存储若是异步的（chrome.storage.sync），也不会先白屏再跳\n  renderAll();\n  tick();\n  bindEvents();\n\n  settings = await loadSettings();',
  '  settings = await loadSettings();\n  renderAll();\n  tick();\n  bindEvents();');

// 旧写法③：hash 直接写进 settings 并落盘
js = js.replace('  if (wanted) overrides.style = wanted.id;\n  if (parts.includes(\'dark\')) overrides.dark = true;\n  if (parts.includes(\'light\')) overrides.dark = false;',
  '  if (wanted) settings.style = wanted.id;\n  if (parts.includes(\'dark\')) settings.dark = true;\n  if (parts.includes(\'light\')) settings.dark = false;\n  saveSettings();');

if (js === before) throw new Error('mutation failed: no replacement applied');
fs.writeFileSync(path.join(DIR, 'newtab.js'), js);

fs.writeFileSync(path.join(DIR, 'old.spec.mjs'), `import { test, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const DIR = path.dirname(fileURLToPath(import.meta.url));
const PAGE = pathToFileURL(path.join(DIR, 'newtab.html')).href;
const FROZEN = new Date(2026, 2, 6, 9, 41, 0);

test('旧实现：快捷方式来源真的会换掉宫格', async ({ page }) => {
  await page.clock.setFixedTime(FROZEN);
  await page.goto(\`\${PAGE}#paper+panel\`);
  await expect(page.locator('.tile')).toHaveCount(9);
  await page.locator('#source').click();
  await expect(page.locator('#source-value')).toHaveText('手动列表');
  await expect(page.locator('.tile')).toHaveCount(3);
  await expect(page.locator('.tile .name').first()).toHaveText('MDN');
});

test('旧实现：地址栏 hash 借来的风格不会落盘', async ({ page }) => {
  await page.clock.setFixedTime(FROZEN);
  await page.goto(\`\${PAGE}#grid+dark+panel\`);
  await expect(page.locator('html')).toHaveAttribute('data-style', 'grid');
  await page.locator('#engine').click();
  await page.goto(PAGE);
  await expect(page.locator('html')).toHaveAttribute('data-style', 'paper');
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'dark');
});
`);

fs.writeFileSync(path.join(DIR, 'pw.config.mjs'), `import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.mjs',
  fullyParallel: true,
  reporter: [['line']],
  use: { channel: 'chrome', headless: true, viewport: { width: 1440, height: 900 }, colorScheme: 'light' },
});
`);
console.log('oldimpl ready');
