/* 读一个已启动的 Chromium（带 --remote-debugging-port）里新标签页的焦点实况。
   用途：判断"新建标签页后焦点在地址栏还是在我的搜索框"，这是页面自己看不到的部分
   （文档说"地址栏总是先拿到焦点"，所以要看 document.hasFocus() 与 activeElement 的组合）。
   用法：node tmp/omnibox/probe.mjs [端口] */
import { chromium } from 'playwright';

const port = process.argv[2] ?? '9333';
const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);

const out = [];
for (const context of browser.contexts()) {
  for (const page of context.pages()) {
    const url = page.url();
    if (!url.startsWith('chrome-extension://') && !url.startsWith('chrome://newtab')) continue;
    const info = await page.evaluate(() => {
      const active = document.activeElement;
      return {
        hasFocus: document.hasFocus(),
        activeTag: active ? active.tagName.toLowerCase() : null,
        activeId: active && active.id ? active.id : null,
        qValue: document.getElementById('q') ? document.getElementById('q').value : null,
        visibility: document.visibilityState,
        keys: window.__keys || null,
      };
    });
    out.push({ url, ...info });
  }
}

console.log(JSON.stringify(out, null, 2));
await browser.close(); // 只是断开 CDP 连接，不会关掉浏览器
