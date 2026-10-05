// 探针：确认暗色真的生效、且两套风格族的身份还分得开（不是只靠肉眼觉得"挺暗的"）。
// 读的是 computed style，所以看的确实是生效值，不是源码里写了什么。
// （B 雾青 / D 夜墨已按 m02255 删除，所以这里只剩 A 纸白与 C 点阵。）
//
// 跑法：node tmp/probe-dark.mjs
import { chromium } from 'playwright';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = path.resolve(import.meta.dirname, '..');
const PAGE = pathToFileURL(path.join(ROOT, 'newtab.html')).href;

const read = () =>
  Object.fromEntries(
    ['--bg', '--surface', '--text-2', '--text-3', '--ring', '--dot'].map((name) => [
      name,
      getComputedStyle(document.documentElement).getPropertyValue(name).trim(),
    ])
  );

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

for (const shot of ['paper+dark', 'grid+dark']) {
  await page.goto(`${PAGE}#${shot}`);
  // 坑：只换 hash 是同文档导航，脚本不会重跑 —— 必须 reload 才是"新开一次"
  await page.reload();
  const tokens = await page.evaluate(read);
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const dot = await page.evaluate(() => getComputedStyle(document.querySelector('.page')).backgroundImage);
  console.log(shot.padEnd(12), JSON.stringify(tokens), 'body.bg =', bg, '| dot =', dot.slice(0, 60));
}

await browser.close();
