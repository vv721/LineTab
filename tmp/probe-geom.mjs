/* 一次性探针：验证 /review 抓到的「几何硬切」已经修好。
   做法：把 --dur-theme 拉长到 1000ms，在换肤中途（约 400ms）读舞台上的 --panel-r / --slider-r
   以及 .panel 与滑块头实际算出来的 border-radius。
   判据：中途必须是**中间值**（既不是 4px/2px，也不是 12px/9999px）。
   修之前实测：第 38ms 圆角就已经是终值 4px，而 --panel-bg 才走到一半。 */
import { chromium } from 'playwright';

const url = new URL('../Preview.html', import.meta.url).href + '#grid';
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(url);
await page.waitForTimeout(400); // 等首屏播种与 data-booting 摘掉

const read = () => page.evaluate(() => {
  const stage = document.querySelector('.stage');
  const cs = getComputedStyle(stage);
  const panel = document.querySelector('.panel');
  const thumb = document.querySelector('.panel input[type="range"]');
  return {
    panelR: cs.getPropertyValue('--panel-r').trim(),
    sliderR: cs.getPropertyValue('--slider-r').trim(),
    panelRadius: panel ? getComputedStyle(panel).borderRadius : '(无 .panel)',
    thumbRadius: thumb ? getComputedStyle(thumb).borderRadius : '(无滑块)',
  };
});

const before = await read();

// 用户切换皮肤时走的就是这条：改 data-style，过渡由 [data-style] 那条规则接管
await page.evaluate(() => document.querySelector('.stage').style.setProperty('--dur-theme', '1000ms'));
await page.evaluate(() => document.querySelector('.stage').setAttribute('data-style', 'paper'));
await page.waitForTimeout(400);
const mid = await read();
await page.waitForTimeout(800);
const end = await read();

console.log('起点（点阵）  ', JSON.stringify(before));
console.log('中途 ~400ms  ', JSON.stringify(mid));
console.log('终点（纸白）  ', JSON.stringify(end));

const midIsBetween = (v, a, b) => {
  const n = parseFloat(v);
  return n > Math.min(a, b) + 0.5 && n < Math.max(a, b) - 0.5;
};
const okPanel = midIsBetween(mid.panelR, 4, 12) && midIsBetween(mid.panelRadius, 4, 12);
const okSlider = mid.sliderR !== before.sliderR && mid.sliderR !== end.sliderR
  && mid.thumbRadius !== before.thumbRadius && mid.thumbRadius !== end.thumbRadius;
console.log(okPanel ? 'PASS 面板圆角在过渡中途是中间值' : `FAIL 面板圆角硬切：${mid.panelR} / ${mid.panelRadius}`);
console.log(okSlider ? 'PASS 滑块头圆角在过渡中途是中间值' : `FAIL 滑块头圆角硬切：${mid.sliderR} / ${mid.thumbRadius}`);

await browser.close();
process.exit(okPanel && okSlider ? 0 : 1);
