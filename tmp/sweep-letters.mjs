// 清掉"风格名称前的 A/C/E 字母"（用户 m01850 第 5 条）。
// 只改"字母 + 风格名"这种写法（标签与注释里的），A/C 当缩写的散文不动。
import { readFileSync, writeFileSync } from 'node:fs';

const files = {
  'Preview.html': [
    ['只有 E 暖陶 目前还不在真页面的 STYLES 里', '只有 暖陶 目前还不在真页面的 STYLES 里'],
    ['E 暖陶 是底线转珊瑚', '暖陶 是底线转珊瑚'],
    ['//   #paper          —— A 纸白', '//   #paper          —— 纸白'],
    ['//   #grid           —— C 点阵', '//   #grid           —— 点阵'],
  ],
  'LineTab/newtab.js': [
    ["{ id: 'paper', name: 'A 纸白' },", "{ id: 'paper', name: '纸白' },"],
    ["{ id: 'grid', name: 'C 点阵' },", "{ id: 'grid', name: '点阵' },"],
    ['// 默认 A 纸白；另一套 C 点阵在面板「风格」里切', '// 默认 纸白；另一套 点阵在面板「风格」里切'],
    ['—— C 点阵', '—— 点阵'],
    ['—— C 点阵 + 常暗 + 面板', '—— 点阵 + 常暗 + 面板'],
    ['—— C 点阵 + `>` 左侧元素 + 焦点时界面不动', '—— 点阵 + `>` 左侧元素 + 焦点时界面不动'],
    ['—— C 点阵 + 跟随系统（看暗色下点阵还在不在）', '—— 点阵 + 跟随系统（看暗色下点阵还在不在）'],
  ],
  'LineTab/newtab.html': [['<span id="style-value">A 纸白</span>', '<span id="style-value">纸白</span>']],
  'scripts/extension.spec.mjs': [
    ["await expect(page.locator('#style-value')).toHaveText('A 纸白');", "await expect(page.locator('#style-value')).toHaveText('纸白');"],
    ["await page.locator('#style').click(); // 切到 C 点阵 → 只写进了本地镜像", "await page.locator('#style').click(); // 切到 点阵 → 只写进了本地镜像"],
    ["await expect(page.locator('#style-value')).toHaveText('C 点阵');", "await expect(page.locator('#style-value')).toHaveText('点阵');"],
  ],
  'LineTab/newtab.css': [['/* C 点阵的底纹', '/* 点阵的底纹']],
  'LineTab/tokens.css': [
    ['/* 点阵（C）的纸色与点色', '/* 点阵的纸色与点色'],
  ],
};

for (const [rel, pairs] of Object.entries(files)) {
  const buf = readFileSync(rel);
  const bom = buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf;
  let t = buf.toString('utf8');
  let n = 0;
  for (const [from, to] of pairs) {
    if (!t.includes(from)) {
      console.log(`  MISS ${rel}: ${from.slice(0, 40)}`);
      continue;
    }
    // 用 split/join 全量替换，避免 replace 只看第一处
    const parts = t.split(from);
    n += parts.length - 1;
    t = parts.join(to);
  }
  writeFileSync(rel, (bom ? '\uFEFF' : '') + t, 'utf8');
  console.log(`${rel}: 替换 ${n} 处`);
}
