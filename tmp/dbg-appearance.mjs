import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const b = await chromium.launch({ channel: 'chrome' });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto(pathToFileURL(path.join(ROOT, 'Preview.html')).href + '#clay+panel');
await p.waitForTimeout(200);
const out = await p.evaluate(() => {
  const stage = document.querySelector('.stage');
  const menu = stage.querySelector('.menu');
  const tag = stage.querySelector('.search .tag');
  const q = stage.querySelector('.q');
  const o = {};
  for (const s of ['paper', 'grid', 'clay']) {
    stage.dataset.style = s;
    o[s] = [getComputedStyle(menu).boxShadow.replace(/\s+/g, ' '), tag.textContent, JSON.stringify(q.placeholder)].join(' | ');
  }
  return JSON.stringify(o, null, 1);
});
console.log(out);
await b.close();
