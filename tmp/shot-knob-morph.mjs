/* 一次性量具：把"纸白 → 点阵"那一次换肤里的滑块头形变逐格拍下来（用户 m05406）。
   做法：把 --dur-theme 行内拉到 2400ms，点设置面板「风格」那行的"点阵"，
   然后在 0 / 25 / 50 / 75 / 100% 五个时刻各拍一张（含轨道与读数），并打印
   当时的 --slider-knob / --slider-r 与 .knob 的实际 width / border-radius。
   跑完把 morph-0..4.png 纵向拼成 tmp/lab-shots/knob-morph.png（另一步用 Pillow）。 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'tmp', 'lab-shots');
const DUR = 2400;

await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 3 });
await page.goto(`${pathToFileURL(path.join(ROOT, 'Preview.html')).href}#paper+panel`);
await page.locator('.stage').waitFor();
await page.waitForTimeout(300);

const stage = page.locator('.stage');
await stage.evaluate((el, d) => el.style.setProperty('--dur-theme', `${d}ms`), DUR);

const read = () => page.evaluate(() => {
  const cs = getComputedStyle(document.querySelector('.stage'));
  const s = getComputedStyle(document.querySelector('.sl .knob'));
  const w = Number.parseFloat(s.width);
  return {
    time: null,
    knob: Number.parseFloat(cs.getPropertyValue('--slider-knob')),
    r: Number.parseFloat(cs.getPropertyValue('--slider-r')),
    w,
    radius: Number.parseFloat(s.borderTopLeftRadius),
    seen: Math.min(Number.parseFloat(s.borderTopLeftRadius), w / 2),
  };
});

const shot = async (i) => {
  const box = await page.locator('.sl').first().boundingBox();
  const pad = 54;
  await page.screenshot({
    path: path.join(OUT, `morph-${i}.png`),
    clip: { x: box.x - pad, y: box.y - pad, width: box.width + pad * 2, height: box.height + pad * 1.4 },
  });
};

const samples = [];
samples.push(await read());
await shot(0);

const styleRow = page.locator('.stage .panel .row', { hasText: '风格' }).first();
await styleRow.locator('.rv').click();
const t0 = Date.now();
await styleRow.locator('.menu-opt[data-value="grid"]').click();
for (const frac of [0.25, 0.5, 0.75, 1]) {
  const target = frac * DUR;
  const wait = target - (Date.now() - t0);
  if (wait > 0) await page.waitForTimeout(wait);
  const s = await read();
  s.time = Math.round(Date.now() - t0);
  samples.push(s);
  await shot([0.25, 0.5, 0.75, 1].indexOf(frac) + 1);
}

console.log(JSON.stringify(samples, null, 1));
await browser.close();
