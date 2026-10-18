/* 一次性冒烟：整合后的 Preview.html 能不能在三套风格里都跑起来（无 console 错误 + 关键节点在位）
   用法：node tmp/smoke-preview.mjs */
import { chromium } from '@playwright/test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const PAGE = pathToFileURL(join(here, '..', 'Preview.html')).href;
const browser = await chromium.launch({ channel: 'chrome' });
let bad = 0;

for (const hash of ['#paper', '#grid', '#clay', '#paper+dark+panel', '#grid+menu', '#clay+menu', '#clay+dlg', '#paper+dlg']) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', e => errs.push(String(e)));
  await page.goto(PAGE + hash);
  await page.addStyleTag({ content: '* { transition: none !important; }' });
  await page.waitForTimeout(150);
  const facts = await page.evaluate(() => {
    const stage = document.querySelector('.stage');
    const cs = getComputedStyle(stage);
    const panel = stage.querySelector('.panel');
    const menu = stage.querySelector('[data-menu-key="engine"]');
    const tag = stage.querySelector('.search .tag');
    const q = stage.querySelector('.q');
    const mark = stage.querySelector('.mark');
    const params = [...stage.querySelectorAll('.row-param')];
    return {
      style: stage.dataset.style,
      theme: stage.getAttribute('data-theme') || '(light)',
      menuCount: stage.querySelectorAll('.menu').length,
      menuOpen: !!menu && !menu.hidden,
      menuShadow: menu ? getComputedStyle(menu).boxShadow : null,
      dlgOpen: !stage.querySelector('[data-dlg]').hidden,
      scrim: getComputedStyle(stage.querySelector('[data-dlg]')).backgroundColor,
      panelOpen: !panel.hidden,
      tagText: tag.textContent,
      placeholder: q.placeholder,
      markShown: mark.offsetParent !== null,
      paramsShown: params.filter(p => p.offsetParent !== null).length,
      hintShown: stage.querySelector('.hint').offsetParent !== null,
      menuFont: menu ? getComputedStyle(menu).fontFamily.slice(0, 24) : null,
      cs: [cs.getPropertyValue('--bg').trim(), cs.getPropertyValue('--menu-shadow').trim()],
    };
  });
  const ok = errs.length === 0;
  if (!ok) bad += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${hash.padEnd(18)} style=${facts.style.padEnd(5)} theme=${facts.theme.padEnd(7)} menus=${facts.menuCount} open=${facts.menuOpen ? 'Y' : 'n'} dlg=${facts.dlgOpen ? 'Y' : 'n'} panel=${facts.panelOpen ? 'Y' : 'n'} tag=${facts.tagText.padEnd(6)} ph=${JSON.stringify(facts.placeholder)} mark=${facts.markShown ? 'Y' : 'n'} params=${facts.paramsShown} hint=${facts.hintShown ? 'Y' : 'n'} menuShadow=${(facts.menuShadow || '').slice(0, 30)}`);
  if (errs.length) console.log('     errors:', errs.slice(0, 3));
  await page.close();
}
await browser.close();
console.log(bad ? `FAILED pages: ${bad}` : 'all pages clean');
