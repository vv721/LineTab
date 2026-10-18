/* 一次性：读滑块那两段轨迹实际解析成什么颜色（排查"未填充那段看着是白的"）。
   跑法：node tmp/probe-slider.mjs   （需要 channel: 'chrome'，项目不下载浏览器） */
import { chromium } from 'playwright';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = path.resolve(import.meta.dirname, '..');
const PAGE = pathToFileURL(path.join(ROOT, 'Preview.html')).href;
const browser = await chromium.launch({ channel: 'chrome', headless: true });

for (const hash of ['paper+panel', 'grid+panel', 'clay+panel', 'grid+dark+panel']) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', e => console.log('PAGEERROR', hash, e.message));
  await page.goto(`${PAGE}#${hash}`);
  await page.waitForTimeout(900);
  const facts = await page.evaluate(() => {
    const input = document.querySelector('.stage [data-param]');
    const s = getComputedStyle(input);
    return {
      image: s.backgroundImage,
      appearance: s.appearance,
      fill: s.getPropertyValue('--slider-fill').trim(),
      rest: s.getPropertyValue('--border-strong').trim(),
      frac: s.getPropertyValue('--slider-frac').trim(),
      radius: s.borderRadius,
      track: s.height,
    };
  });
  console.log(hash, JSON.stringify(facts, null, 0));
  await page.close();
}
await browser.close();
