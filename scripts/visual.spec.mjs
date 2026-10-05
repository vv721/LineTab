/**
 * 视觉回归测试（开发期校验，不进入扩展产物）。
 *
 * 断的是「风格漂移」：tokens.css / preview.css 里任何一个取值被改动，
 * 这里的基准图比对就会失败，并输出差分图（tmp/pw-artifacts）。
 *
 * 页面是本地文件、零网络请求，所以不需要等 networkidle；
 * 时钟是写死的 09:41（真版本才用真实时间），渲染因此完全确定。
 */
import { test, expect } from '@playwright/test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

// 按脚本自身位置解析页面，而不是当前工作目录——这样从任何目录运行都找得到
// （用 path.resolve('风格预览.html') 会跟着 cwd 走，在别的目录下整轮 ERR_FILE_NOT_FOUND）。
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PAGE = pathToFileURL(path.join(ROOT, '风格预览.html')).href;

/** 镜头清单：[hash 参数, 中文名]。`bare` 表示隐藏底部的看稿工具条。 */
const SHOTS = [
  ['paper', 'A 纸白'],
  ['grid', 'C 点阵'],
  ['paper+dark', 'A 自动暗色'],
  ['grid+dark', 'C 自动暗色'],
  ['paper+panel', 'A 设置面板'],
  ['grid+dark+panel', 'C 暗色 + 设置面板'],
];

for (const [hash, label] of SHOTS) {
  test(`镜头 ${hash}（${label}）`, async ({ page }) => {
    await page.goto(`${PAGE}#${hash}+bare`);

    // 等页面把状态摆好：只显示被选中的那一套
    const stage = page.locator('.stage[data-active]');
    await expect(stage).toBeVisible();
    await expect(stage.locator('.clock')).toHaveText('09:41');

    // 隐藏看稿工具条后，整屏就是真实的新标签页
    await expect(page.locator('.bar')).toBeHidden();

    await expect(page).toHaveScreenshot(`${hash.replace(/\+/g, '-')}.png`);
  });
}

test('设置按钮能把面板打开（aria 与视觉同步）', async ({ page }) => {
  await page.goto(`${PAGE}#paper+bare`);

  const stage = page.locator('.stage[data-active]');
  const button = stage.locator('.settings');
  const panel = stage.locator('.panel');

  await expect(panel).toBeHidden();
  await expect(button).toHaveAttribute('aria-expanded', 'false');

  await button.click();

  await expect(panel).toBeVisible();
  await expect(button).toHaveAttribute('aria-expanded', 'true');
});
