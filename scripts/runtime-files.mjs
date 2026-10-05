// ============================================================
// 运行文件白名单：**打包与校验共用的唯一来源**。
//
// 只有这里列出的文件是扩展运行时真的会用到的。
// 其余东西（探索页、设计文档、规格、探针脚本、浏览器基准图、图标生成脚本）
// 都留在仓库里，但不进安装包 —— 商店受理的包越小、越"看得出在干什么"越好。
//
// 加新运行文件时改这一处即可，check-extension.mjs 与 pack.mjs 都会跟着认。
// ============================================================

import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/* 扩展本体只放这一个目录：它既是"能直接装进 Chrome 的东西"（装载时选它），
   也是打包的输入目录。中间产物、文档、脚本都不在这里面，所以目录本身就是干净的。 */
export const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const EXT_DIR = join(PROJECT_ROOT, 'LineTab');

export const RUNTIME_FILES = [
  'manifest.json',
  'newtab.html',
  'newtab.css',
  'newtab.js',
  'tokens.css',
  'icon16.png',
  'icon32.png',
  'icon48.png',
  'icon128.png',
];

/* 页面里允许出现的、指向扩展自己文件的引用方式：都必须是白名单里的文件名。
   manifest.json 与图标不由页面引用，所以不在这个集合里。 */
export const PAGE_ASSETS = RUNTIME_FILES.filter((name) => /\.(html|css|js)$/.test(name) && name !== 'manifest.json');

/* 允许出现在代码里的外部地址：只有"搜索跳转目标"这一类。
   它们不是加载资源，是用户按下回车之后浏览器要去的地方 —— 判定时按上下文区分。 */
export const ALLOWED_EXTERNAL_URLS = [
  'https://www.bing.com/search?q=',
  'https://www.google.com/search?q=',
];
