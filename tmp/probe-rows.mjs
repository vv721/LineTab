// 看几个镜头 hash 下，面板每行显示什么 + 舞台的 data-theme / data-style
// 用法：node tmp/probe-rows.mjs
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const hashes = process.argv.slice(2);
for (const h of (hashes.length ? hashes : ['grid-dark-panel+bare', 'paper+panel+bare', 'paper+dark+panel+bare', 'clay+panel+bare'])) {
  // 每个 hash 用一个新 page：同 page 换 hash 不会重新跑脚本
  const p = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  p.on('pageerror', e => console.log('  [pageerror]', e.message));
  p.on('console', m => { if (m.type() === 'error') console.log('  [console]', m.text()); });
  await p.goto(`${pathToFileURL('Preview.html').href}#${h}`, { waitUntil: 'load' });
  await p.waitForTimeout(200);
  const info = await p.evaluate(() => {
    const s = document.querySelector('.stage');
    return {
      hash: location.hash,
      style: s.dataset.style,
      theme: s.dataset.theme || '(无)',
      panelOpen: !s.querySelector('.panel').hasAttribute('hidden'),
      rows: [...s.querySelectorAll('.panel .row')]
        .map(r => `${r.querySelector('.rl')?.textContent.trim()}=${(r.querySelector('.rv')?.textContent || r.querySelector('output')?.textContent || '?').trim()}`),
    };
  });
  console.log(`#${h} → hash=${info.hash} style=${info.style} theme=${info.theme} panel=${info.panelOpen}`);
  console.log(`  ${info.rows.join(' | ')}`);
  await p.close();
}
await browser.close();
