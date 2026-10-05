/**
 * 视觉回归测试配置：把「四套风格各长什么样」变成可以断言的基准图。
 *
 * 为什么不下载浏览器：用本机已装的 Chrome（channel: 'chrome'），
 * 所以不需要跑 `npx playwright install`（那一步要走 playwright 的 CDN，本机 github 被拦会失败）。
 *
 * 两个 project：
 *   chrome    —— 打开本地 html 文件做视觉/行为回归（channel: 'chrome'，与你的眼睛看到的是同一个浏览器）；
 *   extension —— 真的把扩展装进浏览器、验证 manifest 与 chrome.storage.sync（channel: 'chromium'，
 *                因为 Google Chrome 与 Edge 已经移除了命令行侧载扩展的开关，只有 Chromium 还认）。
 *
 * 用法：
 *   npm run test:visual           # 与 scripts/__screenshots__ 下的基准图比对
 *   npm run test:visual:update    # 样式有意改动后，重新生成基准图
 *   npm run test:ext              # 只跑扩展那 8 条（T1–T8）
 *   npm run test:all              # 两套都跑
 *
 * 注意：这些文件只服务开发期校验。扩展本身仍是原生 HTML/CSS/JS、零构建、零运行时依赖。
 */
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './scripts',
  // 测试产物（差分图等）扔进 tmp，不污染交付物
  outputDir: './tmp/pw-artifacts',
  reporter: [['list']],
  expect: {
    toHaveScreenshot: {
      // 同一台机器、同一个 Chrome 下渲染是确定性的（已用 SHA256 逐字节验证），所以容差设 0。
      //
      // 注意 threshold：pixelmatch 默认 threshold 是 0.2（YIQ 感知色差），小于阈值的像素
      // 根本不计入 diff，于是 maxDiffPixels: 0 会被绕成"无限豁免"——实测把 --gray-500
      // 从 #5d5d5d 改成 #6d6d6d（16 级中性灰漂移，正是本设计语言最典型的改法）时
      // 10 条测试全绿。必须把 threshold 也压到 0，"一个像素不同就失败"才是真的。
      maxDiffPixels: 0,
      threshold: 0,
      animations: 'disabled',
    },
  },
  // 基准图跟着测试脚本走，方便一起提交。
  // 路径里带 {platform}：换一台机器时不会覆盖本机基准图（不加就会互相覆盖，表现为"莫名变红"）。
  snapshotPathTemplate: '{testDir}/__screenshots__/{platform}/{arg}{ext}',
  projects: [
    {
      name: 'chrome',
      testIgnore: '**/extension.spec.mjs',
      fullyParallel: true,
      use: {
        channel: 'chrome',
        headless: true,
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 1,
        colorScheme: 'light',
      },
    },
    {
      name: 'extension',
      testMatch: '**/extension.spec.mjs',
      // 扩展用例要开一个持久化 profile、并且反复重启浏览器，并行只会互相抢 profile 目录
      fullyParallel: false,
      workers: 1,
      /* 这里不写 channel: 'chromium'：Playwright 1.63 要的是 chromium-1243，
         而本机 playwright 的 CDN 连不上（ECONNRESET）。spec 自己去找本机已缓存的
         chromium-XXXX 并用 executablePath 启动，找不到才回落到 channel。 */
      use: {
        headless: true,
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 1,
        colorScheme: 'light',
        /* 默认的动作超时是"不超时"，一旦元素不在（例如页面被导航走了），
           用例会一直等到 120 秒的总超时，看不出真正卡在哪。给个短一点的界限，让它快点红。 */
        actionTimeout: 15_000,
        navigationTimeout: 30_000,
        // 扩展用例不做像素比对（Chromium 与你本机 Chrome 的渲染不保证一致）
      },
    },
  ],
});
