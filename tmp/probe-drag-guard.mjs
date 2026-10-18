// 证明「抓滑块头拖动」那条回归测试不是摆设（复核 P1）：
//   固定状态下命中落回原生 input → 拖得动；
//   把装饰层（.sl::after 与 .knob）的 pointer-events 还原成 auto → 命中被它们截走 → 拖不动。
// 用法：node tmp/probe-drag-guard.mjs
import { chromium } from 'playwright';

const url = new URL('Preview.html', 'file:///D:/桌面/dsh/newtab-extension/').href + '#paper+panel';
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(url);
await page.waitForSelector('#mark-align');

const row = page.locator('.stage .panel .row').filter({ has: page.locator('#mark-align') });
const range = page.locator('#mark-align');
const out = row.locator('output');

const setValue = v => range.evaluate((el, x) => {
  el.value = x;
  el.dispatchEvent(new Event('input', { bubbles: true }));
}, v);

async function dragToEnd() {
  const box = await range.boundingBox();
  const y = box.y + box.height / 2;
  await setValue('1');
  const knobX = box.x + 7 + 0.5 * (box.width - 14);
  const hit = await page.evaluate(([x, yy]) => {
    const el = document.elementFromPoint(x, yy);
    return el ? (el.tagName + (el.className ? '.' + el.className : '')) : '(null)';
  }, [knobX, y]);
  await page.mouse.move(knobX, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 2, y, { steps: 5 });
  await page.mouse.up();
  return { hit, value: await range.inputValue(), text: (await out.textContent()).trim() };
}

const fixed = await dragToEnd();
console.log(`装饰层 pointer-events: none  → 头心命中 ${fixed.hit}，拖到最右后 value=${fixed.value} 读数=${fixed.text}`);

await page.addStyleTag({ content: '.sl::after, .sl .knob { pointer-events: auto !important; }' });
const broken = await dragToEnd();
console.log(`装饰层 pointer-events: auto  → 头心命中 ${broken.hit}，拖到最右后 value=${broken.value} 读数=${broken.text}`);

const ok = fixed.hit.startsWith('INPUT') && fixed.value === '2'
  && !broken.hit.startsWith('INPUT') && broken.value === '1';
console.log(ok ? 'PASS：回归测试确实能抓到「头抓不动」' : 'FAIL：对照没成立，回归测试可能是空洞的');
await browser.close();
process.exit(ok ? 0 : 1);
