import { chromium } from 'playwright';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const PAGE = pathToFileURL(path.resolve('Preview.html')).href;
const b = await chromium.launch({ channel: 'chrome', headless: true });
const p = await b.newPage();
await p.goto(PAGE + '#clay+panel');
await p.waitForTimeout(800);
const out = await p.evaluate(() => {
  const stage = document.querySelector('.stage');
  const q = stage.querySelector('.q');
  const tag = stage.querySelector('.search .tag');
  const rows = [...stage.querySelectorAll('.panel .row')].map(r => (r.querySelector('.rl')?.textContent || '(无标签)') + '=' + (r.querySelector('.rv')?.textContent || ''));
  return { rows, count: rows.length, ph: String(q.getAttribute('placeholder')), hasPh: q.hasAttribute('placeholder'), aria: q.getAttribute('aria-label') };
});
console.log(JSON.stringify(out, null, 1));
await b.close();
