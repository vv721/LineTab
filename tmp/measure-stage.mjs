import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(pathToFileURL(path.join(ROOT, 'Preview.html')).href + '#grid');
await page.waitForTimeout(200);
console.log(JSON.stringify(await page.evaluate(() => {
  const r = (sel) => { const el = document.querySelector(sel); if (!el) return null;
    const b = el.getBoundingClientRect(); const cs = getComputedStyle(el);
    return { top: Math.round(b.top), h: Math.round(b.height), bg: cs.backgroundColor, minH: cs.minHeight }; };
  return { innerH: window.innerHeight, docH: document.documentElement.scrollHeight,
    html: r('html'), body: r('body'), stage: r('.stage'), page: r('.stage .page'), refs: r('.refs') };
}), null, 1));
await browser.close();
