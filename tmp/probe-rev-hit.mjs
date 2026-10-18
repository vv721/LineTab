/* 审查用（一次性）：滑块自绘后，命中测试还落在原生 input 上吗？
   ① elementFromPoint 看滑块头/已填充/未填充三处各命中谁
   ② 真鼠标从"滑块头"上按下拖动 → 值变不变；从"未填充轨迹"上按下 → 值变不变
   ③ 键盘：focus 后按 → 值变不变
   跑法：node tmp/probe-rev-hit.mjs */
import { chromium } from 'playwright';

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const url = new URL('../Preview.html?revhit=1#paper+panel', import.meta.url).href;
await page.goto(url);
await page.waitForTimeout(400);
await page.addStyleTag({ content: '* { transition: none !important; }' });

const who = el => (el ? `${el.tagName.toLowerCase()}.${el.className || '(none)'}` : 'null');

const geom = await page.evaluate(() => {
  const input = document.querySelector('#mark-size');
  const canvas = input.closest('.sl');
  const cr = canvas.getBoundingClientRect();
  const kr = canvas.querySelector('.knob').getBoundingClientRect();
  const at = (x, y) => {
    const el = document.elementFromPoint(x, y);
    return el ? `${el.tagName.toLowerCase()}.${el.className || '(none)'}` : 'null';
  };
  const cy = cr.y + cr.height / 2;
  const isInput = (x, y) => document.elementFromPoint(x, y) === input;
  return {
    canvas: { x: cr.x, y: cr.y, w: cr.width, h: cr.height },
    knob: { cx: kr.x + kr.width / 2, cy: kr.y + kr.height / 2 },
    hitAtKnobCenter: at(kr.x + kr.width / 2, kr.y + kr.height / 2),
    hitAtFilledMid: at(cr.x + 12, cy),
    hitAtFillTopBand: at(cr.x + 12, cr.y + 1),
    hitAtRestMid: at(cr.x + cr.width - 8, cy),
    inputReached: {
      knobCenter: isInput(kr.x + kr.width / 2, kr.y + kr.height / 2),
      filledMid: isInput(cr.x + 12, cy),
      fillTopBand: isInput(cr.x + 12, cr.y + 1),
      restMid: isInput(cr.x + cr.width - 8, cy),
    },
  };
});
console.log('几何与命中：', JSON.stringify(geom, null, 1));

const inputValue = () => page.evaluate(() => document.querySelector('#mark-size').value);
const knobBox = async () => page.evaluate(() => {
  const k = document.querySelector('#mark-size').closest('.sl').querySelector('.knob').getBoundingClientRect();
  return { x: k.x + k.width / 2, y: k.y + k.height / 2 };
});

// ②a 从头心上按下、往右拖
await page.evaluate(() => { const i = document.querySelector('#mark-size'); i.value = '41'; i.dispatchEvent(new Event('input', { bubbles: true })); });
const k = await knobBox();
const before = await inputValue();
await page.mouse.move(k.x, k.y);
await page.mouse.down();
await page.mouse.move(k.x + 40, k.y, { steps: 6 });
await page.mouse.up();
console.log(`②a 从头心(${k.x.toFixed(1)},${k.y.toFixed(1)})拖动：value ${before} → ${await inputValue()}`);

// ②b 从已填充轨迹（头左侧 12px 处）上按下、往左拖
await page.evaluate(() => { const i = document.querySelector('#mark-size'); i.value = '41'; i.dispatchEvent(new Event('input', { bubbles: true })); });
const c = geom.canvas;
const before2 = await inputValue();
await page.mouse.move(c.x + 12, c.y + c.h / 2);
await page.mouse.down();
await page.mouse.move(c.x + 12, c.y + c.h / 2 + 2, { steps: 2 });
await page.mouse.up();
console.log(`②b 从已填充轨迹按下：value ${before2} → ${await inputValue()}`);

// ②c 从未填充轨迹（右端 8px）上按下
await page.evaluate(() => { const i = document.querySelector('#mark-size'); i.value = '41'; i.dispatchEvent(new Event('input', { bubbles: true })); });
const before3 = await inputValue();
await page.mouse.move(c.x + c.w - 8, c.y + c.h / 2);
await page.mouse.down();
await page.mouse.move(c.x + c.w - 8, c.y + c.h / 2 + 2, { steps: 2 });
await page.mouse.up();
console.log(`②c 从未填充轨迹按下：value ${before3} → ${await inputValue()}`);

// ③ 键盘
await page.evaluate(() => { const i = document.querySelector('#mark-size'); i.value = '41'; i.dispatchEvent(new Event('input', { bubbles: true })); i.focus(); });
const before4 = await inputValue();
await page.keyboard.press('ArrowRight');
await page.keyboard.press('ArrowRight');
console.log(`③ 方向键 ×2：value ${before4} → ${await inputValue()}，activeElement=`
  + await page.evaluate(() => document.activeElement.id || document.activeElement.tagName));

await browser.close();
