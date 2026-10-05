// 一次性审查探针：只读，不改交付文件。回答四个问题：
// 1) file:// 下 localStorage 到底能不能用、能不能跨导航持久化
// 2) page.goto 去掉 hash 到底是真重载还是同文档导航（决定第 3 条断言是否有意义）
// 3) 新实现下点一次无关设置后，hash 借来的风格有没有落盘
// 4) 新实现下 hash 是否连"未点任何设置"都不落盘
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PAGE = pathToFileURL(path.join(ROOT, 'newtab.html')).href;
const out = {};

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'light' });
const page = await ctx.newPage();
const snap = () => page.evaluate(() => {
  let ls = 'n/a';
  try { ls = localStorage.getItem('newtab.settings') ?? 'null'; } catch (e) { ls = 'THROW:' + e.message; }
  return {
    style: document.documentElement.dataset.style ?? null,
    theme: document.documentElement.dataset.theme ?? null,
    tiles: document.querySelectorAll('.tile').length,
    source: document.getElementById('source-value')?.textContent,
    ls,
  };
});

// --- 3/4) hash + 无关点击 ---
await page.goto(`${PAGE}#grid+dark+panel`);
out.afterHashLoad = await snap();
await page.locator('#engine').click();
out.afterEngineClick = await snap();

// --- 2) 去掉 hash 再 goto ---
await page.evaluate(() => { window.__marker = 1; });
await page.goto(PAGE);
out.afterHashlessGoto = Object.assign(
  { reloaded: !(await page.evaluate(() => window.__marker === 1)) },
  await snap()
);

// --- 1) 干净上下文里 localStorage 能否跨重载存活 ---
const ctx2 = await browser.newContext();
const p2 = await ctx2.newPage();
out.freshCtxEmpty = await p2.evaluate(() => { try { return String(localStorage.length); } catch (e) { return 'THROW:' + e.message; } });
await p2.goto(`${PAGE}#grid+dark+panel`);
out.freshCtxAfterGoto = await p2.evaluate(() => {
  let ls = 'n/a'; try { ls = localStorage.getItem('newtab.settings') ?? 'null'; } catch (e) { ls = 'THROW:' + e.message; }
  return { style: document.documentElement.dataset.style, ls, hasLocalStorage: typeof localStorage !== 'undefined' };
});
await p2.locator('#engine').click();
const written = await p2.evaluate(() => { try { return localStorage.getItem('newtab.settings'); } catch (e) { return 'THROW:' + e.message; } });
await p2.reload();
const afterReload = await p2.evaluate(() => ({
  engine: document.getElementById('engine-value').textContent,
  style: document.documentElement.dataset.style,
}));
out.persist = { written, afterReload };

await browser.close();
console.log(JSON.stringify(out, null, 2));
