import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
for (const s of ['paper', 'grid', 'clay']) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(pathToFileURL(path.join(ROOT, 'Preview.html')).href + '#' + s + '+panel');
  await page.waitForTimeout(150);
  const f = await page.evaluate(() => {
    const stage = document.querySelector('.stage');
    const cs = getComputedStyle(stage);
    const slider = stage.querySelector('input[type="range"]');
    return {
      ring: cs.getPropertyValue('--ring').trim(),
      coral: cs.getPropertyValue('--coral-500').trim(),
      accent: getComputedStyle(slider).accentColor,
      menuShadowToken: cs.getPropertyValue('--menu-shadow').trim(),
      markSize: cs.getPropertyValue('--mark-size').trim(),
    };
  });
  console.log(s, JSON.stringify(f));
  await page.close();
}
await browser.close();
