// 一次性量具：第 07 节样张的几何与点阵取值（排查版式重叠与点子看不见）
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const root = path.join(import.meta.dirname, '..');
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });
await page.goto(pathToFileURL(path.join(root, '细节体验.html')).href);
await page.waitForTimeout(400);
await page.click('[data-sk-go="a1"][data-sk-to="grid"]');
await page.waitForTimeout(1400);

const out = await page.evaluate(() => {
  const host = document.querySelector('.sk-demo[data-sk="a1"]');
  const stage = host.querySelector('.sk-stage');
  const cs = getComputedStyle(stage);
  const box = (el) => {
    const r = el.getBoundingClientRect();
    return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)];
  };
  const one = (sel) => box(stage.querySelector(sel));
  return {
    host: box(host),
    stage: box(stage),
    stagePosition: cs.position,
    panel: one('.sk-panel'),
    menu: one('.sk-menu'),
    search: one('.sk-search'),
    searchBorder: getComputedStyle(stage.querySelector('.sk-search')).borderBottomColor,
    backgroundImage: cs.backgroundImage.slice(0, 80),
    backgroundSize: cs.backgroundSize,
    dot: cs.getPropertyValue('--dot').trim(),
    dotSize: cs.getPropertyValue('--dot-size').trim(),
    dataStyle: stage.parentElement.dataset.style,
  };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
