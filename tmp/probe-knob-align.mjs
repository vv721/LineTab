/* 一次性：验"滑块头的心"与"已填充轨迹的右端"是否落在同一个横坐标上（用户 m04538 的偏移）。
   DOM 侧量头的矩形（头是画布上的真元素），像素侧量已填充的右边界（先把头藏起来，再看蓝到哪）——
   两条路各走一遍，谁也没法自证。结果写 tmp/lab-shots/knob-align.json，交给 analyze-knob-align.py 比对。
   跑法：node tmp/probe-knob-align.mjs */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

mkdirSync('tmp/lab-shots', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 6 });

const rows = [];
for (const skin of ['paper', 'grid', 'clay']) {
  // 带一个查询串：只改 #hash 的导航不会重新加载文档，boot 脚本就不会重新读皮肤
  await page.goto(new URL(`../Preview.html?probe=${skin}#${skin}+panel`, import.meta.url).href);
  await page.waitForTimeout(400);
  await page.addStyleTag({ content: '* { transition: none !important; }' });

  const facts = await page.evaluate(() => [...document.querySelectorAll('[data-param]')].map((el) => {
    const canvas = el.closest('.sl');
    const cr = canvas.getBoundingClientRect();
    const kr = canvas.querySelector('.knob').getBoundingClientRect();
    const cs = getComputedStyle(canvas.querySelector('.knob'));
    // 头的大小是个令牌（纸白 14px / 点阵 10px，用户 m05406），公式和 DOM 都从它算 —— 别再写死 14
    const knob = Number.parseFloat(getComputedStyle(canvas).getPropertyValue('--slider-knob'));
    const frac = Number(canvas.style.getPropertyValue('--slider-frac'));
    return {
      id: el.id,
      frac,
      want: (Number(el.value) - Number(el.min)) / ((Number(el.max) - Number(el.min)) || 1),
      canvasW: Number(cr.width.toFixed(3)),
      knobSize: knob,
      knobCenter: Number((kr.x - cr.x + kr.width / 2).toFixed(3)),
      fillRight: Number((knob / 2 + frac * (cr.width - knob)).toFixed(3)),
      knobRadius: cs.borderRadius,
      knobFill: cs.backgroundColor,
      clip: { x: cr.x, y: cr.y, width: cr.width, height: cr.height },
    };
  }));

  // 像素侧：藏起滑块头，只留两段轨迹
  const hide = await page.addStyleTag({ content: '.sl .knob { display: none !important; }' });
  for (const f of facts) {
    await page.screenshot({ path: `tmp/lab-shots/fill-${skin}-${f.id}.png`, clip: f.clip });
  }
  await hide.evaluate(el => el.remove());

  facts.forEach(f => rows.push({ skin, ...f, clip: undefined }));
  console.log(`${skin}: ` + facts.map(f => `${f.id} frac=${f.frac.toFixed(4)} 头心=${f.knobCenter} `
    + `半径=${f.knobRadius} 填充=${f.knobFill}`).join(' | '));
}

writeFileSync('tmp/lab-shots/knob-align.json', JSON.stringify(rows, null, 1));
console.log('rows:', rows.length, '→ tmp/lab-shots/knob-align.json');
await browser.close();
