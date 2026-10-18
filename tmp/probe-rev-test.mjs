/* 审查用（一次性）：① --slider-frac 的断言是否与令牌默认值同值（测试会不会空过）
   ② 键盘 Tab 聚焦后焦点环是否真的画出来
   跑法：node tmp/probe-rev-test.mjs */
import { chromium } from 'playwright';

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(new URL('../Preview.html?revtest=1#paper+panel', import.meta.url).href);
await page.waitForTimeout(400);

const fracOf = id => page.evaluate((sel) => {
  const i = document.querySelector(sel);
  return { inline: i.parentElement.style.getPropertyValue('--slider-frac'),
    computed: getComputedStyle(i).getPropertyValue('--slider-frac').trim(),
    value: i.value };
}, id);

console.log('align（测试断言的那一行）：', JSON.stringify(await fracOf('#mark-align')));
console.log('size（同一批的另一行）：   ', JSON.stringify(await fracOf('#mark-size')));

// 把画布上的行内值摘掉：如果 computed 仍是 0.5，说明 m04538 那条断言"没有脚本也是 0.5"，测不出接线断没断
const removed = await page.evaluate(() => {
  const i = document.querySelector('#mark-align');
  i.parentElement.style.removeProperty('--slider-frac');
  return getComputedStyle(i).getPropertyValue('--slider-frac').trim();
});
console.log('摘掉行内 --slider-frac 后，align 的 computed =', JSON.stringify(removed));

// 键盘：Tab 到滑块（先点面板外面，再 Shift+Tab 逆序找；直接用 focus 后看 :focus-visible）
const focus = await page.evaluate(() => {
  const i = document.querySelector('#mark-align');
  i.focus();
  const cs = getComputedStyle(i);
  return { focusVisible: i.matches(':focus-visible'), outlineWidth: cs.outlineWidth,
    outlineStyle: cs.outlineStyle, outlineColor: cs.outlineColor, outlineOffset: cs.outlineOffset };
});
console.log('聚焦态：', JSON.stringify(focus));

// 真键盘走到滑块：从 body 开始按 Tab，看第几个 Tab 落在 input[type=range] 上
await page.evaluate(() => document.body.focus());
let tabs = 0, landed = null;
for (let n = 0; n < 30; n += 1) {
  await page.keyboard.press('Tab');
  tabs += 1;
  landed = await page.evaluate(() => {
    const a = document.activeElement;
    return { tag: a.tagName.toLowerCase(), id: a.id, type: a.type || '',
      focusVisible: a.matches(':focus-visible') };
  });
  if (landed.tag === 'input' && landed.type === 'range') break;
}
console.log(`第 ${tabs} 次 Tab 落点：`, JSON.stringify(landed));

await browser.close();
