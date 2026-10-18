// 点阵「点与底差多少」体检（定案版）：解析 tokens.css 里 点阵 的两组值，
// 算出「点覆盖在底上」之后的色差 ΔRGB 与 WCAG 对比度。
// 背景：用户最初反馈"点和背景的颜色太相像"（旧的 4.5% 黑点 Δ 只有 10.8），
// 从 8 版候选里选定 n3（浅色）与 d2（暗色）后，这个脚本用来钉住定案值。
// 跑法：node tmp/check-dots.mjs
import { readFileSync } from 'node:fs';

// 令牌源在 LineTab/tokens.css（早先脚本还在仓库根目录时写在 tmp/ 的兄弟位置）
const css = readFileSync(new URL('../LineTab/tokens.css', import.meta.url), 'utf8');

// 先收全 --x: value，再做一层 var() 解析（够用：纸色/点色都只引用一次基础层令牌）
const declared = new Map([...css.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(([, k, v]) => [k, v.trim()]));
const deref = (value) => {
  const m = value.match(/^var\((--[\w-]+)\)$/);
  return m ? deref(declared.get(m[1]) ?? value) : value;
};

const parseColor = (text) => {
  const hex = text.match(/#([0-9a-f]{6})/i);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return { rgb: [(n >> 16) & 255, (n >> 8) & 255, n & 255], a: 1 };
  }
  const fn = text.match(/rgb\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\/\s*([\d.]+)%\s*\)/);
  return fn ? { rgb: [+fn[1], +fn[2], +fn[3]], a: +fn[4] / 100 } : null;
};

const over = (dot, bg) => dot.rgb.map((c, i) => c * dot.a + bg.rgb[i] * (1 - dot.a));
const lum = ([r, g, b]) => {
  const f = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const ratio = (c1, c2) => {
  const [a, b] = [lum(c1), lum(c2)].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
};

// 两组定案值：浅色在 [data-style="grid"]、暗色在 [data-theme="dark"][data-style="grid"]。
// 暗色块里的 var(--paper-ink-dark) 来自基础层，[data-style="grid"] 里则是 var(--paper-warm)。
const cases = [
  ['浅色 n3（C 点阵默认）', '#faf7f1', 'rgb(74 63 48 / 10%)', '18px'],
  ['暗色 d2（C 点阵暗色）', '#1b1917', 'rgb(255 246 232 / 11%)', '18px'],
];

console.log('定案 | 底 | 点 | 间距 | ΔRGB(均) | 对比度');
for (const [label, bgRaw, dotRaw, size] of cases) {
  const bg = parseColor(deref(bgRaw));
  const dot = parseColor(deref(dotRaw));
  const painted = over(dot, bg);
  const delta = painted.reduce((s, c, i) => s + Math.abs(c - bg.rgb[i]), 0) / 3;
  console.log(
    `${label} | ${bgRaw} | ${dotRaw} | ${size} | ${delta.toFixed(1)} | ${ratio(painted, bg.rgb).toFixed(3)}`,
  );
}

// 定案值必须与 tokens.css 里现在写的完全一致，否则脚本红掉（防止有人偷偷改回淡点）
const expected = [
  [css.includes('--paper-warm: #faf7f1;'), '--paper-warm 应为 #faf7f1'],
  [css.includes('--ink-warm: rgb(74 63 48 / 10%);'), '--ink-warm 应为 rgb(74 63 48 / 10%)'],
  [css.includes('--paper-ink-dark: #1b1917;'), '--paper-ink-dark 应为 #1b1917'],
  [css.includes('--ink-warm-dark: rgb(255 246 232 / 11%);'), '--ink-warm-dark 应为 rgb(255 246 232 / 11%)'],
  [/\[data-style="grid"\][^}]*--dot-size: 18px;/s.test(css), 'C 点阵点距应为 18px'],
  [!css.includes('--dot-major'), '试验期的 --dot-major 应已删除'],
];
let bad = 0;
for (const [ok, msg] of expected) {
  if (!ok) {
    console.error(`✗ ${msg}`);
    bad++;
  }
}
console.log(bad === 0 ? '定案值核对通过' : `${bad} 条不符`);
process.exit(bad === 0 ? 0 : 1);
