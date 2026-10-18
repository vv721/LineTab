// 一次性：拍 Preview.html 里暖陶「亮 → 暗」过场（D1 逐色渐变）的中间帧。
// 420ms 在 60Hz 上只有 ~25 帧，中间帧太窄截图不稳，所以先把 --dur-theme 拉到 4000ms 再按比例停住。
// 跑法：node tmp/shots-clay-d1.mjs（工作目录 newtab-extension），图落在 tmp/lab-shots/。
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PAGE = pathToFileURL(path.join(ROOT, 'Preview.html')).href;
const OUT = path.join(ROOT, 'tmp', 'lab-shots');
const SLOW = 4000;

const browser = await chromium.launch({ channel: 'chrome', headless: true });

const shoot = async (name, ratio) => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await page.goto(`${PAGE}#clay`);
  await page.waitForTimeout(200);
  await page.evaluate(dur => {
    document.querySelector('.stage[data-style="clay"]').style.setProperty('--dur-theme', `${dur}ms`);
  }, SLOW);
  await page.evaluate(() => {
    document.querySelector('.stage[data-style="clay"]').setAttribute('data-theme', 'dark');
  });
  await page.waitForTimeout(Math.round(SLOW * ratio));
  await page.screenshot({ path: path.join(OUT, `clay-d1-${name}.png`), animations: 'allow' });
  await page.close();
  console.log(`  ${name}  ${Math.round(SLOW * ratio)}ms`);
};

console.log('暖陶 D1 过场的中间帧：');
await shoot('light', 0);
await shoot('mid30', 0.3);
await shoot('mid50', 0.5);
await shoot('mid70', 0.7);
await shoot('dark', 0.999);
await browser.close();
